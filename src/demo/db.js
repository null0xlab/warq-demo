import { SCHEMA_SQL, SCHEMA_VERSION, TABLE_NAMES } from "./schema.js";

const DB_NAME = "idb://warq-demo";

const JSON_COLUMNS = new Set([
  "products",
  "product_names",
  "warranty_duration",
  "granted_free_access_duration",
  "access_duration",
  "details",
  "value",
  "reply_to",
  "timeline",
]);

const NUMERIC_COLUMNS = new Set([
  "default_price",
  "cost_price",
  "actual_price",
  "sticker_pack_price",
  "per_sticker_price",
  "sticker_subtotal",
  "delivery_charge",
  "total_price",
  "amount",
]);

let dbPromise = null;
const columnCache = new Map();
let activeTx = null;

export function camelToSnake(value) {
  return String(value).replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export function snakeToCamel(value) {
  return String(value).replace(/_([a-z0-9])/g, (_, letter) => letter.toUpperCase());
}

export function nowIso() {
  return new Date().toISOString();
}

export function autoId() {
  const bytes = new Uint8Array(10);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function toIso(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function rowToDoc(row) {
  if (!row) return null;
  const doc = {};
  for (const [column, raw] of Object.entries(row)) {
    const key = snakeToCamel(column);
    if (raw === null || raw === undefined) {
      doc[key] = null;
    } else if (JSON_COLUMNS.has(column)) {
      doc[key] = typeof raw === "string" ? safeParse(raw) : raw;
    } else if (NUMERIC_COLUMNS.has(column)) {
      doc[key] = Number(raw);
    } else if (raw instanceof Date) {
      doc[key] = raw.toISOString();
    } else {
      doc[key] = raw;
    }
  }
  if (doc.id && !doc.uid) doc.uid = doc.id;
  if (doc.text === undefined && doc.message !== undefined) doc.text = doc.message;
  return doc;
}

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function rowsToDocs(result) {
  return (result?.rows || []).map(rowToDoc);
}

async function bootDatabase() {
  const { PGlite } = await import("@electric-sql/pglite");
  const persistent = typeof indexedDB !== "undefined";
  const db = persistent ? new PGlite(DB_NAME) : new PGlite();
  await db.waitReady;
  let meta = null;
  try {
    const existing = await db.query("SELECT value FROM system_settings WHERE key = 'demo_meta'");
    meta = existing.rows?.[0]?.value ?? null;
  } catch {
    meta = null;
  }
  const parsedMeta = typeof meta === "string" ? safeParse(meta) : meta;
  if (parsedMeta && parsedMeta.schemaVersion && parsedMeta.schemaVersion !== SCHEMA_VERSION) {
    for (const table of TABLE_NAMES) {
      await db.exec(`DROP TABLE IF EXISTS ${table} CASCADE`);
    }
  }
  await db.exec(SCHEMA_SQL);
  return db;
}

export function getDb() {
  if (!dbPromise) {
    dbPromise = bootDatabase().catch((error) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

export async function resetDatabase() {
  await withTransaction(async () => {
    for (const table of TABLE_NAMES) {
      await exec(`DELETE FROM ${table}`);
    }
  });
}

export async function dropDatabase() {
  await withTransaction(async () => {
    for (const table of TABLE_NAMES) {
      await exec(`DROP TABLE IF EXISTS ${table} CASCADE`);
    }
    columnCache.clear();
    await exec(SCHEMA_SQL);
  });
}

export async function exec(sql) {
  if (activeTx) return activeTx.exec(sql);
  const db = await getDb();
  return db.exec(sql);
}

export async function query(sql, params = []) {
  if (activeTx) return activeTx.query(sql, params);
  const db = await getDb();
  return db.query(sql, params);
}

export async function withTransaction(work) {
  if (activeTx) return work();
  const db = await getDb();
  return db.transaction(async (tx) => {
    activeTx = tx;
    try {
      return await work();
    } finally {
      activeTx = null;
    }
  });
}

export async function docs(sql, params = []) {
  return rowsToDocs(await query(sql, params));
}

export async function doc(sql, params = []) {
  const list = await docs(sql, params);
  return list[0] || null;
}

export async function scalar(sql, params = []) {
  const result = await query(sql, params);
  const first = result.rows?.[0];
  if (!first) return null;
  return Object.values(first)[0] ?? null;
}

export async function tableColumns(table) {
  if (!columnCache.has(table)) {
    const result = await query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = $1",
      [table],
    );
    columnCache.set(table, new Set((result.rows || []).map((entry) => entry.column_name)));
  }
  return columnCache.get(table);
}

function encodeValue(value) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

export async function insert(table, data) {
  const columns = await tableColumns(table);
  const keys = Object.keys(data).filter((key) => columns.has(camelToSnake(key)));
  if (!keys.length) return null;
  const placeholders = keys.map((_, index) => `$${index + 1}`);
  const values = keys.map((key) => encodeValue(data[key]));
  const sql = `INSERT INTO ${table} (${keys.map(camelToSnake).join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`;
  const result = await query(sql, values);
  return rowsToDocs(result)[0] || null;
}

export async function updateById(table, id, data) {
  const columns = await tableColumns(table);
  const keys = Object.keys(data).filter((key) => columns.has(camelToSnake(key)) && data[key] !== undefined);
  if (!keys.length) return null;
  const sets = keys.map((key, index) => `${camelToSnake(key)} = $${index + 1}`);
  const values = keys.map((key) => encodeValue(data[key]));
  values.push(id);
  const sql = `UPDATE ${table} SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING *`;
  const result = await query(sql, values);
  return rowsToDocs(result)[0] || null;
}

export async function removeById(table, id) {
  await query(`DELETE FROM ${table} WHERE id = $1`, [id]);
}

export async function getSettings() {
  const row = await doc("SELECT * FROM system_settings WHERE key = 'settings'");
  return row?.value || null;
}

export async function setSettings(patch) {
  const current = (await getSettings()) || {};
  const next = { ...current, ...patch, updatedAt: nowIso() };
  await query(
    `INSERT INTO system_settings (key, value, updated_at) VALUES ('settings', $1, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
    [JSON.stringify(next)],
  );
  return next;
}

export async function getMeta() {
  const row = await doc("SELECT * FROM system_settings WHERE key = 'demo_meta'");
  return row?.value || null;
}

export async function setMeta(value) {
  await query(
    `INSERT INTO system_settings (key, value, updated_at) VALUES ('demo_meta', $1, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
    [JSON.stringify(value)],
  );
  return value;
}

export function hasStorage() {
  return typeof indexedDB !== "undefined";
}
