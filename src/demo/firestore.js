import { getDb, autoId } from "./db.js";

const SERVER_TIMESTAMP_SENTINEL = Object.freeze({ __warqFieldValue: "serverTimestamp" });

export const FieldValue = {
  serverTimestamp() {
    return SERVER_TIMESTAMP_SENTINEL;
  },
};

function camelToSnake(str) {
  return String(str).replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function snakeToCamel(str) {
  return String(str).replace(/_([a-z0-9])/g, (_, letter) => letter.toUpperCase());
}

const COLLECTION_TO_TABLE = {
  users: "users",
  qrGroups: "qr_groups",
  qrFolderNames: "qr_folder_names",
  stickerRequests: "sticker_requests",
  qrs: "qrs",
  sales: "sales",
  payments: "payments",
  accessRequests: "access_requests",
  notifications: "notifications",
  auditLogs: "audit_logs",
  supportThreads: "support_threads",
  supportMessages: "support_messages",
  supportImages: "support_images",
  aiChatMessages: "ai_chat_messages",
  system: "system_settings",
  adminLoginAttempts: "admin_login_attempts",
  emailVerificationTokens: "email_verification_tokens",
  claims: "claims",
};

const TABLE_COLUMNS = {
  users: new Set([
    "id", "email", "name", "shop_name", "photo_url", "bio", "mobile", "shop_address",
    "delivery_address", "same_as_shop_address", "district", "upazila", "role",
    "subscription_status", "subscription_plan", "subscription_plan_name",
    "subscription_purchased_at", "subscription_ends_at", "access_start_at",
    "access_revoked_at", "granted_free_access_duration", "access_duration",
    "unlimited_access", "disabled", "disabled_at", "banned", "created_at", "updated_at",
  ]),
  qr_groups: new Set([
    "id", "owner_id", "request_id", "folder_name", "folder_name_key", "product_name",
    "product_model", "brand_name", "product_names", "product_count", "total_qrs",
    "next_serial", "shop_name", "shop_address", "deletion_state", "deletion_aborted_at",
    "deletion_failed_at", "last_added_at", "created_at", "updated_at",
  ]),
  qr_folder_names: new Set([
    "id", "owner_id", "folder_name", "folder_name_key", "group_id", "created_at", "updated_at",
  ]),
  sticker_requests: new Set([
    "id", "owner_id", "shop_name", "shop_address", "folder_name", "folder_name_key",
    "target_group_id", "products", "product_count", "total_qr_codes", "total_sticker_quantity",
    "fulfillment", "sticker_pack_size", "sticker_pack_price", "per_sticker_price",
    "sticker_subtotal", "delivery_charge", "total_price", "status", "generation_key",
    "folder_serial_start", "generated_at", "generated_by", "generation_error",
    "generation_started_at", "generation_started_by", "generation_failed_at",
    "payment_status", "payment_id", "paid_at", "delivery_status", "upgraded_to_physical_at",
    "created_at", "updated_at",
  ]),
  qrs: new Set([
    "id", "code", "owner_id", "request_id", "group_id", "folder_name", "serial",
    "product_id", "product_name", "product_model", "brand_name", "default_price",
    "cost_price", "actual_price", "warranty_duration", "shop_name", "shop_address",
    "notes", "status", "sale_id", "customer_name", "customer_phone", "customer_email",
    "customer_address", "customer_notes", "sale_date", "sold_at", "activated_at",
    "activation_date", "activated_by", "warranty_expires_at", "warranty_voided_at",
    "returned_at", "returned_by", "return_reason", "created_at", "updated_at",
  ]),
  sales: new Set([
    "id", "owner_id", "qr_id", "code", "request_id", "product_id", "product_name",
    "product_model", "brand_name", "serial", "default_price", "cost_price",
    "actual_price", "customer_name", "customer_phone", "customer_email",
    "customer_address", "customer_notes", "sale_date", "sold_at", "activated_at",
    "activation_date", "activated_by", "warranty_duration", "warranty_expires_at",
    "warranty_voided_at", "status", "returned_at", "returned_by", "return_reason",
    "shop_name", "shop_address", "edited_by", "created_at", "updated_at",
  ]),
  payments: new Set([
    "id", "owner_id", "provider", "package_id", "package_name", "sticker_request_id",
    "kind", "currency", "amount", "status", "gateway_payment_id", "gateway_transaction_id",
    "verified_at", "created_at", "updated_at",
  ]),
  access_requests: new Set([
    "id", "owner_id", "status", "message", "resolved_at", "resolved_by", "admin_note",
    "created_at", "updated_at",
  ]),
  notifications: new Set([
    "id", "recipient_id", "title", "message", "type", "audience", "created_by",
    "read_at", "created_at",
  ]),
  audit_logs: new Set([
    "id", "actor_id", "action", "target_id", "details", "created_at",
  ]),
  support_threads: new Set([
    "id", "owner_id", "status", "subject", "last_message_at", "last_message_preview",
    "unread_by_admin", "unread_by_user", "admin_joined_at", "resolved_at", "resolved_by",
    "assigned_admin_id", "user_name", "user_email", "user_shop_name", "user_mobile",
    "created_at", "updated_at",
  ]),
  support_messages: new Set([
    "id", "thread_id", "sender_id", "sender_role", "text", "message", "image_id",
    "reply_to", "deleted", "deleted_type", "deleted_at", "edited", "edited_at", "created_at",
  ]),
  support_images: new Set([
    "id", "thread_id", "owner_id", "uploader_id", "file_name", "filename",
    "mime_type", "size", "size_bytes", "file_path", "data_url", "created_at",
  ]),
  ai_chat_messages: new Set([
    "id", "owner_id", "role", "content", "deleted", "deleted_type", "deleted_at", "created_at",
  ]),
  system_settings: new Set([
    "key", "value", "updated_at", "updated_by",
  ]),
  admin_login_attempts: new Set([
    "key", "failure_count", "window_started_at", "updated_at",
  ]),
  email_verification_tokens: new Set([
    "id", "owner_id", "email", "expires_at", "created_at",
  ]),
  claims: new Set([
    "id", "code", "owner_id", "qr_id", "qr_code", "customer_user_id", "customer_name",
    "customer_phone", "customer_email", "category", "description", "status",
    "resolution_note", "reviewed_by", "reviewed_at", "timeline", "created_at", "updated_at",
  ]),
};

const JSON_COLUMNS = new Set([
  "products", "product_names", "warranty_duration", "granted_free_access_duration",
  "access_duration", "details", "value", "reply_to", "timeline",
]);

const NUMERIC_COLUMNS = new Set([
  "default_price", "cost_price", "actual_price", "sticker_pack_price",
  "per_sticker_price", "sticker_subtotal", "delivery_charge", "total_price", "amount",
]);

function rowToDoc(row) {
  if (!row) return null;
  const doc = {};
  for (const [col, val] of Object.entries(row)) {
    if (col === "key" && row.value !== undefined) {
      return typeof row.value === "object" && row.value !== null ? { ...row.value } : row.value;
    }
    const camel = snakeToCamel(col);
    if (val === null || val === undefined) {
      doc[camel] = null;
    } else if (JSON_COLUMNS.has(col)) {
      doc[camel] = typeof val === "string" ? safeParse(val) : val;
    } else if (NUMERIC_COLUMNS.has(col)) {
      doc[camel] = Number(val);
    } else if (val instanceof Date) {
      doc[camel] = val.toISOString();
    } else {
      doc[camel] = val;
    }
  }
  if (doc.id && !doc.uid) doc.uid = doc.id;
  if (doc.text === undefined && doc.message !== undefined) doc.text = doc.message;
  if (doc.message === undefined && doc.text !== undefined) doc.message = doc.text;
  return doc;
}

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function docToRow(data, tableName = null, id = null) {
  const row = {};
  const validCols = tableName && TABLE_COLUMNS[tableName] ? TABLE_COLUMNS[tableName] : null;
  const normalizedData = { ...data };

  if (tableName === "support_messages") {
    if (normalizedData.text !== undefined && normalizedData.message === undefined) {
      normalizedData.message = normalizedData.text;
    } else if (normalizedData.message !== undefined && normalizedData.text === undefined) {
      normalizedData.text = normalizedData.message;
    }
  }

  for (const [key, rawVal] of Object.entries(normalizedData)) {
    if (key === "uid") continue;
    const col = camelToSnake(key);
    if (validCols && !validCols.has(col)) continue;

    let val = rawVal;
    if (val === SERVER_TIMESTAMP_SENTINEL || (val && val.__warqFieldValue === "serverTimestamp")) {
      val = new Date().toISOString();
    }
    if (val === undefined) {
      val = null;
    } else if (val !== null && typeof val === "object" && !(val instanceof Date)) {
      row[col] = JSON.stringify(val);
    } else if (val instanceof Date) {
      row[col] = val.toISOString();
    } else {
      row[col] = val;
    }
  }

  const keyCol = tableName === "system_settings" || tableName === "admin_login_attempts" ? "key" : "id";
  if (id && !row[keyCol]) {
    row[keyCol] = id;
  }
  return row;
}

export function createDemoDatabase() {
  function getTableName(collectionName) {
    const table = COLLECTION_TO_TABLE[collectionName];
    if (!table) throw new Error(`Unknown collection "${collectionName}". Add mapping in firestore.js.`);
    return table;
  }

  function parsePath(path) {
    const parts = String(path || "").split("/").filter(Boolean);
    if (parts.length !== 2) throw new Error(`Path must be collection/document (got "${path}").`);
    return { collectionName: parts[0], id: parts[1] };
  }

  async function rawQuery(sql, params = [], txClient = null) {
    if (txClient) return txClient.query(sql, params);
    const db = await getDb();
    return db.query(sql, params);
  }

  async function query(sql, params = []) {
    const db = await getDb();
    return db.query(sql, params);
  }

  async function transaction(handler) {
    const db = await getDb();
    return db.transaction(async (tx) =>
      handler({
        query: (sql, params) => tx.query(sql, params),
        rawQuery: (sql, params) => tx.query(sql, params),
      }),
    );
  }

  async function getDoc(collectionName, id, txClient = null) {
    const table = getTableName(collectionName);
    const keyCol = table === "system_settings" || table === "admin_login_attempts" ? "key" : "id";
    const res = await rawQuery(`SELECT * FROM ${table} WHERE ${keyCol} = $1 LIMIT 1;`, [id], txClient);
    const exists = res.rows && res.rows.length > 0;
    const data = exists ? rowToDoc(res.rows[0]) : undefined;
    return {
      id,
      exists,
      ref: docRef(collectionName, id, txClient),
      data: () => data,
    };
  }

  async function setDoc(collectionName, id, data, options = {}, txClient = null) {
    const table = getTableName(collectionName);
    const isSettings = table === "system_settings";
    const isAttempts = table === "admin_login_attempts";
    const keyCol = isSettings || isAttempts ? "key" : "id";

    if (isSettings) {
      const existing = await getDoc(collectionName, id, txClient);
      const mergedValue = options.merge && existing.exists ? { ...existing.data(), ...data } : data;
      const updatedBy = (data && data.updatedBy) || "system";
      const updatedAt = new Date().toISOString();
      const sql = `
        INSERT INTO system_settings (key, value, updated_at, updated_by)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;
      `;
      await rawQuery(sql, [id, JSON.stringify(mergedValue), updatedAt, updatedBy], txClient);
      return;
    }

    if (options.merge) {
      const existing = await getDoc(collectionName, id, txClient);
      if (existing.exists) {
        const merged = { ...existing.data(), ...data };
        const row = docToRow(merged, table, id);
        const cols = Object.keys(row).filter((c) => c !== keyCol);
        if (cols.length > 0) {
          const setClauses = cols.map((c, i) => `${c} = $${i + 2}`).join(", ");
          const params = [id, ...cols.map((c) => row[c])];
          await rawQuery(`UPDATE ${table} SET ${setClauses} WHERE ${keyCol} = $1;`, params, txClient);
        }
        return;
      }
    }

    const row = docToRow(data, table, id);
    if (!row[keyCol]) row[keyCol] = id;
    const cols = Object.keys(row);
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
    const updateClauses = cols.filter((c) => c !== keyCol).map((c) => `${c} = EXCLUDED.${c}`).join(", ");

    const sql =
      updateClauses.length > 0
        ? `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders}) ON CONFLICT (${keyCol}) DO UPDATE SET ${updateClauses};`
        : `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders}) ON CONFLICT (${keyCol}) DO NOTHING;`;

    await rawQuery(sql, cols.map((c) => row[c]), txClient);
  }

  async function updateDoc(collectionName, id, data, txClient = null) {
    const table = getTableName(collectionName);
    const keyCol = table === "system_settings" || table === "admin_login_attempts" ? "key" : "id";
    const row = docToRow(data, table);
    const cols = Object.keys(row).filter((c) => c !== keyCol);
    if (cols.length === 0) return;

    const setClauses = cols.map((c, i) => `${c} = $${i + 2}`).join(", ");
    const params = [id, ...cols.map((c) => row[c])];
    const res = await rawQuery(`UPDATE ${table} SET ${setClauses} WHERE ${keyCol} = $1;`, params, txClient);
    if (res.rowCount === 0) {
      const error = new Error(`No document to update: ${collectionName}/${id}`);
      error.code = 5;
      throw error;
    }
  }

  async function deleteDoc(collectionName, id, txClient = null) {
    const table = getTableName(collectionName);
    const keyCol = table === "system_settings" || table === "admin_login_attempts" ? "key" : "id";
    await rawQuery(`DELETE FROM ${table} WHERE ${keyCol} = $1;`, [id], txClient);
  }

  function docRef(collectionName, id = autoId(), txClient = null) {
    const path = `${collectionName}/${id}`;
    return {
      id,
      path,
      parent: { id: collectionName },
      async get() {
        return getDoc(collectionName, id, txClient);
      },
      async set(data, options = {}) {
        await setDoc(collectionName, id, data, options, txClient);
        return this;
      },
      async update(data) {
        await updateDoc(collectionName, id, data, txClient);
        return this;
      },
      async delete() {
        await deleteDoc(collectionName, id, txClient);
        return this;
      },
    };
  }

  function createQuery(collectionName, filters = [], limitCount = null, txClient = null) {
    return {
      where(field, op, value) {
        return createQuery(collectionName, [...filters, { field, op, value }], limitCount, txClient);
      },
      limit(count) {
        return createQuery(collectionName, filters, count, txClient);
      },
      async get() {
        const table = getTableName(collectionName);
        const validCols = TABLE_COLUMNS[table];
        const whereClauses = [];
        const params = [];

        for (const { field, op, value } of filters) {
          let col = camelToSnake(field);
          if (field === "userId" && (!validCols || !validCols.has("user_id"))) {
            col = table === "notifications" ? "recipient_id" : "owner_id";
          }
          if (validCols && !validCols.has(col)) {
            whereClauses.push("1 = 0");
            continue;
          }
          if (op === "==") {
            params.push(value);
            whereClauses.push(`${col} = $${params.length}`);
          } else {
            throw new Error(`Unsupported filter operator "${op}"`);
          }
        }

        let sql = `SELECT * FROM ${table}`;
        if (whereClauses.length > 0) sql += ` WHERE ${whereClauses.join(" AND ")}`;
        if (Number.isInteger(limitCount) && limitCount >= 0) sql += ` LIMIT ${limitCount}`;
        sql += ";";

        const res = await rawQuery(sql, params, txClient);
        const docs = (res.rows || []).map((row) => {
          const docId = row.id || row.key || autoId();
          const docData = rowToDoc(row);
          return {
            id: docId,
            exists: true,
            ref: docRef(collectionName, docId, txClient),
            data: () => docData,
          };
        });

        return {
          empty: docs.length === 0,
          size: docs.length,
          docs,
          forEach(callback) {
            docs.forEach(callback);
          },
        };
      },
    };
  }

  function collectionRef(collectionName, txClient = null) {
    return {
      id: collectionName,
      doc(id) {
        return docRef(collectionName, id == null || id === "" ? autoId() : String(id), txClient);
      },
      async add(data) {
        const id = autoId();
        const ref = docRef(collectionName, id, txClient);
        await ref.set(data);
        return ref;
      },
      where(field, op, value) {
        return createQuery(collectionName, [{ field, op, value }], null, txClient);
      },
      limit(count) {
        return createQuery(collectionName, [], count, txClient);
      },
      async get() {
        return createQuery(collectionName, [], null, txClient).get();
      },
    };
  }

  function batch() {
    const ops = [];
    const api = {
      set(ref, data, options = {}) {
        const { collectionName, id } = parsePath(ref.path);
        ops.push({ type: "set", collectionName, id, data, options });
        return api;
      },
      update(ref, data) {
        const { collectionName, id } = parsePath(ref.path);
        ops.push({ type: "update", collectionName, id, data });
        return api;
      },
      delete(ref) {
        const { collectionName, id } = parsePath(ref.path);
        ops.push({ type: "delete", collectionName, id });
        return api;
      },
      async commit() {
        await transaction(async (tx) => {
          for (const op of ops) {
            if (op.type === "set") await setDoc(op.collectionName, op.id, op.data, op.options, tx);
            else if (op.type === "update") await updateDoc(op.collectionName, op.id, op.data, tx);
            else if (op.type === "delete") await deleteDoc(op.collectionName, op.id, tx);
          }
        });
        ops.length = 0;
      },
    };
    return api;
  }

  async function runTransaction(handler) {
    return transaction(async (tx) => {
      const writes = [];
      const flushWrites = async () => {
        while (writes.length > 0) {
          const op = writes.shift();
          if (op.type === "set") await setDoc(op.collectionName, op.id, op.data, op.options, tx);
          else if (op.type === "update") await updateDoc(op.collectionName, op.id, op.data, tx);
          else if (op.type === "delete") await deleteDoc(op.collectionName, op.id, tx);
        }
      };

      const txApi = {
        async get(ref) {
          await flushWrites();
          const { collectionName, id } = parsePath(ref.path);
          return getDoc(collectionName, id, tx);
        },
        set(ref, data, options = {}) {
          const { collectionName, id } = parsePath(ref.path);
          writes.push({ type: "set", collectionName, id, data, options });
          return txApi;
        },
        update(ref, data) {
          const { collectionName, id } = parsePath(ref.path);
          writes.push({ type: "update", collectionName, id, data });
          return txApi;
        },
        delete(ref) {
          const { collectionName, id } = parsePath(ref.path);
          writes.push({ type: "delete", collectionName, id });
          return txApi;
        },
      };

      const result = await handler(txApi);
      await flushWrites();
      return result;
    });
  }

  async function stats() {
    const tables = [
      "users", "qr_groups", "qrs", "sales", "sticker_requests",
      "payments", "access_requests", "notifications", "audit_logs",
      "support_threads", "support_messages", "ai_chat_messages", "claims",
    ];
    const counts = {};
    for (const t of tables) {
      try {
        const res = await query(`SELECT COUNT(*) AS count FROM ${t};`);
        counts[t] = parseInt(res.rows[0]?.count || "0", 10);
      } catch {
        counts[t] = 0;
      }
    }
    return counts;
  }

  return {
    query,
    transaction,
    collection: (name) => collectionRef(name),
    doc: (path) => {
      const { collectionName, id } = parsePath(path);
      return docRef(collectionName, id);
    },
    batch,
    runTransaction,
    stats,
  };
}

export { rowToDoc, docToRow, camelToSnake, snakeToCamel, COLLECTION_TO_TABLE, TABLE_COLUMNS, JSON_COLUMNS, NUMERIC_COLUMNS };
