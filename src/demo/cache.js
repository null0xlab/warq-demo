const memoryStore = new Map();

function read(key) {
  const hit = memoryStore.get(key);
  if (!hit) return null;
  if (hit.expiresAt && Date.now() > hit.expiresAt) {
    memoryStore.delete(key);
    return null;
  }
  return hit.value;
}

export const cache = {
  isRedisReady: false,
  get isReady() {
    return false;
  },
  async get(key) {
    return read(key);
  },
  async set(key, value, ttlSeconds = null) {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    memoryStore.set(key, { value, expiresAt });
    return true;
  },
  async del(key) {
    memoryStore.delete(key);
    return true;
  },
  async flush() {
    memoryStore.clear();
    return true;
  },
  async rateLimit(key, maxAttempts = 5, windowMs = 900000) {
    const now = Date.now();
    const rateKey = `ratelimit:${key}`;
    const record = (await read(rateKey)) || { count: 0, windowStartedAt: now };
    if (now - record.windowStartedAt > windowMs) {
      record.count = 1;
      record.windowStartedAt = now;
    } else {
      record.count += 1;
    }
    await this.set(rateKey, record, Math.ceil(windowMs / 1000));
    return {
      allowed: record.count <= maxAttempts,
      remaining: Math.max(0, maxAttempts - record.count),
      count: record.count,
      windowStartedAt: record.windowStartedAt,
    };
  },
  async disconnect() {
    memoryStore.clear();
    return true;
  },
};

export default cache;
