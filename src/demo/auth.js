const ACCOUNTS_KEY = "warq.demo.accounts.v1";
const SESSION_KEY = "warq.demo.session.v1";
const ADMIN_SESSION_KEY = "warq.demo.admin-session.v1";
const PENDING_KEY = "warq.demo.pending.v1";
const SEED_KEY = "warq.demo.seeded.v1";

const PBKDF2_ITERATIONS = 150000;
const WEAK_ITERATIONS = 12000;

const memoryStore = new Map();

function storageGet(key) {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? memoryStore.get(key) ?? null : value;
  } catch {
    return memoryStore.get(key) ?? null;
  }
}

function storageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    memoryStore.set(key, value);
  }
}

function storageRemove(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    memoryStore.delete(key);
  }
}

function readJson(key, fallback) {
  const raw = storageGet(key);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  storageSet(key, JSON.stringify(value));
}

function randomHex(bytes = 16) {
  const buffer = new Uint8Array(bytes);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(buffer);
  } else {
    for (let index = 0; index < buffer.length; index += 1) {
      buffer[index] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(buffer, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToHex(bytes) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function canUseSubtle() {
  return Boolean(typeof crypto !== "undefined" && crypto.subtle && crypto.subtle.deriveBits);
}

function weakHash(password, saltHex, iterations) {
  let accumulator = 0x811c9dc5;
  const material = `${saltHex}:${password}`;
  for (let round = 0; round < iterations; round += 1) {
    for (let index = 0; index < material.length; index += 1) {
      accumulator ^= material.charCodeAt(index) + round;
      accumulator = Math.imul(accumulator, 0x01000193) >>> 0;
    }
  }
  return `weak${accumulator.toString(16)}`;
}

async function strongHash(password, saltHex, iterations) {
  const encoder = new TextEncoder();
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map((byte) => parseInt(byte, 16)));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    256,
  );
  return bytesToHex(bits);
}

async function hashPassword(password, saltHex) {
  if (canUseSubtle()) {
    return { algo: "pbkdf2-sha256", iterations: PBKDF2_ITERATIONS, hash: await strongHash(password, saltHex, PBKDF2_ITERATIONS) };
  }
  return { algo: "demo-weak", iterations: WEAK_ITERATIONS, hash: weakHash(password, saltHex, WEAK_ITERATIONS) };
}

async function verifyPassword(password, account) {
  if (!account) return false;
  if (account.algo === "pbkdf2-sha256" && canUseSubtle()) {
    const candidate = await strongHash(password, account.salt, account.iterations);
    return candidate === account.hash;
  }
  const candidate = weakHash(password, account.salt, account.iterations || WEAK_ITERATIONS);
  return candidate === account.hash;
}

export function listAccounts() {
  return readJson(ACCOUNTS_KEY, {});
}

function writeAccounts(accounts) {
  writeJson(ACCOUNTS_KEY, accounts);
}

export async function upsertCredential({ uid, email, password, emailVerified = true, role = "merchant", adminId = null }) {
  const accounts = listAccounts();
  const normalized = String(email || "").trim().toLowerCase();
  const salt = randomHex(16);
  const derived = await hashPassword(password, salt);
  accounts[normalized] = {
    uid,
    email: normalized,
    salt,
    hash: derived.hash,
    algo: derived.algo,
    iterations: derived.iterations,
    emailVerified: Boolean(emailVerified),
    role,
    adminId,
    createdAt: new Date().toISOString(),
  };
  writeAccounts(accounts);
  return accounts[normalized];
}

export async function upsertCredentials(entries) {
  const accounts = listAccounts();
  const list = Array.isArray(entries) ? entries : [];
  const prepared = await Promise.all(
    list.map(async (entry) => {
      const normalized = String(entry.email || "").trim().toLowerCase();
      const salt = randomHex(16);
      const derived = await hashPassword(entry.password, salt);
      const account = {
        uid: entry.uid,
        email: normalized,
        salt,
        hash: derived.hash,
        algo: derived.algo,
        iterations: derived.iterations,
        emailVerified: Boolean(entry.emailVerified ?? true),
        role: entry.role || "merchant",
        adminId: entry.adminId ?? null,
        createdAt: new Date().toISOString(),
      };
      return [normalized, account];
    }),
  );
  for (const [normalized, account] of prepared) {
    accounts[normalized] = account;
  }
  writeAccounts(accounts);
  return accounts;
}

export function markSeeded(value) {
  writeJson(SEED_KEY, Boolean(value));
}
export function isSeeded() {
  return readJson(SEED_KEY, false);
}

const listeners = new Set();
const adminListeners = new Set();
const eventListeners = new Set();

function emitEvent(payload) {
  eventListeners.forEach((listener) => {
    try {
      listener(payload);
    } catch {
      void 0;
    }
  });
}

export function onDemoAuthEvent(listener) {
  eventListeners.add(listener);
  return () => eventListeners.delete(listener);
}

function accountByUid(uid) {
  const accounts = listAccounts();
  return Object.values(accounts).find((account) => account.uid === uid) || null;
}

function accountByEmail(email) {
  return listAccounts()[String(email || "").trim().toLowerCase()] || null;
}

function buildUser(account, extra = {}) {
  if (!account) return null;
  return {
    uid: account.uid,
    email: account.email,
    emailVerified: Boolean(account.emailVerified),
    displayName: extra.displayName || "",
    photoURL: extra.photoURL || "",
    isAnonymous: false,
    providerData: [{ providerId: "password", uid: account.email }],
    getIdToken: async () => `demo.${account.uid}.${Date.now()}`,
    getIdTokenResult: async () => ({ token: `demo.${account.uid}`, claims: { admin: false } }),
    reload: async () => reloadUser(),
  };
}

function currentUserAccount() {
  const session = readJson(SESSION_KEY, null);
  if (!session?.uid) return null;
  return accountByUid(session.uid);
}

function currentAdminAccount() {
  const session = readJson(ADMIN_SESSION_KEY, null);
  if (!session?.uid) return null;
  return accountByUid(session.uid);
}

export const auth = {
  name: "warq-demo",
  get currentUser() {
    return buildUser(currentUserAccount());
  },
};

export const adminAuth = {
  name: "warq-demo-admin",
  get currentUser() {
    return buildUser(currentAdminAccount());
  },
};

export function onAuthStateChanged(authInstance, callback) {
  const isAdmin = authInstance === adminAuth;
  const bucket = isAdmin ? adminListeners : listeners;
  bucket.add(callback);
  Promise.resolve().then(() => {
    callback(isAdmin ? adminAuth.currentUser : auth.currentUser);
  });
  return () => bucket.delete(callback);
}

function notifyAll() {
  listeners.forEach((listener) => listener(auth.currentUser));
  adminListeners.forEach((listener) => listener(adminAuth.currentUser));
}

export async function registerWithEmail(email, password) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    const error = new Error("Provide a valid email address.");
    error.code = "auth/invalid-email";
    throw error;
  }
  if (String(password || "").length < 8) {
    const error = new Error("Use a password with at least 8 characters.");
    error.code = "auth/weak-password";
    throw error;
  }
  if (accountByEmail(normalized)) {
    const error = new Error("An account already uses this email address.");
    error.code = "auth/email-already-in-use";
    throw error;
  }
  const uid = `u-${randomHex(10)}`;
  await upsertCredential({ uid, email: normalized, password, emailVerified: false, role: "merchant" });
  writeJson(SESSION_KEY, { uid, createdAt: new Date().toISOString() });
  const account = accountByUid(uid);
  emitEvent({ type: "otp", purpose: "verify-email", email: normalized, code: await issueCode(uid, "verify-email", normalized) });
  notifyAll();
  return buildUser(account);
}

