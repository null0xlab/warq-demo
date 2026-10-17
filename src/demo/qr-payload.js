import { absoluteUrl } from "./config.js";

const registry = new Map();

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

export function crc32(text) {
  const bytes = new TextEncoder().encode(String(text));
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
}

export function compactRecord(record) {
  const duration = record?.warrantyDuration || null;
  return [
    record?.code || "",
    record?.productName || "",
    record?.productModel || "",
    record?.brandName || "",
    record?.shopName || "",
    record?.status || "generated",
    record?.warrantyStatus || "",
    record?.soldAt || record?.activatedAt || record?.activationDate || "",
    record?.warrantyExpiresAt || "",
    duration
      ? [duration.months || 0, duration.days || 0, duration.hours || 0, duration.minutes || 0, duration.seconds || 0]
      : null,
    record?.actualPrice === null || record?.actualPrice === undefined ? null : Number(record.actualPrice),
    record?.phoneLast4 || "",
  ];
}

export function expandRecord(compact) {
  const durationParts = compact?.[9] || null;
  const duration = durationParts
    ? {
        months: durationParts[0] || 0,
        days: durationParts[1] || 0,
        hours: durationParts[2] || 0,
        minutes: durationParts[3] || 0,
        seconds: durationParts[4] || 0,
      }
    : null;
  const hasDuration = duration && Object.values(duration).some((value) => value > 0);
  const soldAt = compact?.[7] || "";
  return {
    code: compact?.[0] || "",
    productName: compact?.[1] || "",
    productModel: compact?.[2] || "",
    brandName: compact?.[3] || "",
    shopName: compact?.[4] || "",
    status: compact?.[5] || "generated",
    warrantyStatus: compact?.[6] || "",
    activated: Boolean(soldAt),
    soldAt,
    activatedAt: soldAt,
    purchaseAt: soldAt,
    warrantyExpiresAt: compact?.[8] || "",
    warrantyDuration: hasDuration ? duration : null,
    actualPrice: compact?.[10] === null || compact?.[10] === undefined ? null : Number(compact[10]),
    phoneLast4: compact?.[11] || "",
    offlineRecord: true,
  };
}

function bytesToBase64Url(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value) {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function deflate(text) {
  if (typeof CompressionStream === "undefined") return null;
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).text();
}

export async function encodeRecord(record) {
  const json = JSON.stringify(compactRecord(record));
  const compressed = await deflate(json);
  if (compressed) return `1${bytesToBase64Url(compressed)}`;
  return `0${bytesToBase64Url(new TextEncoder().encode(json))}`;
}

export async function decodeRecord(token) {
  const value = String(token || "");
  if (!value) return null;
  const flag = value.slice(0, 1);
  const body = value.slice(1);
  if (!body) return null;
  const bytes = base64UrlToBytes(body);
  const json = flag === "1" ? await inflate(bytes) : new TextDecoder().decode(bytes);
  return expandRecord(JSON.parse(json));
}

export async function registerQrRecords(records, onProgress) {
  const list = records || [];
  let done = 0;
  for (const record of list) {
    if (!record?.code) continue;
    try {
      const encoded = await encodeRecord(record);
      registry.set(record.code, { encoded, checksum: crc32(encoded) });
    } catch {
      registry.delete(record.code);
    }
    done += 1;
    if (typeof onProgress === "function") onProgress(done / Math.max(1, list.length));
  }
}

export function registerQrRecord(record) {
  if (!record?.code) return;
  encodeRecord(record)
    .then((encoded) => registry.set(record.code, { encoded, checksum: crc32(encoded) }))
    .catch(() => registry.delete(record.code));
}

export function forgetQrRecord(code) {
  registry.delete(code);
}

export function qrScanUrl(code) {
  const base = absoluteUrl(`scan/${encodeURIComponent(code)}`);
  const cached = registry.get(code);
  if (!cached) return base;
  return `${base}?d=${cached.encoded}&k=${cached.checksum}`;
}

export function readPayloadFromLocation() {
  const search = typeof window === "undefined" ? "" : window.location.search || "";
  const hash = typeof window === "undefined" ? "" : window.location.hash || "";
  const sources = [search.replace(/^\?/, "")];
  const hashQueryIndex = hash.indexOf("?");
  if (hashQueryIndex >= 0) sources.push(hash.slice(hashQueryIndex + 1));
  for (const source of sources) {
    if (!source) continue;
    const params = new URLSearchParams(source);
    if (params.get("d")) {
      return { d: params.get("d"), k: params.get("k") || "" };
    }
  }
  return null;
}

export async function readOfflineQrRecord() {
  const payload = readPayloadFromLocation();
  if (!payload?.d) return null;
  try {
    const record = await decodeRecord(payload.d);
    if (!record) return null;
    const expected = crc32(payload.d);
    return { record, checksumOk: !payload.k || payload.k === expected, checksum: payload.k, expected };
  } catch {
    return null;
  }
}