export async function signInWithEmail(email, password) {
  const account = accountByEmail(email);
  if (!account || !(await verifyPassword(password, account))) {
    const error = new Error("Invalid email or password.");
    error.code = "auth/invalid-credential";
    throw error;
  }
  if (account.adminId) {
    const error = new Error("Use the administrator sign-in form for this account.");
    error.code = "auth/invalid-credential";
    throw error;
  }
  writeJson(SESSION_KEY, { uid: account.uid, createdAt: new Date().toISOString() });
  notifyAll();
  return buildUser(account);
}

export async function signInDemoUid(uid) {
  const account = accountByUid(uid);
  if (!account) {
    const error = new Error("This demo account is not available. Reset demo data and try again.");
    error.code = "auth/user-not-found";
    throw error;
  }
  writeJson(SESSION_KEY, { uid: account.uid, createdAt: new Date().toISOString() });
  notifyAll();
  return buildUser(account);
}

export async function signInAdminWithPassword(adminId, password) {
  const accounts = listAccounts();
  const account = Object.values(accounts).find(
    (entry) => entry.adminId && entry.adminId.toLowerCase() === String(adminId || "").trim().toLowerCase(),
  );
  if (!account || !(await verifyPassword(password, account))) {
    const error = new Error("Invalid administrator ID or password.");
    error.code = "auth/invalid-credential";
    throw error;
  }
  writeJson(ADMIN_SESSION_KEY, { uid: account.uid, createdAt: new Date().toISOString() });
  notifyAll();
  return buildUser(account);
}

export async function signInAdminWithToken(token) {
  const uid = String(token || "").replace(/^demo-admin\./, "");
  const account = accountByUid(uid);
  if (!account) {
    const error = new Error("Administrator session could not be restored.");
    error.code = "auth/invalid-custom-token";
    throw error;
  }
  writeJson(ADMIN_SESSION_KEY, { uid: account.uid, createdAt: new Date().toISOString() });
  notifyAll();
  return buildUser(account);
}

export function signOutUser() {
  storageRemove(SESSION_KEY);
  notifyAll();
  return Promise.resolve();
}

export function signOutAdmin() {
  storageRemove(ADMIN_SESSION_KEY);
  notifyAll();
  return Promise.resolve();
}

export async function reloadUser(user) {
  const uid =
    user?.uid ||
    currentUserAccount()?.uid ||
    currentAdminAccount()?.uid ||
    (typeof user === "string" ? user : null);
  const account = accountByUid(uid);
  if (!account) {
    const error = new Error("Please sign in first.");
    error.code = "auth/no-current-user";
    throw error;
  }
  if (!account.emailVerified && peekPendingCode("verify-email", account.uid)) {
    verifyEmailImmediately(account.uid);
  }
  return buildUser(accountByUid(uid));
}

async function issueCode(uid, purpose, email) {
  const pending = readJson(PENDING_KEY, {});
  const code = String(Math.floor(100000 + Math.random() * 900000));
  pending[`${purpose}:${uid}`] = {
    code,
    purpose,
    uid,
    email,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  };
  writeJson(PENDING_KEY, pending);
  return code;
}

export function peekPendingCode(purpose, uid) {
  const pending = readJson(PENDING_KEY, {});
  return pending[`${purpose}:${uid}`] || null;
}

export async function sendClientVerificationEmail() {
  const account = currentUserAccount();
  if (!account) {
    const error = new Error("Please sign in first.");
    error.code = "auth/no-current-user";
    throw error;
  }
  const code = await issueCode(account.uid, "verify-email", account.email);
  emitEvent({ type: "otp", purpose: "verify-email", email: account.email, code });
  return { sent: true, demoCode: code };
}

export async function sendClientPasswordResetEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    const error = new Error("Provide a valid email address.");
    error.code = "auth/invalid-email";
    throw error;
  }
  const account = accountByEmail(normalized);
  if (!account) {
    emitEvent({
      type: "notice",
      tone: "error",
      title: "No demo account for that email",
      message: `WarQ demo has no account for ${normalized}. Use one of the seeded logins shown on the sign-in screen.`,
    });
    return { sent: true, unknownAccount: true };
  }
  const code = await issueCode(account.uid, "password-reset", normalized);
  emitEvent({ type: "otp", purpose: "password-reset", email: normalized, code });
  return { sent: true, demoCode: code };
}

export async function applyEmailVerificationCode(code) {
  const value = String(code || "").trim();
  const accounts = listAccounts();
  const pending = readJson(PENDING_KEY, {});
  const entry = Object.values(pending).find(
    (item) => item.purpose === "verify-email" && (item.code === value || value.startsWith(item.uid)),
  );
  const account = entry ? accounts[entry.email] : null;
  if (!account) {
    const error = new Error("That verification code is not valid. Request a new one.");
    error.code = "auth/invalid-action-code";
    throw error;
  }
  account.emailVerified = true;
  writeAccounts(accounts);
  notifyAll();
  return { verified: true };
}

export async function completePasswordReset(email, code, newPassword) {
  const normalized = String(email || "").trim().toLowerCase();
  const accounts = listAccounts();
  const account = accounts[normalized];
  if (!account) throw new Error("No demo account matches that email address.");
  const entry = peekPendingCode("password-reset", account.uid);
  if (!entry || entry.code !== String(code || "").trim()) {
    throw new Error("That reset code is not correct.");
  }
  if (new Date(entry.expiresAt).getTime() < Date.now()) {
    throw new Error("That reset code has expired. Request a new one.");
  }
  if (String(newPassword || "").length < 8) {
    throw new Error("Use a password with at least 8 characters.");
  }
  const salt = randomHex(16);
  const derived = await hashPassword(newPassword, salt);
  account.salt = salt;
  account.hash = derived.hash;
  account.algo = derived.algo;
  account.iterations = derived.iterations;
  writeAccounts(accounts);
  const pending = readJson(PENDING_KEY, {});
  delete pending[`password-reset:${account.uid}`];
  writeJson(PENDING_KEY, pending);
  emitEvent({
    type: "notice",
    tone: "success",
    title: "Password updated",
    message: `The password for ${normalized} was changed in this browser.`,
  });
  return { ok: true };
}

export function verifyEmailImmediately(uid) {
  const accounts = listAccounts();
  const account = Object.values(accounts).find((entry) => entry.uid === uid);
  if (!account) return false;
  account.emailVerified = true;
  writeAccounts(accounts);
  notifyAll();
  return true;
}

export function verifyEmailsImmediately(uids) {
  const accounts = listAccounts();
  const wanted = new Set(Array.isArray(uids) ? uids : []);
  let changed = false;
  for (const account of Object.values(accounts)) {
    if (wanted.has(account.uid) && !account.emailVerified) {
      account.emailVerified = true;
      changed = true;
    }
  }
  if (changed) {
    writeAccounts(accounts);
    notifyAll();
  }
  return changed;
}

export function sessionsSnapshot() {
  return {
    user: readJson(SESSION_KEY, null),
    admin: readJson(ADMIN_SESSION_KEY, null),
  };
}
