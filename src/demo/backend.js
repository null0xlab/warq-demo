import { createDemoDatabase, FieldValue } from "./firestore.js";
import { cache } from "./cache.js";
import { autoId } from "./db.js";
import {
  auth,
  adminAuth,
  signInAdminWithPassword,
  sendClientVerificationEmail,
  sendClientPasswordResetEmail,
  applyEmailVerificationCode,
} from "./auth.js";
import { sandboxPayUrl } from "./config.js";
import {
  WHATSAPP_NUMBER,
  WARQ_SYSTEM_PROMPT,
  WARQ_AI_MODEL,
  callAiProxy,
  offlineAssistantReply,
  buildAiInsights,
} from "./ai.js";
import { reseedEverything, seedSummary } from "./seed.js";

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const db = createDemoDatabase();
const SETTINGS = "system/settings";
const DEFAULT_PRICING = { stickerPackSize: 300, stickerPackPrice: 50, deliveryCharge: 120 };
const SERVER_PLANS = {
  monthly: { id: "monthly", label: "1 Month", name: "1 Month", amount: 50, months: 1 },
  halfYearly: { id: "halfYearly", label: "6 Months", name: "6 Months", amount: 200, months: 6 },
  yearly: { id: "yearly", label: "1 Year", name: "1 Year", amount: 350, months: 12 },
};
const WAITING_BANNER =
  "Your support request has been received. Please describe your problem in detail and upload any relevant screenshots or images. The administrator will review your request and respond as soon as they are available.";
const CHAT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const DASHBOARD_CACHE_MS = 15000;
const SANDBOX_CARDS = {
  bkash: {
    success: { number: "01700000000", pin: "1234" },
    failure: { number: "01700000001", pin: "0000" },
  },
  nagad: {
    success: { number: "01800000000", pin: "1234" },
    failure: { number: "01800000001", pin: "0000" },
  },
};
const ALLOWED_IMAGE_TYPES = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

function fail(status, code, message) {
  throw new ApiError(status, code, message);
}

const now = () => new Date().toISOString();

const round = (value) => Math.round(Number(value || 0) * 100) / 100;

function plain(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(plain);
  if (typeof value === "object") {
    if (typeof value.toDate === "function") return value.toDate().toISOString();
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]));
  }
  return value;
}

function money(value, field, optional = false) {
  if (optional && (value == null || value === "")) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100000000) {
    fail(400, "invalid-argument", `Provide a valid ${field}.`);
  }
  return Math.round(number * 100) / 100;
}

function whole(value, field, min = 0, max = 100000) {
  if (value == null || value === "") return min;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    fail(400, "invalid-argument", `Provide a valid ${field}.`);
  }
  return number;
}

function text(value, field, max = 300) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    fail(400, "invalid-argument", `Provide a valid ${field}.`);
  }
  return value.trim();
}

function optionalText(value, max = 1000) {
  if (value == null || value === "") return "";
  if (typeof value !== "string" || value.trim().length > max) {
    fail(400, "invalid-argument", "Invalid text value.");
  }
  return value.trim();
}

function stableHex(value) {
  const source = String(value);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  let h3 = 0x9e3779b9;
  let h4 = 0x85ebca6b;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + code + index, 0x85ebca6b) >>> 0;
    h3 = Math.imul(h3 ^ (code + index), 0xc2b2ae35) >>> 0;
    h4 = (Math.imul(h4, 31) + code) >>> 0;
  }
  const part = (value) => (value >>> 0).toString(16).padStart(8, "0");
  return `${part(h1)}${part(h2)}${part(h3)}${part(h4)}`;
}

function isValidBdPhoneNumber(phone) {
  if (typeof phone !== "string") return false;
  const cleaned = phone.trim().replace(/[\s\-()]/g, "");
  return /^(?:\+?8801|01)[3-9]\d{8}$/.test(cleaned);
}

function formatBdPhoneNumber(phone) {
  if (typeof phone !== "string") return "";
  const cleaned = phone.trim().replace(/[\s\-()]/g, "");
  if (/^01[3-9]\d{8}$/.test(cleaned)) return cleaned;
  if (/^\+8801[3-9]\d{8}$/.test(cleaned)) return `0${cleaned.slice(4)}`;
  if (/^8801[3-9]\d{8}$/.test(cleaned)) return `0${cleaned.slice(3)}`;
  return cleaned;
}

function warranty(input, oldMonths = 0) {
  const source = input && typeof input === "object" ? input : { months: oldMonths || 0 };
  const value = {
    months: whole(source.months, "warranty months", 0, 1200),
    days: whole(source.days, "warranty days", 0, 365000),
    hours: whole(source.hours, "warranty hours", 0, 1000000),
    minutes: whole(source.minutes, "warranty minutes", 0, 10000000),
    seconds: whole(source.seconds, "warranty seconds", 0, 100000000),
  };
  return Object.values(value).some(Boolean) ? value : null;
}

function qrWarranty(qr) {
  return warranty(qr?.warrantyDuration, qr?.warrantyMonths);
}

function warrantyEnd(start, duration) {
  if (!duration) return null;
  const end = new Date(start);
  end.setMonth(end.getMonth() + duration.months);
  end.setDate(end.getDate() + duration.days);
  end.setHours(end.getHours() + duration.hours);
  end.setMinutes(end.getMinutes() + duration.minutes);
  end.setSeconds(end.getSeconds() + duration.seconds);
  return end.toISOString();
}

function isReturned(record) {
  return record?.status === "returned";
}

function isNetSale(sale) {
  return sale && !isReturned(sale);
}

function warrantyState(qr) {
  if (isReturned(qr)) return "voided";
  if (!qrWarranty(qr)) return "no_warranty";
  if (qr.status !== "activated") return "pending_activation";
  return new Date(qr.warrantyExpiresAt).getTime() > Date.now() ? "active" : "expired";
}

function customerWarrantyState(qr, atMs = Date.now()) {
  if (isReturned(qr)) return "voided";
  if (!qrWarranty(qr)) return "no_warranty";
  if (qr.status !== "activated") return "pending_activation";
  if (!qr.warrantyExpiresAt) return "pending_activation";
  return new Date(qr.warrantyExpiresAt).getTime() > atMs ? "active" : "expired";
}

function formatDurationLabel(duration) {
  if (!duration) return "Custom Access";
  const parts = [];
  if (duration.days) parts.push(`${duration.days} Day${duration.days === 1 ? "" : "s"}`);
  if (duration.hours) parts.push(`${duration.hours} Hour${duration.hours === 1 ? "" : "s"}`);
  if (duration.minutes) parts.push(`${duration.minutes} Minute${duration.minutes === 1 ? "" : "s"}`);
  if (duration.seconds) parts.push(`${duration.seconds} Second${duration.seconds === 1 ? "" : "s"}`);
  return parts.join(" ") || "0 Seconds";
}

function activeAccess(user) {
  return Boolean(
    !user?.disabled &&
      !user?.banned &&
      (user?.unlimitedAccess ||
        (user?.subscriptionEndsAt && new Date(user.subscriptionEndsAt).getTime() > Date.now())),
  );
}

function hasRequiredProfile(user) {
  return Boolean(
    user?.name?.trim() &&
      user?.shopName?.trim() &&
      user?.mobile?.trim() &&
      isValidBdPhoneNumber(user.mobile) &&
      user?.shopAddress?.trim() &&
      user?.deliveryAddress?.trim() &&
      user?.district?.trim() &&
      user?.upazila?.trim(),
  );
}

function requireRequiredProfile(user) {
  if (!hasRequiredProfile(user)) {
    fail(
      412,
      "failed-precondition",
      "Please complete all required profile fields (Full Name, Shop Name, valid Bangladeshi Phone Number, Shop Address, Delivery Address, District, and Upazila) before using QR features.",
    );
  }
}

function publicQr(qr) {
  const duration = qrWarranty(qr);
  return {
    code: qr.code,
    serial: qr.serial,
    productId: qr.productId || null,
    productName: qr.productName,
    productModel: qr.productModel || null,
    brandName: qr.brandName || null,
    productPrice: qr.actualPrice ?? qr.defaultPrice ?? null,
    actualPrice: qr.actualPrice ?? null,
    defaultPrice: qr.defaultPrice ?? null,
    costPrice: qr.costPrice ?? null,
    shopName: qr.shopName || "",
    shopAddress: qr.shopAddress || "",
    customerName: qr.customerName || null,
    customerPhone: qr.customerPhone || null,
    customerEmail: qr.customerEmail || null,
    customerAddress: qr.customerAddress || null,
    customerNotes: qr.customerNotes || null,
    saleDate: qr.saleDate || null,
    soldAt: qr.soldAt || qr.saleDate || null,
    activationDate: qr.activatedAt || qr.activationDate || null,
    activatedAt: qr.activatedAt || qr.activationDate || null,
    warrantyDuration: duration,
    warrantyExpiresAt: qr.warrantyExpiresAt || null,
    returnedAt: qr.returnedAt || null,
    returnReason: qr.returnReason || "",
    warrantyVoidedAt: qr.warrantyVoidedAt || null,
    status: qr.status,
    warrantyStatus: warrantyState({ ...qr, warrantyDuration: duration }),
    notes: qr.notes || "",
  };
}

function customerFacingQr(qr, atMs = Date.now()) {
  const duration = qrWarranty(qr);
  const status = qr.status || "generated";
  const activated = status === "activated" || Boolean(qr.activatedAt || qr.activationDate);
  const purchaseAt = qr.soldAt || qr.saleDate || qr.activatedAt || qr.activationDate || null;
  const activatedAt = qr.activatedAt || qr.activationDate || null;
  const warrantyStatus = customerWarrantyState({ ...qr, warrantyDuration: duration }, atMs);
  const payload = {
    code: qr.code,
    productName: qr.productName || "",
    productModel: qr.productModel || null,
    brandName: qr.brandName || null,
    shopName: qr.shopName || "",
    status,
    warrantyStatus,
    activated: Boolean(activated && status !== "returned"),
  };
  if (activated && status !== "returned") {
    payload.actualPrice = qr.actualPrice ?? null;
    payload.purchaseAt = purchaseAt;
    payload.activatedAt = activatedAt;
  }
  if (duration) {
    payload.warrantyDuration = duration;
    if (activated && status !== "returned") {
      payload.warrantyExpiresAt = qr.warrantyExpiresAt || null;
    }
  }
  return payload;
}

function pricingFrom(data = {}) {
  const stickerPackSize = Number(data.stickerPackSize) > 0 ? Number(data.stickerPackSize) : DEFAULT_PRICING.stickerPackSize;
  const stickerPackPrice = Number(data.stickerPackPrice) >= 0 ? Number(data.stickerPackPrice) : DEFAULT_PRICING.stickerPackPrice;
  const deliveryCharge = Number(data.deliveryCharge) >= 0 ? Number(data.deliveryCharge) : DEFAULT_PRICING.deliveryCharge;
  return { stickerPackSize, stickerPackPrice, perStickerPrice: stickerPackPrice / stickerPackSize, deliveryCharge };
}

async function pricing() {
  const cached = await cache.get("pricing:current");
  if (cached) return cached;
  const value = pricingFrom((await db.doc(SETTINGS).get()).data());
  await cache.set("pricing:current", value, 60);
  return value;
}

function products(data) {
  const items =
    Array.isArray(data.products) && data.products.length
      ? data.products
      : [
          {
            productName: data.productName,
            productModel: data.productModel,
            brandName: data.brandName,
            quantity: data.quantity,
            defaultPrice: data.defaultPrice,
            costPrice: data.costPrice,
            warrantyDuration: data.warrantyDuration || { months: data.warrantyMonths },
            notes: data.notes,
          },
        ];
  if (items.length !== 1) fail(400, "invalid-argument", "Create one product-model folder per QR request.");
  return items.map((item, index) => ({
    id: `P${index + 1}`,
    productName: text(item?.productName, "product name", 160),
    productModel: text(item?.productModel, "product model", 160),
    brandName: text(item?.brandName, "company or brand name", 160),
    quantity: whole(item?.quantity, "QR quantity", 1, 50000),
    defaultPrice: money(item?.defaultPrice, "product price", true),
    costPrice: money(item?.costPrice, "product cost", true),
    warrantyDuration: warranty(item?.warrantyDuration, item?.warrantyMonths),
    notes: optionalText(item?.notes, 1000),
  }));
}

function normalizeFolderName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function folderNameRef(ownerId, key) {
  return db.doc(`qrFolderNames/${stableHex(`${ownerId}:${key}`)}`);
}

async function releaseFolderName(group, ownerId) {
  const key = group?.folderNameKey || normalizeFolderName(group?.folderName);
  if (key) await folderNameRef(ownerId, key).delete().catch(() => {});
}

function accessDuration(data) {
  const source = data.duration && typeof data.duration === "object" ? data.duration : { minutes: data.durationMinutes };
  const duration = {
    days: whole(source.days, "access days", 0, 36500),
    hours: whole(source.hours, "access hours", 0, 100000),
    minutes: whole(source.minutes, "access minutes", 0, 1000000),
    seconds: whole(source.seconds, "access seconds", 0, 10000000),
  };
  const seconds = duration.days * 86400 + duration.hours * 3600 + duration.minutes * 60 + duration.seconds;
  if (!seconds) fail(400, "invalid-argument", "Set an access duration greater than zero.");
  return { duration, seconds };
}

function isAdmin(token) {
  return token.admin === true && token.adminConsole === true;
}

function currentIdentity() {
  const user = auth.currentUser;
  if (user) {
    return { uid: user.uid, email: user.email || "", emailVerified: Boolean(user.emailVerified) };
  }
  const admin = adminAuth.currentUser;
  if (admin) {
    return { uid: admin.uid, email: admin.email || "", emailVerified: Boolean(admin.emailVerified) };
  }
  return null;
}

function resolveIdentity(options) {
  if (options && Object.prototype.hasOwnProperty.call(options, "identity")) return options.identity;
  return currentIdentity();
}

function tokenFor(identity) {
  if (!identity || !identity.uid) fail(401, "unauthenticated", "Please sign in first.");
  return {
    uid: identity.uid,
    email: String(identity.email || ""),
    email_verified: identity.emailVerified !== false,
    name: identity.name || "",
    picture: identity.picture || "",
    firebase: { sign_in_provider: "password" },
    admin: false,
    adminConsole: false,
  };
}

function verified() {
  return undefined;
}

function configured() {
  return undefined;
}

async function ensureUser(token) {
  const ref = db.doc(`users/${token.uid}`);
  const snap = await ref.get();
  const tokenEmail = String(token.email || "").trim().toLowerCase();
  if (!snap.exists) {
    await ref.set({
      uid: token.uid,
      email: tokenEmail,
      name: token.name || "",
      shopName: "",
      photoURL: token.picture || "",
      bio: "",
      mobile: "",
      shopAddress: "",
      deliveryAddress: "",
      sameAsShopAddress: false,
      district: "",
      upazila: "",
      subscriptionStatus: "inactive",
      subscriptionPlan: null,
      subscriptionPlanName: null,
      subscriptionEndsAt: null,
      accessStartAt: null,
      subscriptionPurchasedAt: null,
      grantedFreeAccessDuration: null,
      unlimitedAccess: false,
      disabled: false,
      banned: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return plain((await ref.get()).data());
  }
  const existing = snap.data();
  if (tokenEmail && (!existing.email || existing.email !== tokenEmail)) {
    await ref.set({ email: tokenEmail, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return plain((await ref.get()).data());
  }
  return plain(existing);
}

async function customer(request) {
  configured();
  const token = tokenFor(request.identity);
  const profileSnap = await db.doc(`users/${token.uid}`).get();
  if (profileSnap.exists && (profileSnap.data().disabled || profileSnap.data().banned)) {
    fail(403, "permission-denied", "This account is not allowed to use WarQ.");
  }
  verified(token);
  const tokenEmail = String(token.email || "").trim().toLowerCase();
  if (profileSnap.exists) {
    const data = profileSnap.data();
    if (tokenEmail && (!data.email || data.email !== tokenEmail)) {
      const ref = db.doc(`users/${token.uid}`);
      await ref.set({ email: tokenEmail, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return { token, user: plain((await ref.get()).data()) };
    }
    return { token, user: plain(data) };
  }
  return { token, user: await ensureUser(token) };
}

async function subscribed(request) {
  const result = await customer(request);
  if (!activeAccess(result.user)) {
    fail(403, "permission-denied", "An active subscription or administrator-granted access is required for QR operations.");
  }
  requireRequiredProfile(result.user);
  return result;
}

async function administrator(request) {
  const token = tokenFor(request.identity);
  const ref = db.doc(`users/${token.uid}`);
  const snap = await ref.get();
  if (!snap.exists || snap.data().role !== "admin_console") {
    fail(403, "permission-denied", "Administrator access is required.");
  }
  const profile = snap.data();
  if (profile.disabled || profile.banned) {
    fail(403, "permission-denied", "This account is not allowed to use WarQ.");
  }
  token.admin = true;
  token.adminConsole = true;
  return token;
}

async function userFor(uid) {
  return (await db.doc(`users/${uid}`).get()).data();
}

async function audit(actorId, action, targetId, details = {}) {
  await db.collection("auditLogs").add({
    actorId,
    action,
    targetId,
    details,
    createdAt: FieldValue.serverTimestamp(),
  });
}

async function findQr(code) {
  const found = await db.collection("qrs").where("code", "==", code).limit(1).get();
  if (found.empty) fail(404, "not-found", "This WarQ QR code was not found.");
  return found.docs[0];
}

const dashboardCache = new Map();

function getCachedDashboard(ownerId) {
  const hit = dashboardCache.get(ownerId);
  if (!hit) return null;
  if (Date.now() - hit.at > DASHBOARD_CACHE_MS) {
    dashboardCache.delete(ownerId);
    return null;
  }
  return hit.payload;
}

async function getCachedDashboardShared(ownerId) {
  const local = getCachedDashboard(ownerId);
  if (local) return local;
  try {
    const shared = await cache.get(`dashboard:${ownerId}`);
    if (shared) {
      dashboardCache.set(ownerId, { at: Date.now(), payload: shared });
      return shared;
    }
  } catch {
    void 0;
  }
  return null;
}

function setCachedDashboard(ownerId, payload) {
  dashboardCache.set(ownerId, { at: Date.now(), payload });
  cache.set(`dashboard:${ownerId}`, payload, Math.ceil(DASHBOARD_CACHE_MS / 1000)).catch(() => {});
}

function invalidateDashboardCache(ownerId) {
  if (ownerId) {
    dashboardCache.delete(ownerId);
    cache.del(`dashboard:${ownerId}`).catch(() => {});
  } else {
    dashboardCache.clear();
    cache.flush().catch(() => {});
  }
  cache.del("pricing:current").catch(() => {});
}

async function generateQrsForRequest(requestId, order, actorId = "system") {
  const items = Array.isArray(order.products) && order.products.length ? order.products : products(order);
  const totalQrs = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const groupId = order.targetGroupId || requestId;
  const groupRef = db.doc(`qrGroups/${groupId}`);
  const orderRef = db.doc(`stickerRequests/${requestId}`);
  let folderName = order.folderName || `QR folder ${groupId}`;
  let serialStart = 0;

  await db.runTransaction(async (tx) => {
    const [orderSnap, groupSnap] = await Promise.all([tx.get(orderRef), tx.get(groupRef)]);
    const savedOrder = orderSnap.exists ? orderSnap.data() : order;
    if (order.targetGroupId) {
      if (!groupSnap.exists || groupSnap.data().ownerId !== order.ownerId) {
        fail(404, "not-found", "The selected QR folder no longer exists.");
      }
      const existing = groupSnap.data();
      if (existing.deletionState === "deleting") {
        fail(412, "failed-precondition", "This QR folder is being deleted and cannot receive more QR codes.");
      }
      folderName = existing.folderName || folderName;
      const savedStart = Number(savedOrder.folderSerialStart);
      if (Number.isInteger(savedStart) && savedStart >= 0) {
        serialStart = savedStart;
      } else {
        const currentNext = Number.isInteger(Number(existing.nextSerial))
          ? Number(existing.nextSerial)
          : Math.max(0, Number(existing.totalQrs || 0));
        serialStart = currentNext;
        tx.set(
          groupRef,
          {
            folderName,
            folderNameKey: existing.folderNameKey || normalizeFolderName(folderName),
            productName: existing.productName || items[0]?.productName || "",
            productModel: existing.productModel || items[0]?.productModel || folderName,
            brandName: existing.brandName || items[0]?.brandName || "",
            productNames: Array.isArray(existing.productNames)
              ? existing.productNames
              : [existing.productName || items[0]?.productName].filter(Boolean),
            totalQrs: Math.max(0, Number(existing.totalQrs || 0)) + totalQrs,
            nextSerial: currentNext + totalQrs,
            lastAddedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        tx.set(orderRef, { folderSerialStart: serialStart, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
      return;
    }

    serialStart = 0;
    tx.set(
      groupRef,
      {
        ownerId: order.ownerId,
        requestId,
        groupId,
        folderName,
        folderNameKey: order.folderNameKey || normalizeFolderName(folderName),
        productNames: [...new Set(items.map((item) => item.productName).filter(Boolean))],
        productCount: items.length,
        productName: items[0]?.productName || "",
        productModel: items[0]?.productModel || folderName,
        brandName: items[0]?.brandName || "",
        totalQrs,
        nextSerial: totalQrs,
        shopName: order.shopName,
        shopAddress: order.shopAddress,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    if (!Number.isInteger(Number(savedOrder.folderSerialStart))) {
      tx.set(orderRef, { folderSerialStart: 0, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
  });

  let batch = db.batch();
  let count = 0;
  let serial = 0;
  try {
    for (const [productIndex, raw] of items.entries()) {
      const product = { ...raw, warrantyDuration: qrWarranty(raw) };
      const productId = product.id || `P${productIndex + 1}`;
      for (let index = 0; index < Number(product.quantity); index += 1) {
        serial += 1;
        const ref = db.collection("qrs").doc(`${requestId}_${serial}`);
        const code = `WQ-${stableHex(`${order.generationKey}:${serial}`).slice(0, 20).toUpperCase()}`;
        batch.set(ref, {
          code,
          ownerId: order.ownerId,
          requestId,
          groupId,
          folderName,
          serial: serialStart + serial,
          productId,
          productName: product.productName,
          productModel: product.productModel,
          brandName: product.brandName,
          defaultPrice: product.defaultPrice ?? null,
          costPrice: product.costPrice ?? null,
          warrantyDuration: product.warrantyDuration,
          shopName: order.shopName,
          shopAddress: order.shopAddress,
          notes: product.notes || "",
          status: "generated",
          saleId: null,
          saleDate: null,
          soldAt: null,
          activatedAt: null,
          warrantyExpiresAt: null,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        count += 1;
        if (count === 450) {
          await batch.commit();
          batch = db.batch();
          count = 0;
        }
      }
    }
    if (count) await batch.commit();
    await orderRef.update({
      status: "generated",
      generatedAt: FieldValue.serverTimestamp(),
      generatedBy: actorId,
      generationError: null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    await audit(actorId, order.targetGroupId ? "qrs_added_to_folder" : "qrs_generated_automatically", requestId, {
      quantity: serial,
      groupId,
      folderName,
    });
    return { count: serial, groupId, folderName };
  } catch (error) {
    await orderRef
      .set(
        {
          status: "generation_failed",
          generationFailedAt: FieldValue.serverTimestamp(),
          generationError: "Automatic generation did not finish. It will be retried safely.",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
      .catch(() => {});
    throw error;
  }
}

async function activateQrCodeRecord({ code, requestedPrice, customerDetails = {}, actorId = "system", requiredOwnerId = null }) {
  const doc = await findQr(code);
  const original = doc.data();
  if (requiredOwnerId && original.ownerId !== requiredOwnerId) {
    fail(403, "permission-denied", "This QR code belongs to another WarQ account.");
  }
  const actualPrice = money(requestedPrice, "actual sale amount", true);
  const custName = optionalText(customerDetails.customerName, 160) || original.customerName || null;
  const custPhone = optionalText(customerDetails.customerPhone, 50) || original.customerPhone || null;
  const custEmail = optionalText(customerDetails.customerEmail, 160) || original.customerEmail || null;
  const custAddress = optionalText(customerDetails.customerAddress, 500) || original.customerAddress || null;
  const custNotes = optionalText(customerDetails.customerNotes, 1000) || original.customerNotes || null;

  let result;
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(doc.ref);
    if (!fresh.exists) fail(404, "not-found", "This WarQ QR code was not found.");
    const qr = fresh.data();
    const groupId =
      qr.groupId || `${qr.requestId}_${String(qr.productId || qr.productName).replace(/[^A-Za-z0-9_-]/g, "_")}`;
    const group = await tx.get(db.doc(`qrGroups/${groupId}`));
    if (requiredOwnerId && qr.ownerId !== requiredOwnerId) {
      fail(403, "permission-denied", "This QR code belongs to another WarQ account.");
    }
    if (group.exists && group.data().deletionState === "deleting") {
      fail(412, "failed-precondition", "This QR folder is being deleted and cannot be activated. Please try again shortly.");
    }
    if (qr.status === "returned") {
      fail(412, "failed-precondition", "This QR code was returned and cannot be activated or sold again.");
    }
    if (qr.status === "activated") {
      result = { alreadyActivated: true, qr: publicQr(plain(qr)), saleId: qr.saleId || null };
      return;
    }
    if (!["generated", "inactive", "sold"].includes(qr.status)) {
      fail(412, "failed-precondition", "This QR code is not ready for activation.");
    }
    const activatedAt = now();
    const saleDate = qr.soldAt || qr.saleDate || activatedAt;
    const duration = qrWarranty(qr);
    const warrantyExpiresAt = warrantyEnd(activatedAt, duration);
    const saleRef = qr.saleId ? db.doc(`sales/${qr.saleId}`) : db.collection("sales").doc();
    const saleAmount = actualPrice ?? qr.actualPrice ?? qr.defaultPrice ?? null;
    const sale = {
      ownerId: qr.ownerId,
      qrId: doc.id,
      code: qr.code,
      requestId: qr.requestId,
      productId: qr.productId || null,
      productName: qr.productName,
      productModel: qr.productModel || null,
      brandName: qr.brandName || null,
      serial: qr.serial || null,
      actualPrice: saleAmount,
      defaultPrice: qr.defaultPrice ?? null,
      costPrice: qr.costPrice ?? null,
      customerName: custName,
      customerPhone: custPhone,
      customerEmail: custEmail,
      customerAddress: custAddress,
      customerNotes: custNotes,
      saleDate,
      soldAt: saleDate,
      activationDate: activatedAt,
      activatedAt,
      activatedBy: actorId,
      warrantyDuration: duration,
      warrantyExpiresAt,
      status: "activated",
      shopName: qr.shopName || "",
      shopAddress: qr.shopAddress || "",
      updatedAt: FieldValue.serverTimestamp(),
    };
    tx.set(saleRef, qr.saleId ? sale : { ...sale, createdAt: FieldValue.serverTimestamp() }, { merge: Boolean(qr.saleId) });
    const update = {
      status: "activated",
      saleId: saleRef.id,
      actualPrice: saleAmount,
      customerName: custName,
      customerPhone: custPhone,
      customerEmail: custEmail,
      customerAddress: custAddress,
      customerNotes: custNotes,
      saleDate,
      soldAt: saleDate,
      activatedAt,
      activationDate: activatedAt,
      activatedBy: actorId,
      warrantyDuration: duration,
      warrantyExpiresAt,
      updatedAt: FieldValue.serverTimestamp(),
    };
    tx.update(doc.ref, update);
    result = { alreadyActivated: false, qr: publicQr({ ...qr, ...update }), sale: { id: saleRef.id, ...plain(sale) } };
  });
  if (!result.alreadyActivated) {
    await audit(actorId, "qr_activated", doc.id, { saleId: result.sale?.id || result.saleId || null });
  }
  return result;
}

async function activateOwnedQr(token, code, requestedPrice, customerDetails = {}) {
  const result = await activateQrCodeRecord({
    code,
    requestedPrice,
    customerDetails,
    actorId: token.uid,
    requiredOwnerId: token.uid,
  });
  invalidateDashboardCache(token.uid);
  return result;
}

async function completePayment(paymentId, transactionId, provider) {
  const paymentRef = db.doc(`payments/${paymentId}`);
  let result = {};
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(paymentRef);
    if (!snap.exists) fail(404, "not-found", "Payment was not found.");
    const payment = snap.data();
    if (payment.status === "paid") {
      result = { alreadyPaid: true, kind: payment.kind || "subscription" };
      return;
    }
    if (payment.status !== "pending") fail(412, "failed-precondition", "This payment cannot be completed.");
    tx.update(paymentRef, {
      status: "paid",
      gatewayTransactionId: transactionId,
      verifiedAt: FieldValue.serverTimestamp(),
      provider,
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (payment.kind === "sticker_request") {
      const orderRef = db.doc(`stickerRequests/${payment.stickerRequestId}`);
      const orderSnap = await tx.get(orderRef);
      if (
        !orderSnap.exists ||
        orderSnap.data().ownerId !== payment.ownerId ||
        Number(orderSnap.data().totalPrice) !== Number(payment.amount)
      ) {
        fail(412, "failed-precondition", "Sticker order payment integrity check failed.");
      }
      tx.update(orderRef, {
        paymentStatus: "paid",
        paymentId,
        paidAt: now(),
        deliveryStatus: "preparing",
        updatedAt: FieldValue.serverTimestamp(),
      });
      result = { kind: "sticker_request", requestId: payment.stickerRequestId };
      return;
    }
    const plan = SERVER_PLANS[payment.packageId];
    if (!plan || Number(payment.amount) !== plan.amount) {
      fail(412, "failed-precondition", "Payment package integrity check failed.");
    }
    const userRef = db.doc(`users/${payment.ownerId}`);
    const profile = (await tx.get(userRef)).data();
    const start =
      profile?.subscriptionEndsAt && new Date(profile.subscriptionEndsAt).getTime() > Date.now()
        ? new Date(profile.subscriptionEndsAt)
        : new Date();
    start.setMonth(start.getMonth() + plan.months);
    const purchaseDate = now();
    tx.set(
      userRef,
      {
        subscriptionStatus: "active",
        subscriptionPlan: payment.packageId,
        subscriptionPlanName: `${plan.label} Subscription`,
        subscriptionPurchasedAt: purchaseDate,
        accessStartAt: purchaseDate,
        subscriptionEndsAt: start.toISOString(),
        grantedFreeAccessDuration: null,
        unlimitedAccess: false,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    result = { kind: "subscription", subscriptionEndsAt: start.toISOString(), subscriptionPlan: payment.packageId };
  });
  const payment = (await paymentRef.get()).data();
  if (!result.alreadyPaid) {
    await audit(payment.ownerId, "payment_verified", paymentId, { provider, transactionId, kind: result.kind });
  }
  return result;
}

function sandboxCardDecision(provider, testCard, outcome) {
  const cards = SANDBOX_CARDS[provider];
  if (!cards) return { success: false, message: "Choose bKash or Nagad." };
  if (outcome === "success") return { success: true, matched: cards.success };
  if (outcome === "failure") return { success: false, message: "The sandbox payment was declined.", matched: cards.failure };
  const value = typeof testCard === "string" ? testCard : testCard && typeof testCard === "object" ? `${testCard.number || testCard.mobile || ""}/${testCard.pin || ""}` : "";
  const number = String(value.split("/")[0] || "").trim();
  const pin = String(value.split("/")[1] || "").trim();
  if (number === cards.success.number && pin === cards.success.pin) return { success: true, matched: cards.success };
  if (number === cards.failure.number && pin === cards.failure.pin) {
    return { success: false, message: "The sandbox payment was declined by the gateway.", matched: cards.failure };
  }
  return { success: false, message: "This test card is not recognised. Use one of the sandbox test cards shown on the checkout page." };
}

async function sendVerificationEmailHandler(request) {
  const { token } = await customer(request);
  if (token.firebase?.sign_in_provider !== "password") {
    fail(403, "permission-denied", "Sign in with your WarQ email and password before requesting verification.");
  }
  if (!token.email) fail(400, "invalid-argument", "This account has no email address.");
  if (token.email_verified) return { alreadyVerified: true };
  const result = await sendClientVerificationEmail();
  return { sent: true, alreadyVerified: false, demoCode: result?.demoCode || null };
}

async function confirmEmailVerificationHandler(request) {
  configured();
  const verificationToken = text(request.body?.token, "verification token", 200);
  const result = await applyEmailVerificationCode(verificationToken);
  await audit("verification", "email_verified", verificationToken);
  return { verified: Boolean(result?.verified) };
}

async function sendPasswordResetHandler(request) {
  configured();
  const email = String(request.body?.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fail(400, "invalid-argument", "Provide a valid email address.");
  }
  const result = await sendClientPasswordResetEmail(email);
  return { sent: true, demoCode: result?.demoCode || null, unknownAccount: Boolean(result?.unknownAccount) };
}

async function adminPasswordLoginHandler(request) {
  configured();
  const adminId = typeof request.body?.adminId === "string" ? request.body.adminId.trim() : "";
  const password = typeof request.body?.password === "string" ? request.body.password : "";
  let user;
  try {
    user = await signInAdminWithPassword(adminId, password);
  } catch {
    fail(403, "permission-denied", "Invalid administrator ID or password.");
  }
  return { customToken: `demo-admin.${user.uid}` };
}

async function ensureUserHandler(request) {
  return { user: await ensureUser((await customer(request)).token) };
}

async function updateProfileHandler(request) {
  const { token } = await customer(request);
  const name = text(request.body?.name, "full name", 100);
  const shopName = text(request.body?.shopName, "shop name", 160);
  const mobile = text(request.body?.mobile, "phone number", 30);
  if (!isValidBdPhoneNumber(mobile)) {
    fail(400, "invalid-argument", "Please provide a valid Bangladeshi phone number (e.g., 017XXXXXXXX or +88017XXXXXXXX).");
  }
  const shopAddress = text(request.body?.shopAddress, "shop address", 500);
  const deliveryAddress = text(request.body?.deliveryAddress, "delivery address", 500);
  const district = text(request.body?.district, "district", 100);
  const upazila = text(request.body?.upazila, "upazila / area", 100);
  const bio = optionalText(request.body?.bio, 500);
  const resolvedDeliveryAddress = Boolean(request.body?.sameAsShopAddress) ? shopAddress : deliveryAddress;
  const sameAsShopAddress = shopAddress === resolvedDeliveryAddress;

  const ref = db.doc(`users/${token.uid}`);
  const email = String(token.email || request.body?.email || "").trim().toLowerCase();
  const profilePayload = {
    name,
    shopName,
    mobile: formatBdPhoneNumber(mobile),
    shopAddress,
    deliveryAddress: resolvedDeliveryAddress,
    sameAsShopAddress,
    district,
    upazila,
    bio,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (email) profilePayload.email = email;
  await ref.set(profilePayload, { merge: true });
  invalidateDashboardCache(token.uid);
  const updatedDoc = (await ref.get()).data();
  return { user: plain(updatedDoc) };
}

async function getDashboardHandler(request) {
  const { token, user } = await customer(request);
  const ownerId = token.uid;
  const wantFresh = Boolean(request.body?.fresh);
  if (!wantFresh) {
    const cached = await getCachedDashboardShared(ownerId);
    if (cached) return { ...cached, user };
  }
  const [qrSnap, saleSnap, requestSnap, noteSnap, accessSnap, groupSnap, currentPricing] = await Promise.all([
    db.collection("qrs").where("ownerId", "==", ownerId).get(),
    db.collection("sales").where("ownerId", "==", ownerId).get(),
    db.collection("stickerRequests").where("ownerId", "==", ownerId).get(),
    db.collection("notifications").where("recipientId", "==", ownerId).limit(50).get(),
    db.collection("accessRequests").where("ownerId", "==", ownerId).get(),
    db.collection("qrGroups").where("ownerId", "==", ownerId).get(),
    pricing(),
  ]);
  const qrs = qrSnap.docs
    .map((doc) => ({ id: doc.id, ...plain(doc.data()), warrantyDuration: qrWarranty(doc.data()) }))
    .sort((a, b) => String(a.requestId).localeCompare(String(b.requestId)) || a.serial - b.serial);
  const storedGroups = new Map(groupSnap.docs.map((doc) => [doc.id, plain(doc.data())]));
  const sales = saleSnap.docs
    .map((doc) => {
      const data = doc.data();
      const duration = qrWarranty(data);
      const status = data.status || (data.activatedAt ? "activated" : "pending_activation");
      return {
        id: doc.id,
        ...plain(data),
        warrantyDuration: duration,
        status,
        warrantyStatus: warrantyState({ ...data, warrantyDuration: duration, status }),
      };
    })
    .sort((a, b) => new Date(b.saleDate || b.soldAt || 0) - new Date(a.saleDate || a.soldAt || 0));
  const requests = requestSnap.docs
    .map((doc) => ({ id: doc.id, ...plain(doc.data()) }))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const notifications = noteSnap.docs
    .map((doc) => ({ id: doc.id, ...plain(doc.data()) }))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 50);
  const accessRequests = accessSnap.docs
    .map((doc) => ({ id: doc.id, ...plain(doc.data()) }))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const productMap = new Map();
  const groupMap = new Map();
  const productAlias = new Map();
  const qrGroupKey = (qr) =>
    String(qr.groupId || `${qr.requestId}_${String(qr.productId || qr.productName).replace(/[^A-Za-z0-9_-]/g, "_")}`);
  const productKeyOf = (qr) => `${qrGroupKey(qr)}:${qr.productId || qr.productName}`;
  const qrById = new Map(qrs.map((qr) => [qr.id, qr]));
  qrs.forEach((qr) => {
    const key = productKeyOf(qr);
    const item = productMap.get(key) || {
      id: key,
      productKey: key,
      groupId: qrGroupKey(qr),
      requestId: qr.requestId,
      productId: qr.productId || null,
      productName: qr.productName,
      productModel: qr.productModel || null,
      brandName: qr.brandName || null,
      shopName: qr.shopName || "",
      shopAddress: qr.shopAddress || "",
      defaultPrice: qr.defaultPrice ?? null,
      costPrice: qr.costPrice ?? null,
      warrantyDuration: qr.warrantyDuration || null,
      notes: qr.notes || "",
      quantity: 0,
      sold: 0,
      activated: 0,
      returned: 0,
      revenue: 0,
      profit: 0,
      activeWarranties: 0,
      expiredWarranties: 0,
      voidedWarranties: 0,
      noWarranty: 0,
      returnRate: 0,
    };
    productAlias.set(`${String(qr.requestId)}:${qr.productId || qr.productName}`, key);
    item.quantity += 1;
    if (isReturned(qr)) item.returned += 1;
    if (["sold", "activated"].includes(qr.status)) item.sold += 1;
    if (qr.status === "activated") item.activated += 1;
    const state = warrantyState(qr);
    if (state === "active") item.activeWarranties += 1;
    if (state === "expired") item.expiredWarranties += 1;
    if (state === "voided") item.voidedWarranties += 1;
    if (state === "no_warranty") item.noWarranty += 1;
    productMap.set(key, item);
    const groupId = qr.groupId || `${qr.requestId}_${String(qr.productId || qr.productName).replace(/[^A-Za-z0-9_-]/g, "_")}`;
    const storedGroup = storedGroups.get(groupId);
    const qrCreated = qr.createdAt ? new Date(qr.createdAt).getTime() : null;
    const group = groupMap.get(groupId) || {
      id: groupId,
      requestId: storedGroup?.requestId || qr.requestId,
      productId: qr.productId || null,
      folderName:
        storedGroup?.folderName || qr.productModel || qr.folderName || storedGroup?.productName || `QR folder ${qr.requestId}`,
      productName: "",
      productModel: storedGroup?.productModel || qr.productModel || "",
      brandName: storedGroup?.brandName || qr.brandName || "",
      productNames: [],
      shopName: storedGroup?.shopName || qr.shopName || "",
      shopAddress: storedGroup?.shopAddress || qr.shopAddress || "",
      createdAt: null,
      lastAddedAt: null,
      warrantyDuration: null,
      defaultPrice: null,
      costPrice: null,
      totalQrs: 0,
      available: 0,
      sold: 0,
      activated: 0,
      returned: 0,
      activeWarranties: 0,
      expiredWarranties: 0,
      voidedWarranties: 0,
    };
    if (qr.folderName && !storedGroup?.folderName) group.folderName = qr.folderName;
    if (qr.productModel) group.productModel = qr.productModel;
    if (qr.brandName) group.brandName = qr.brandName;
    if (qr.productName && !group.productNames.includes(qr.productName)) group.productNames.push(qr.productName);
    group.productName = group.productNames.join(", ") || "Product QR codes";
    if (qr.warrantyDuration && !group.warrantyDuration) group.warrantyDuration = qr.warrantyDuration;
    if (qr.defaultPrice != null && group.defaultPrice == null) group.defaultPrice = qr.defaultPrice;
    if (qr.costPrice != null && group.costPrice == null) group.costPrice = qr.costPrice;
    if (qrCreated != null) {
      if (group.createdAt == null || qrCreated < group.createdAt) group.createdAt = qrCreated;
      if (group.lastAddedAt == null || qrCreated > group.lastAddedAt) group.lastAddedAt = qrCreated;
    }
    const storedCreated = storedGroup?.createdAt ? new Date(storedGroup.createdAt).getTime() : null;
    if (storedCreated != null && (group.createdAt == null || storedCreated < group.createdAt)) group.createdAt = storedCreated;
    const storedLastAdded = storedGroup?.lastAddedAt ? new Date(storedGroup.lastAddedAt).getTime() : null;
    if (storedLastAdded != null && (group.lastAddedAt == null || storedLastAdded > group.lastAddedAt)) {
      group.lastAddedAt = storedLastAdded;
    }
    group.totalQrs += 1;
    if (["generated", "inactive"].includes(qr.status)) group.available += 1;
    if (["sold", "activated"].includes(qr.status)) group.sold += 1;
    if (qr.status === "activated") group.activated += 1;
    if (isReturned(qr)) group.returned += 1;
    if (state === "active") group.activeWarranties += 1;
    if (state === "expired") group.expiredWarranties += 1;
    if (state === "voided") group.voidedWarranties += 1;
    groupMap.set(groupId, group);
  });
  const netSales = sales.filter(isNetSale);
  netSales.forEach((sale) => {
    const saleQr = sale.qrId ? qrById.get(sale.qrId) : null;
    const legacyKey = `${String(sale.requestId)}:${sale.productId || sale.productName}`;
    const key = saleQr ? productKeyOf(saleQr) : productAlias.get(legacyKey) || legacyKey;
    const item = productMap.get(key);
    if (item) {
      const saleRev = Number(sale.actualPrice ?? sale.defaultPrice ?? 0);
      item.revenue += saleRev;
      item.profit += saleRev - Number(sale.costPrice ?? 0);
    }
  });
  productMap.forEach((item) => {
    const closed = Number(item.sold || 0) + Number(item.returned || 0);
    item.returnRate = closed ? round((Number(item.returned || 0) / closed) * 100) : 0;
  });
  const revenue = netSales.reduce((sum, sale) => sum + Number(sale.actualPrice ?? sale.defaultPrice ?? 0), 0);
  const totalCost = netSales.reduce((sum, sale) => sum + Number(sale.costPrice ?? 0), 0);
  const profit = revenue - totalCost;
  const activatedQrs = qrs.filter((qr) => qr.status === "activated").length;
  const returnedQrs = qrs.filter(isReturned).length;
  const totalReturns = Math.max(returnedQrs, sales.filter(isReturned).length);
  const activeWarranties = qrs.filter((qr) => warrantyState(qr) === "active").length;
  const expiredWarranties = qrs.filter((qr) => warrantyState(qr) === "expired").length;
  const voidedWarranties = qrs.filter((qr) => warrantyState(qr) === "voided").length;
  const noWarrantyProducts = qrs.filter((qr) => warrantyState(qr) === "no_warranty").length;
  const availableQr = qrs.filter((qr) => ["generated", "inactive"].includes(qr.status)).length;
  const totalSoldOrActivated = qrs.filter((qr) => ["sold", "activated"].includes(qr.status)).length;
  const totalSalesCount = Math.max(netSales.length, totalSoldOrActivated);
  const unactivatedQrs = qrs.filter((qr) => ["generated", "inactive", "sold"].includes(qr.status)).length;

  const payload = {
    user,
    pricing: currentPricing,
    qrs,
    sales,
    requests,
    notifications,
    accessRequests,
    groups: [...groupMap.values()].sort(
      (a, b) => a.folderName.localeCompare(b.folderName) || String(a.requestId).localeCompare(String(b.requestId)),
    ),
    products: [...productMap.values()],
    stats: {
      totalProducts: productMap.size,
      totalCreatedProducts: productMap.size,
      totalQrs: qrs.length,
      generatedQrCount: qrs.length,
      totalSales: totalSalesCount,
      totalSoldOrActivated: totalSalesCount,
      soldQrCount: totalSalesCount,
      totalAmount: round(revenue),
      totalRevenue: round(revenue),
      totalCost: round(totalCost),
      totalProfit: round(profit),
      totalReturns,
      returnedQrs,
      returnedQrCount: returnedQrs,
      activeWarranties,
      activeWarrantyCount: activeWarranties,
      expiredWarranties,
      expiredWarrantyCount: expiredWarranties,
      expiredQrs: expiredWarranties,
      expiredQrCount: expiredWarranties,
      voidedWarranties,
      voidedWarrantyCount: voidedWarranties,
      noWarrantyProducts,
      activatedQrs,
      activatedQrCount: activatedQrs,
      unactivatedQrs,
      availableQr,
      availableQrCount: availableQr,
    },
  };
  setCachedDashboard(ownerId, payload);
  return payload;
}

async function createStickerRequestHandler(request) {
  const { token } = await subscribed(request);
  const items = products(request.body || {});
  const item = items[0];
  const totalQrCodes = item.quantity;
  const created = db.collection("stickerRequests").doc();
  const requestedShopName = text(request.body?.shopName, "shop name", 160);
  const requestedShopAddress = text(request.body?.shopAddress, "shop address", 500);
  const modelKey = normalizeFolderName(item.productModel);
  let targetGroupId = optionalText(request.body?.targetGroupId, 220) || null;
  let shopName = requestedShopName;
  let shopAddress = requestedShopAddress;
  let folderName = item.productModel;
  let folderNameKey = modelKey;

  if (!targetGroupId) {
    const existingGroups = await db.collection("qrGroups").where("ownerId", "==", token.uid).get();
    const matchingGroup = existingGroups.docs.find((doc) => {
      const group = doc.data();
      return normalizeFolderName(group.productModel || group.folderName) === modelKey;
    });
    if (matchingGroup) targetGroupId = matchingGroup.id;
  }

  if (targetGroupId) {
    const groupRef = db.doc(`qrGroups/${targetGroupId}`);
    const groupSnap = await groupRef.get();
    if (!groupSnap.exists || groupSnap.data().ownerId !== token.uid) {
      fail(404, "not-found", "The selected QR folder was not found.");
    }
    const group = groupSnap.data();
    if (group.deletionState === "deleting") {
      fail(412, "failed-precondition", "This QR folder is being deleted and cannot receive more QR codes.");
    }
    const storedModel = optionalText(group.productModel, 160);
    if (storedModel && normalizeFolderName(storedModel) !== modelKey) {
      fail(412, "failed-precondition", "Additional QR codes must use the existing folder's product model.");
    }
    if (storedModel && group.productName && normalizeFolderName(group.productName) !== normalizeFolderName(item.productName)) {
      fail(412, "failed-precondition", "Additional QR codes must use the existing folder's product name.");
    }
    if (storedModel && group.brandName && normalizeFolderName(group.brandName) !== normalizeFolderName(item.brandName)) {
      fail(412, "failed-precondition", "Additional QR codes must use the existing folder's company or brand name.");
    }

    if (!storedModel) {
      const legacyKey = group.folderNameKey || normalizeFolderName(group.folderName);
      const modelNameRef = folderNameRef(token.uid, modelKey);
      const legacyNameRef = legacyKey && legacyKey !== modelKey ? folderNameRef(token.uid, legacyKey) : null;
      await db.runTransaction(async (tx) => {
        const [currentGroupSnap, modelNameSnap, legacyNameSnap] = await Promise.all([
          tx.get(groupRef),
          tx.get(modelNameRef),
          legacyNameRef ? tx.get(legacyNameRef) : Promise.resolve(null),
        ]);
        if (!currentGroupSnap.exists || currentGroupSnap.data().ownerId !== token.uid) {
          fail(404, "not-found", "The selected QR folder was not found.");
        }
        const currentGroup = currentGroupSnap.data();
        if (currentGroup.deletionState === "deleting") {
          fail(412, "failed-precondition", "This QR folder is being deleted and cannot receive more QR codes.");
        }
        if (currentGroup.productModel && normalizeFolderName(currentGroup.productModel) !== modelKey) {
          fail(412, "failed-precondition", "Additional QR codes must use the existing folder's product model.");
        }
        if (modelNameSnap.exists && modelNameSnap.data().groupId !== targetGroupId) {
          fail(409, "already-exists", "A QR folder for this product model already exists. Open that folder to add more QR codes.");
        }
        tx.set(
          modelNameRef,
          {
            ownerId: token.uid,
            folderName: item.productModel,
            folderNameKey: modelKey,
            groupId: targetGroupId,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        if (legacyNameRef && legacyNameSnap?.exists && legacyNameSnap.data().groupId === targetGroupId) {
          tx.delete(legacyNameRef);
        }
        tx.set(
          groupRef,
          {
            folderName: item.productModel,
            folderNameKey: modelKey,
            productName: item.productName,
            productModel: item.productModel,
            brandName: item.brandName,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      });
    }
    folderName = storedModel || item.productModel;
    folderNameKey = storedModel ? group.folderNameKey || modelKey : modelKey;
    shopName = group.shopName || shopName;
    shopAddress = group.shopAddress || shopAddress;
  }

  const fulfillment = targetGroupId ? "digital" : request.body?.fulfillment === "physical" ? "physical" : "digital";
  const rate = await pricing();
  const stickerSubtotal = round(totalQrCodes * rate.perStickerPrice);
  const deliveryCharge = fulfillment === "physical" ? rate.deliveryCharge : 0;
  const payload = {
    ownerId: token.uid,
    shopName,
    shopAddress,
    folderName,
    folderNameKey,
    targetGroupId,
    products: items,
    productCount: 1,
    totalQrCodes,
    totalStickerQuantity: totalQrCodes,
    fulfillment,
    ...rate,
    stickerSubtotal,
    deliveryCharge,
    totalPrice: round(stickerSubtotal + deliveryCharge),
    status: "generating",
    generationKey: autoId(),
    paymentStatus: fulfillment === "physical" ? "unpaid" : "not_required",
    deliveryStatus: fulfillment === "physical" ? "awaiting_payment" : "digital_ready",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (targetGroupId) {
    await created.set(payload);
  } else {
    const nameRef = folderNameRef(token.uid, folderNameKey);
    await db.runTransaction(async (tx) => {
      const nameSnap = await tx.get(nameRef);
      if (nameSnap.exists) {
        fail(409, "already-exists", "A QR folder for this product model already exists. Open that folder to add more QR codes.");
      }
      tx.set(nameRef, {
        ownerId: token.uid,
        folderName,
        folderNameKey,
        groupId: created.id,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(created, payload);
    });
  }

  await audit(
    token.uid,
    targetGroupId ? "qrs_added_to_model_folder" : "sticker_request_created",
    created.id,
    {
      totalQrCodes,
      groupId: targetGroupId || created.id,
      productName: item.productName,
      productModel: item.productModel,
      brandName: item.brandName,
    },
  );
  invalidateDashboardCache(token.uid);
  try {
    await generateQrsForRequest(created.id, payload, token.uid);
  } catch (error) {
    console.error("automatic QR generation failed", created.id, error);
  }
  invalidateDashboardCache(token.uid);
  return {
    id: created.id,
    groupId: targetGroupId || created.id,
    folderName,
    reusedExistingFolder: Boolean(targetGroupId),
    totalPrice: payload.totalPrice,
    stickerSubtotal,
    deliveryCharge,
    totalQrCodes,
    productCount: 1,
    fulfillment,
    pricing: rate,
    generationStatus: "generated",
  };
}

async function requestAccessHandler(request) {
  const { token, user } = await customer(request);
  requireRequiredProfile(user);
  if (activeAccess(user)) fail(412, "failed-precondition", "Your QR access is already active.");
  const existing = await db.collection("accessRequests").where("ownerId", "==", token.uid).get();
  if (existing.docs.some((doc) => doc.data().status === "pending")) {
    fail(412, "failed-precondition", "Your free-access request is already awaiting an administrator decision.");
  }
  const created = await db.collection("accessRequests").add({
    ownerId: token.uid,
    status: "pending",
    message: optionalText(request.body?.message, 1000),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  invalidateDashboardCache(token.uid);
  await audit(token.uid, "free_access_requested", created.id);
  return { id: created.id };
}

async function getQrHandler(request) {
  const { token } = await subscribed(request);
  const doc = await findQr(text(request.body?.code, "QR code", 200));
  const qr = plain(doc.data());
  if (qr.ownerId !== token.uid) fail(403, "permission-denied", "This QR code belongs to another WarQ account.");
  return { qr: { id: doc.id, ...qr, warrantyDuration: qrWarranty(qr), warrantyStatus: warrantyState(qr) } };
}

async function loadPublicQrForCustomer(code) {
  const found = await findQr(code);
  const qr = plain(found.data());
  if (!qr?.ownerId) fail(404, "not-found", "This WarQ QR code was not found.");
  const ownerSnap = await db.doc(`users/${qr.ownerId}`).get();
  if (!ownerSnap.exists) {
    fail(403, "permission-denied", "This product information is unavailable because the seller's WarQ subscription is not active.");
  }
  const owner = plain(ownerSnap.data());
  if (!activeAccess(owner)) {
    fail(403, "permission-denied", "This product information is unavailable because the seller's WarQ subscription is not active.");
  }
  return { qr: customerFacingQr(qr) };
}

async function getPublicQrHandler(request) {
  return loadPublicQrForCustomer(text(request.body?.code, "QR code", 200));
}

async function recordSaleHandler(request) {
  const { token } = await subscribed(request);
  const code = text(request.body?.code, "QR code", 200);
  const result = await activateOwnedQr(token, code, request.body?.actualPrice, {
    customerName: request.body?.customerName,
    customerPhone: request.body?.customerPhone,
    customerEmail: request.body?.customerEmail,
    customerAddress: request.body?.customerAddress,
    customerNotes: request.body?.customerNotes,
  });
  return { sale: result.sale || null, qr: result.qr, alreadyActivated: result.alreadyActivated };
}

async function activateQrHandler(request) {
  const { token } = await subscribed(request);
  return activateOwnedQr(token, text(request.body?.code, "QR code", 200), request.body?.actualPrice, {
    customerName: request.body?.customerName,
    customerPhone: request.body?.customerPhone,
    customerEmail: request.body?.customerEmail,
    customerAddress: request.body?.customerAddress,
    customerNotes: request.body?.customerNotes,
  });
}

async function updateSaleAmountHandler(request) {
  const { token } = await subscribed(request);
  const saleId = text(request.body?.saleId, "sale ID", 128);
  const requestedPrice = money(request.body?.actualPrice, "actual sale amount", true);
  const ref = db.doc(`sales/${saleId}`);
  const snap = await ref.get();
  if (!snap.exists) fail(404, "not-found", "Sale record not found.");
  if (snap.data().ownerId !== token.uid) fail(403, "permission-denied", "You cannot edit this sale.");
  if (isReturned(snap.data())) fail(412, "failed-precondition", "Returned sales cannot be edited.");
  const current = snap.data();
  const actualPrice = requestedPrice ?? current.actualPrice ?? current.defaultPrice ?? null;
  if (actualPrice == null) fail(400, "invalid-argument", "Provide a valid actual sale amount.");
  await db.runTransaction(async (tx) => {
    tx.update(ref, { actualPrice, updatedAt: FieldValue.serverTimestamp(), editedBy: token.uid });
    tx.update(db.doc(`qrs/${current.qrId}`), { actualPrice, updatedAt: FieldValue.serverTimestamp() });
  });
  invalidateDashboardCache(token.uid);
  return { ok: true };
}

async function returnSaleHandler(request) {
  const { token } = await subscribed(request);
  const reason = optionalText(request.body?.reason, 1000);
  let saleSnap = null;
  let qrSnap;
  if (request.body?.saleId) {
    saleSnap = await db.doc(`sales/${text(request.body.saleId, "sale ID", 128)}`).get();
    if (!saleSnap.exists) fail(404, "not-found", "Sale record not found.");
    const sale = saleSnap.data();
    if (sale.ownerId !== token.uid) fail(403, "permission-denied", "You cannot return this sale.");
    qrSnap = sale.qrId
      ? await db.doc(`qrs/${sale.qrId}`).get()
      : await findQr(sale.code || text(request.body?.code, "QR code", 200));
  } else {
    qrSnap = await findQr(text(request.body?.code, "QR code", 200));
  }
  if (!qrSnap.exists) fail(404, "not-found", "This WarQ QR code was not found.");
  const qr = qrSnap.data();
  if (qr.ownerId !== token.uid) fail(403, "permission-denied", "This QR code belongs to another WarQ account.");
  const saleRef = saleSnap?.ref || (qr.saleId ? db.doc(`sales/${qr.saleId}`) : null);
  if (!saleRef) fail(412, "failed-precondition", "This QR code has no sale to return.");
  await db.runTransaction(async (tx) => {
    const freshQr = await tx.get(qrSnap.ref);
    const freshSale = await tx.get(saleRef);
    if (!freshQr.exists || !freshSale.exists) fail(404, "not-found", "Sale or QR record was not found.");
    const currentQr = freshQr.data();
    const currentSale = freshSale.data();
    if (currentQr.ownerId !== token.uid || currentSale.ownerId !== token.uid) {
      fail(403, "permission-denied", "You cannot return this sale.");
    }
    if (isReturned(currentQr) || isReturned(currentSale)) {
      fail(412, "failed-precondition", "This product has already been returned.");
    }
    if (currentQr.status !== "activated" && currentSale.status !== "activated") {
      fail(412, "failed-precondition", "Only activated products can be marked as returned.");
    }
    const returnedAt = now();
    const patch = {
      status: "returned",
      returnedAt,
      returnReason: reason,
      warrantyVoidedAt: returnedAt,
      updatedAt: FieldValue.serverTimestamp(),
      returnedBy: token.uid,
    };
    tx.update(freshQr.ref, patch);
    tx.update(saleRef, patch);
  });
  await audit(token.uid, "qr_returned", qrSnap.id, { saleId: saleRef.id, reason });
  invalidateDashboardCache(token.uid);
  return { ok: true, code: qr.code, saleId: saleRef.id };
}

async function deleteQrHandler(request) {
  const { token } = await customer(request);
  const doc = await findQr(text(request.body?.code, "QR code", 200));
  let qr;
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(doc.ref);
    if (!fresh.exists) fail(404, "not-found", "This WarQ QR code was not found.");
    qr = fresh.data();
    if (qr.ownerId !== token.uid) fail(403, "permission-denied", "You cannot delete this QR code.");
    if (!["generated", "inactive"].includes(qr.status)) {
      fail(412, "failed-precondition", "Sold or activated QR codes cannot be deleted. Sales and warranty history is permanently preserved.");
    }
    tx.delete(doc.ref);
  });

  const groupId = qr.groupId || `${qr.requestId}_${String(qr.productId || qr.productName).replace(/[^A-Za-z0-9_-]/g, "_")}`;
  const remainingInGroup = await db.collection("qrs").where("ownerId", "==", token.uid).get();
  const groupHasQrs = remainingInGroup.docs.some((entry) => {
    const dQr = entry.data();
    const gId = dQr.groupId || `${dQr.requestId}_${String(dQr.productId || dQr.productName).replace(/[^A-Za-z0-9_-]/g, "_")}`;
    return gId === groupId;
  });
  if (!groupHasQrs) {
    const groupRef = db.doc(`qrGroups/${groupId}`);
    const group = await groupRef.get();
    await groupRef.delete().catch(() => {});
    if (group.exists) await releaseFolderName(group.data(), token.uid);
  }

  await audit(token.uid, "qr_deleted", doc.id, { groupId });
  invalidateDashboardCache(token.uid);
  return { ok: true };
}

async function deleteQrsHandler(request) {
  const { token } = await customer(request);
  const rawCodes = Array.isArray(request.body?.codes) ? request.body.codes : [];
  const codes = rawCodes.map((code) => String(code).trim()).filter(Boolean);
  if (!codes.length) fail(400, "invalid-argument", "No QR codes specified for deletion.");

  const owned = await db.collection("qrs").where("ownerId", "==", token.uid).get();
  const targetDocs = owned.docs.filter((doc) => codes.includes(doc.data().code));

  let deletedCount = 0;
  let protectedCount = 0;

  for (let start = 0; start < targetDocs.length; start += 400) {
    const result = await db.runTransaction(async (tx) => {
      const freshDocs = await Promise.all(targetDocs.slice(start, start + 400).map((doc) => tx.get(doc.ref)));
      let deleted = 0;
      let protectedInChunk = 0;
      freshDocs.forEach((fresh) => {
        if (!fresh.exists) return;
        const qr = fresh.data();
        if (qr.ownerId !== token.uid || !["generated", "inactive"].includes(qr.status)) {
          protectedInChunk += 1;
          return;
        }
        tx.delete(fresh.ref);
        deleted += 1;
      });
      return { deleted, protected: protectedInChunk };
    });
    deletedCount += result.deleted;
    protectedCount += result.protected;
  }

  const allRemaining = await db.collection("qrs").where("ownerId", "==", token.uid).get();
  const remainingGroupIds = new Set(
    allRemaining.docs.map((doc) => {
      const dQr = doc.data();
      return dQr.groupId || `${dQr.requestId}_${String(dQr.productId || dQr.productName).replace(/[^A-Za-z0-9_-]/g, "_")}`;
    }),
  );

  const groupSnaps = await db.collection("qrGroups").where("ownerId", "==", token.uid).get();
  for (const gDoc of groupSnaps.docs) {
    if (!remainingGroupIds.has(gDoc.id) && !remainingGroupIds.has(gDoc.data()?.groupId)) {
      await gDoc.ref.delete().catch(() => {});
      await releaseFolderName(gDoc.data(), token.uid);
    }
  }

  await audit(token.uid, "qrs_bulk_deleted", token.uid, { deletedCount, protectedCount });

  return {
    ok: true,
    deletedCount,
    protectedCount,
    message:
      protectedCount > 0
        ? `Deleted ${deletedCount} unused QR code(s). ${protectedCount} activated/sold QR code(s) were protected and preserved.`
        : `Deleted ${deletedCount} unused QR code(s).`,
  };
}

async function deleteQrGroupHandler(request) {
  const { token } = await customer(request);
  const groupId = text(request.body?.groupId, "QR folder ID", 220);
  const owned = await db.collection("qrs").where("ownerId", "==", token.uid).get();
  let groupDocs = owned.docs.filter((doc) => {
    const qr = doc.data();
    const fallback = `${qr.requestId}_${String(qr.productId || qr.productName).replace(/[^A-Za-z0-9_-]/g, "_")}`;
    return (qr.groupId || fallback) === groupId;
  });
  if (!groupDocs.length) fail(404, "not-found", "This QR folder was not found.");

  const groupRef = db.doc(`qrGroups/${groupId}`);
  const seed = groupDocs[0].data();
  await db.runTransaction(async (tx) => {
    const group = await tx.get(groupRef);
    if (group.exists && group.data().ownerId && group.data().ownerId !== token.uid) {
      fail(403, "permission-denied", "You cannot delete this QR folder.");
    }
    if (group.exists && group.data().deletionState === "deleting") {
      fail(409, "aborted", "This QR folder is already being deleted.");
    }
    tx.set(
      groupRef,
      {
        ownerId: token.uid,
        groupId,
        requestId: seed.requestId,
        productId: seed.productId || null,
        productName: seed.productName || "",
        deletionState: "deleting",
        deletionStartedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });

  const claimed = await db.collection("qrs").where("ownerId", "==", token.uid).get();
  groupDocs = claimed.docs.filter((doc) => {
    const qr = doc.data();
    const fallback = `${qr.requestId}_${String(qr.productId || qr.productName).replace(/[^A-Za-z0-9_-]/g, "_")}`;
    return (qr.groupId || fallback) === groupId;
  });
  const protectedDocs = groupDocs.filter((doc) => !["generated", "inactive"].includes(doc.data().status));
  if (protectedDocs.length > 0) {
    await groupRef.set(
      { deletionState: null, deletionAbortedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    fail(
      412,
      "failed-precondition",
      `This folder contains ${protectedDocs.length} activated or sold QR code(s) and cannot be deleted as a whole. Please open the folder to select and delete only unused individual QR codes.`,
    );
  }

  try {
    for (let start = 0; start < groupDocs.length; start += 450) {
      const batch = db.batch();
      groupDocs.slice(start, start + 450).forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
    const deletedGroup = (await groupRef.get()).data();
    await groupRef.delete();
    await releaseFolderName(deletedGroup, token.uid);
  } catch (error) {
    await groupRef
      .set({ deletionState: null, deletionFailedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
      .catch(() => {});
    throw error;
  }

  await audit(token.uid, "qr_group_deleted", groupId, { deletedCount: groupDocs.length });
  invalidateDashboardCache(token.uid);

  return {
    ok: true,
    deleted: groupDocs.length,
    message: `Folder deleted along with ${groupDocs.length} unused QR code(s).`,
  };
}

async function startPaymentHandler(request) {
  const { token } = await customer(request);
  const provider = request.body?.provider;
  if (!["bkash", "nagad"].includes(provider)) fail(400, "invalid-argument", "Choose bKash or Nagad.");
  let payload;
  if (request.body?.kind === "sticker_request") {
    const stickerRequestId = text(request.body?.stickerRequestId, "sticker request ID", 128);
    const orderSnap = await db.doc(`stickerRequests/${stickerRequestId}`).get();
    if (!orderSnap.exists || orderSnap.data().ownerId !== token.uid) {
      fail(403, "permission-denied", "You cannot pay for this sticker request.");
    }
    const order = orderSnap.data();
    if (order.fulfillment !== "physical") {
      fail(412, "failed-precondition", "Digital QR sheets do not require delivery payment.");
    }
    if (order.paymentStatus === "paid") fail(412, "failed-precondition", "This sticker request has already been paid.");
    payload = {
      kind: "sticker_request",
      stickerRequestId,
      packageName: `WarQ physical QR stickers (${order.totalQrCodes})`,
      amount: Number(order.totalPrice),
      productCategory: "qr_stickers",
    };
  } else {
    const plan = SERVER_PLANS[request.body?.packageId];
    if (!plan) fail(400, "invalid-argument", "Choose a valid subscription package.");
    payload = {
      kind: "subscription",
      packageId: request.body.packageId,
      packageName: plan.label,
      amount: plan.amount,
      productCategory: "subscription",
    };
  }
  const ref = db.collection("payments").doc();
  await ref.set({
    ownerId: token.uid,
    ...payload,
    currency: "BDT",
    provider,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const redirectUrl = sandboxPayUrl(ref.id);
  await ref.update({ gatewayPaymentId: `sandbox-${ref.id}`, updatedAt: FieldValue.serverTimestamp() });
  if (payload.kind === "sticker_request") {
    await db
      .doc(`stickerRequests/${payload.stickerRequestId}`)
      .update({ paymentStatus: "pending", paymentId: ref.id, updatedAt: FieldValue.serverTimestamp() });
  }
  return { paymentId: ref.id, redirectUrl, sandbox: true, provider, kind: payload.kind, amount: payload.amount };
}

async function getSandboxPaymentHandler(request) {
  const { token } = await customer(request);
  const paymentId = text(request.body?.paymentId, "payment ID", 128);
  const snap = await db.doc(`payments/${paymentId}`).get();
  if (!snap.exists) fail(404, "not-found", "Payment was not found.");
  const payment = plain(snap.data());
  if (payment.ownerId !== token.uid) fail(403, "permission-denied", "You cannot view this payment.");
  const plan = payment.kind === "subscription" ? SERVER_PLANS[payment.packageId] || null : null;
  return {
    payment: { ...payment, redirectUrl: sandboxPayUrl(paymentId) },
    plan,
    provider: payment.provider,
    testCards: SANDBOX_CARDS[payment.provider] || null,
    sandbox: true,
  };
}

async function completeSandboxPaymentHandler(request) {
  const { token } = await customer(request);
  const paymentId = text(request.body?.paymentId, "payment ID", 128);
  const snap = await db.doc(`payments/${paymentId}`).get();
  if (!snap.exists) fail(404, "not-found", "Payment was not found.");
  const payment = plain(snap.data());
  if (payment.ownerId !== token.uid) fail(403, "permission-denied", "You cannot complete this payment.");
  if (payment.status === "paid") {
    return { success: true, alreadyPaid: true, paymentId, kind: payment.kind || "subscription", provider: payment.provider };
  }
  if (payment.status !== "pending") fail(412, "failed-precondition", "This payment cannot be completed.");
  const decision = sandboxCardDecision(payment.provider, request.body?.testCard, request.body?.outcome);
  if (!decision.success) {
    await db
      .doc(`payments/${paymentId}`)
      .set({ status: "failed", failureReason: decision.message, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { success: false, status: "failed", paymentId, provider: payment.provider, message: decision.message };
  }
  const transactionId = `SANDBOX-${autoId().slice(0, 12).toUpperCase()}`;
  const result = await completePayment(paymentId, transactionId, payment.provider);
  invalidateDashboardCache(payment.ownerId);
  return {
    success: true,
    status: "paid",
    paymentId,
    provider: payment.provider,
    transactionId,
    ...result,
  };
}

async function adminSummaryHandler(request) {
  await administrator(request);
  const [usersSnap, requestsSnap, paymentsSnap, qrsSnap, salesSnap, notificationsSnap, accessRequestsSnap, claimsSnap, price] =
    await Promise.all([
      db.collection("users").get(),
      db.collection("stickerRequests").get(),
      db.collection("payments").get(),
      db.collection("qrs").get(),
      db.collection("sales").get(),
      db.collection("notifications").get(),
      db.collection("accessRequests").get(),
      db.collection("claims").get(),
      pricing(),
    ]);
  const map = (snap) => snap.docs.map((doc) => ({ id: doc.id, ...plain(doc.data()) }));
  const rawUsers = map(usersSnap);
  const rawRequests = map(requestsSnap);
  const rawPayments = map(paymentsSnap);
  const rawQrs = map(qrsSnap);
  const rawSales = map(salesSnap);
  const rawNotifications = map(notificationsSnap);
  const rawAccessRequests = map(accessRequestsSnap);
  const rawClaims = map(claimsSnap);

  const validUsers = rawUsers.filter((u) => u && u.role !== "admin_console" && !u.banned && u.status !== "banned");
  const validUserIds = new Set();
  validUsers.forEach((u) => {
    if (u.id) validUserIds.add(u.id);
    if (u.uid) validUserIds.add(u.uid);
  });
  const bannedUserIds = new Set(
    rawUsers.filter((u) => u && (u.banned || u.status === "banned")).flatMap((u) => [u.id, u.uid].filter(Boolean)),
  );

  const requests = rawRequests.filter((r) => r && (validUserIds.has(r.ownerId) || validUserIds.has(r.userId) || validUserIds.has(r.uid)));
  const qrs = rawQrs.filter((q) => q && (validUserIds.has(q.ownerId) || validUserIds.has(q.userId) || validUserIds.has(q.uid)));
  const sales = rawSales.filter((s) => s && (validUserIds.has(s.ownerId) || validUserIds.has(s.userId) || validUserIds.has(s.uid)));
  const payments = rawPayments.filter((p) => p && (validUserIds.has(p.ownerId) || validUserIds.has(p.userId) || validUserIds.has(p.uid)));
  const accessRequests = rawAccessRequests.filter((a) => a && (validUserIds.has(a.ownerId) || validUserIds.has(a.userId) || validUserIds.has(a.uid)));
  const notifications = rawNotifications.filter((n) => n && validUserIds.has(n.recipientId));
  const claims = rawClaims.filter((c) => c && (validUserIds.has(c.ownerId) || validUserIds.has(c.customerUserId)));

  if (bannedUserIds.size > 0) {
    const bannedDocs = [
      ...rawQrs.filter((q) => bannedUserIds.has(q.ownerId) || bannedUserIds.has(q.userId) || bannedUserIds.has(q.uid)).map((d) => db.doc(`qrs/${d.id}`)),
      ...rawSales.filter((s) => bannedUserIds.has(s.ownerId) || bannedUserIds.has(s.userId) || bannedUserIds.has(s.uid)).map((d) => db.doc(`sales/${d.id}`)),
      ...rawRequests.filter((r) => bannedUserIds.has(r.ownerId) || bannedUserIds.has(r.userId) || bannedUserIds.has(r.uid)).map((d) => db.doc(`stickerRequests/${d.id}`)),
      ...rawPayments.filter((p) => bannedUserIds.has(p.ownerId) || bannedUserIds.has(p.userId) || bannedUserIds.has(p.uid)).map((d) => db.doc(`payments/${d.id}`)),
      ...rawAccessRequests.filter((a) => bannedUserIds.has(a.ownerId) || bannedUserIds.has(a.userId) || bannedUserIds.has(a.uid)).map((d) => db.doc(`accessRequests/${d.id}`)),
    ];
    if (bannedDocs.length > 0) {
      (async () => {
        try {
          for (let index = 0; index < bannedDocs.length; index += 450) {
            const batch = db.batch();
            bannedDocs.slice(index, index + 450).forEach((ref) => batch.delete(ref));
            await batch.commit();
          }
        } catch (error) {
          console.warn("Banned data purge:", error?.message);
        }
      })();
    }
  }

  const ownerOf = (item) => item?.ownerId ?? item?.userId ?? item?.uid ?? null;
  const groupByOwner = (rows) => {
    const map = new Map();
    for (const row of rows) {
      const key = ownerOf(row);
      if (!key) continue;
      const list = map.get(key);
      if (list) list.push(row);
      else map.set(key, [row]);
    }
    return map;
  };
  const qrsByOwner = groupByOwner(qrs);
  const salesByOwner = groupByOwner(sales);
  const requestsByOwner = groupByOwner(requests);

  const qrWarrantyStates = new Map();
  for (const qr of qrs) qrWarrantyStates.set(qr, warrantyState(qr));
  const stateOf = (qr) => qrWarrantyStates.get(qr) || "no_warranty";

  const analyticsFor = (ownerId) => {
    const userQrs = qrsByOwner.get(ownerId) || [];
    const userSales = salesByOwner.get(ownerId) || [];
    const userRequests = requestsByOwner.get(ownerId) || [];

    const uniqueProductNames = new Set([
      ...userQrs.map((q) => q.productName || q.productId).filter(Boolean),
      ...userRequests.flatMap((r) => (r.products || []).map((p) => p.productName || p.productId)).filter(Boolean),
    ]);

    const netUserSales = userSales.filter(isNetSale);
    let activatedQrs = 0;
    let availableQrs = 0;
    let returnedQrs = 0;
    let activeWarranties = 0;
    let expiredWarranties = 0;
    let voidedWarranties = 0;
    let noWarrantyProducts = 0;
    let soldOrActivatedCount = 0;
    let unactivatedQrs = 0;
    const activeWarrantyProducts = new Set();
    const expiredWarrantyProducts = new Set();
    const expiryDates = [];
    for (const qr of userQrs) {
      if (qr.status === "activated") activatedQrs += 1;
      if (["generated", "inactive"].includes(qr.status)) availableQrs += 1;
      if (isReturned(qr)) returnedQrs += 1;
      if (["sold", "activated"].includes(qr.status)) soldOrActivatedCount += 1;
      if (["generated", "inactive", "sold"].includes(qr.status)) unactivatedQrs += 1;
      const state = stateOf(qr);
      if (state === "active") {
        activeWarranties += 1;
        activeWarrantyProducts.add(qr.productName);
      } else if (state === "expired") {
        expiredWarranties += 1;
        expiredWarrantyProducts.add(qr.productName);
      } else if (state === "voided") voidedWarranties += 1;
      else if (state === "no_warranty") noWarrantyProducts += 1;
      if (qr.warrantyExpiresAt) expiryDates.push({ productName: qr.productName, expiresAt: qr.warrantyExpiresAt });
    }
    const totalReturns = Math.max(returnedQrs, userSales.filter(isReturned).length);
    const totalSalesCount = Math.max(netUserSales.length, soldOrActivatedCount);

    const totalRevenue = round(netUserSales.reduce((sum, s) => sum + Number(s.actualPrice ?? s.defaultPrice ?? 0), 0));
    const totalCost = round(netUserSales.reduce((sum, s) => sum + Number(s.costPrice ?? 0), 0));
    const totalProfit = round(totalRevenue - totalCost);

    const physicalOrders = userRequests.filter((r) => r.fulfillment === "physical");
    const paidPhysicalOrders = physicalOrders.filter((r) => r.paymentStatus === "paid");
    const deliveredOrders = paidPhysicalOrders.filter((r) => r.deliveryStatus === "delivered");
    const totalStickersOrdered = paidPhysicalOrders.reduce((sum, r) => sum + Number(r.totalQrCodes || 0), 0);

    return {
      totalProducts: uniqueProductNames.size,
      totalCreatedProducts: uniqueProductNames.size,
      generatedQrCount: userQrs.length,
      totalQrs: userQrs.length,
      availableQrCount: availableQrs,
      availableQr: availableQrs,
      soldQrCount: totalSalesCount,
      soldOrActivatedCount: totalSalesCount,
      totalSales: totalSalesCount,
      totalSoldOrActivated: totalSalesCount,
      activatedQrCount: activatedQrs,
      activatedQrs,
      expiredQrCount: expiredWarranties,
      expiredQrs: expiredWarranties,
      totalRevenue,
      totalAmount: totalRevenue,
      totalCost,
      totalProfit,
      totalReturns,
      returnedQrs,
      returnedQrCount: returnedQrs,
      activeWarrantyCount: activeWarranties,
      activeWarranties,
      expiredWarrantyCount: expiredWarranties,
      expiredWarranties,
      voidedWarranties,
      voidedWarrantyCount: voidedWarranties,
      noWarrantyProducts,
      unactivatedQrs,
      activeWarrantyProducts: [...activeWarrantyProducts].filter(Boolean).sort(),
      expiredWarrantyProducts: [...expiredWarrantyProducts].filter(Boolean).sort(),
      expiryDates: expiryDates.sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt)).slice(0, 20),
      stickerOrdersTotal: userRequests.length,
      physicalStickerOrders: physicalOrders.length,
      paidStickerOrders: paidPhysicalOrders.length,
      deliveredStickerOrders: deliveredOrders.length,
      totalStickersOrdered,
      stickerOrderHistory: userRequests
        .map((r) => ({
          id: r.id,
          totalQrCodes: r.totalQrCodes,
          fulfillment: r.fulfillment,
          paymentStatus: r.paymentStatus,
          deliveryStatus: r.deliveryStatus,
          totalPrice: r.totalPrice,
          createdAt: r.createdAt,
        }))
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)),
    };
  };

  const userAnalytics = validUsers.map((user) => ({ ...user, analytics: analyticsFor(user.id) }));

  const subscriptionRevenue = round(
    payments
      .filter(
        (p) =>
          (p.status === "cleared" || p.status === "paid" || p.status === "success") &&
          (p.kind === "subscription" || p.type === "subscription" || p.productCategory === "subscription"),
      )
      .reduce((sum, p) => sum + Number(p.amount || 0), 0),
  );

  let activatedQrTotal = 0;
  let returnedQrTotal = 0;
  let activeWarrantyTotal = 0;
  let expiredWarrantyTotal = 0;
  let voidedWarrantyTotal = 0;
  for (const qr of qrs) {
    if (qr.status === "activated") activatedQrTotal += 1;
    if (isReturned(qr)) returnedQrTotal += 1;
    const state = stateOf(qr);
    if (state === "active") activeWarrantyTotal += 1;
    else if (state === "expired") expiredWarrantyTotal += 1;
    else if (state === "voided") voidedWarrantyTotal += 1;
  }

  const globalStats = {
    totalRevenue: subscriptionRevenue,
    subscriptionRevenue,
    activatedQrs: activatedQrTotal,
    returnedQrs: returnedQrTotal,
    activeWarranties: activeWarrantyTotal,
    expiredWarranties: expiredWarrantyTotal,
    voidedWarranties: voidedWarrantyTotal,
    pendingAccessRequests: accessRequests.filter((item) => item.status === "pending").length,
    totalUsers: validUsers.length,
    totalOrders: requests.length,
    totalQrs: qrs.length,
  };

  return {
    users: userAnalytics,
    requests,
    payments,
    qrs,
    sales,
    notifications,
    accessRequests,
    claims,
    pricing: price,
    globalStats,
  };
}

async function setStickerPricingHandler(request) {
  const token = await administrator(request);
  const current = await pricing();
  const stickerPackSize = whole(request.body?.stickerPackSize, "stickers per pack", 1, 1000000);
  const stickerPackPrice = money(request.body?.stickerPackPrice, "pack price");
  const deliveryCharge = money(request.body?.deliveryCharge ?? current.deliveryCharge, "delivery charge");
  await db.doc(SETTINGS).set(
    { stickerPackSize, stickerPackPrice, deliveryCharge, updatedAt: FieldValue.serverTimestamp(), updatedBy: token.uid },
    { merge: true },
  );
  await audit(token.uid, "sticker_pricing_changed", SETTINGS, { stickerPackSize, stickerPackPrice, deliveryCharge });
  await cache.del("pricing:current").catch(() => {});
  return { pricing: await pricing() };
}

async function setUserAccessHandler(request) {
  const token = await administrator(request);
  const uid = text(request.body?.uid, "user ID", 128);
  const unlimited = request.body?.unlimited === true;
  const input = unlimited ? null : accessDuration(request.body || {});
  const start = now();
  const subscriptionEndsAt = unlimited ? null : new Date(Date.now() + input.seconds * 1000).toISOString();
  const durationLabel = unlimited ? "Unlimited Access" : formatDurationLabel(input?.duration);
  await db.doc(`users/${uid}`).set(
    {
      subscriptionStatus: unlimited ? "active" : "admin_granted",
      subscriptionPlan: unlimited ? "unlimited" : "free_grant",
      subscriptionPlanName: unlimited ? "Unlimited Access" : `Admin Free Access (${durationLabel})`,
      grantedFreeAccessDuration: input?.duration || null,
      accessStartAt: start,
      subscriptionEndsAt,
      unlimitedAccess: unlimited,
      accessDuration: input?.duration || null,
      accessRevokedAt: null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await audit(token.uid, "user_access_set", uid, input?.duration || { unlimited: true });
  return {
    accessStartAt: start,
    subscriptionEndsAt,
    unlimited,
    subscriptionPlanName: unlimited ? "Unlimited Access" : `Admin Free Access (${durationLabel})`,
  };
}

async function resolveAccessRequestHandler(request) {
  const token = await administrator(request);
  const requestId = text(request.body?.requestId, "access request ID", 128);
  const decision = text(request.body?.decision, "access request decision", 20);
  if (!["approved", "rejected"].includes(decision)) fail(400, "invalid-argument", "Choose approved or rejected.");
  const unlimited = request.body?.unlimited === true;
  const input = decision === "approved" && !unlimited ? accessDuration(request.body || {}) : null;
  const start = now();
  const subscriptionEndsAt = decision === "approved" && !unlimited ? new Date(Date.now() + input.seconds * 1000).toISOString() : null;
  const requestRef = db.doc(`accessRequests/${requestId}`);
  const durationLabel = unlimited ? "Unlimited Access" : formatDurationLabel(input?.duration);
  let ownerId = "";
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(requestRef);
    if (!snap.exists) fail(404, "not-found", "Access request not found.");
    const accessRequest = snap.data();
    if (accessRequest.status !== "pending") {
      fail(412, "failed-precondition", "This access request has already been decided.");
    }
    ownerId = accessRequest.ownerId;
    tx.update(requestRef, {
      status: decision,
      decisionNote: optionalText(request.body?.decisionNote, 1000),
      decidedAt: FieldValue.serverTimestamp(),
      decidedBy: token.uid,
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (decision === "approved") {
      tx.set(
        db.doc(`users/${ownerId}`),
        {
          subscriptionStatus: unlimited ? "active" : "admin_granted",
          subscriptionPlan: unlimited ? "unlimited" : "free_grant",
          subscriptionPlanName: unlimited ? "Unlimited Access" : `Admin Free Access (${durationLabel})`,
          grantedFreeAccessDuration: input?.duration || null,
          accessStartAt: start,
          subscriptionEndsAt,
          unlimitedAccess: unlimited,
          accessDuration: input?.duration || null,
          accessRevokedAt: null,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
  });
  await audit(token.uid, `free_access_${decision}`, requestId, { ownerId, ...(input?.duration || { unlimited }) });
  invalidateDashboardCache(ownerId);
  return { ok: true, subscriptionEndsAt, unlimited };
}

async function revokeUserAccessHandler(request) {
  const token = await administrator(request);
  const uid = text(request.body?.uid, "user ID", 128);
  await db.doc(`users/${uid}`).set(
    {
      subscriptionStatus: "inactive",
      subscriptionPlan: null,
      subscriptionPlanName: null,
      subscriptionEndsAt: null,
      unlimitedAccess: false,
      accessRevokedAt: now(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await audit(token.uid, "user_access_revoked", uid);
  return { ok: true };
}

async function setUserStatusHandler(request) {
  const token = await administrator(request);
  const uid = text(request.body?.uid, "user ID", 128);
  const mode = text(request.body?.mode, "account action", 20);
  if (uid === token.uid) fail(412, "failed-precondition", "You cannot change your own administrator account.");

  if (mode === "ban") {
    const reqSnap1 = await db.collection("stickerRequests").where("ownerId", "==", uid).get();
    const reqSnap2 = await db.collection("stickerRequests").where("userId", "==", uid).get();
    const requestIds = new Set([...reqSnap1.docs.map((d) => d.id), ...reqSnap2.docs.map((d) => d.id)]);

    const qrDocsToDelete = new Set();
    const qrSnap1 = await db.collection("qrs").where("ownerId", "==", uid).get();
    qrSnap1.docs.forEach((d) => qrDocsToDelete.add(d.ref));
    const qrSnap2 = await db.collection("qrs").where("userId", "==", uid).get();
    qrSnap2.docs.forEach((d) => qrDocsToDelete.add(d.ref));
    for (const rId of requestIds) {
      const qSnap = await db.collection("qrs").where("requestId", "==", rId).get();
      qSnap.docs.forEach((d) => qrDocsToDelete.add(d.ref));
    }

    const qrGroupDocs = new Set();
    const grpSnap1 = await db.collection("qrGroups").where("ownerId", "==", uid).get();
    grpSnap1.docs.forEach((d) => qrGroupDocs.add(d.ref));
    for (const rId of requestIds) {
      const gSnap = await db.collection("qrGroups").where("requestId", "==", rId).get();
      gSnap.docs.forEach((d) => qrGroupDocs.add(d.ref));
    }

    const salesDocs = new Set();
    const saleSnap1 = await db.collection("sales").where("ownerId", "==", uid).get();
    saleSnap1.docs.forEach((d) => salesDocs.add(d.ref));
    const saleSnap2 = await db.collection("sales").where("userId", "==", uid).get();
    saleSnap2.docs.forEach((d) => salesDocs.add(d.ref));
    const saleSnap3 = await db.collection("sales").where("activatedBy", "==", uid).get();
    saleSnap3.docs.forEach((d) => salesDocs.add(d.ref));
    for (const rId of requestIds) {
      const sSnap = await db.collection("sales").where("requestId", "==", rId).get();
      sSnap.docs.forEach((d) => salesDocs.add(d.ref));
    }

    const reqDocs = new Set([...reqSnap1.docs.map((d) => d.ref), ...reqSnap2.docs.map((d) => d.ref)]);

    const payDocs = new Set();
    const paySnap1 = await db.collection("payments").where("ownerId", "==", uid).get();
    paySnap1.docs.forEach((d) => payDocs.add(d.ref));
    const paySnap2 = await db.collection("payments").where("userId", "==", uid).get();
    paySnap2.docs.forEach((d) => payDocs.add(d.ref));

    const accessDocs = new Set();
    const accSnap1 = await db.collection("accessRequests").where("ownerId", "==", uid).get();
    accSnap1.docs.forEach((d) => accessDocs.add(d.ref));
    const accSnap2 = await db.collection("accessRequests").where("userId", "==", uid).get();
    accSnap2.docs.forEach((d) => accessDocs.add(d.ref));

    const notifDocs = new Set();
    const notifSnap1 = await db.collection("notifications").where("recipientId", "==", uid).get();
    notifSnap1.docs.forEach((d) => notifDocs.add(d.ref));
    const notifSnap2 = await db.collection("notifications").where("userId", "==", uid).get();
    notifSnap2.docs.forEach((d) => notifDocs.add(d.ref));
    const notifSnap3 = await db.collection("notifications").where("createdBy", "==", uid).get();
    notifSnap3.docs.forEach((d) => notifDocs.add(d.ref));

    const auditDocs = new Set();
    const auditSnap1 = await db.collection("auditLogs").where("actorId", "==", uid).get();
    auditSnap1.docs.forEach((d) => auditDocs.add(d.ref));
    const auditSnap2 = await db.collection("auditLogs").where("targetId", "==", uid).get();
    auditSnap2.docs.forEach((d) => auditDocs.add(d.ref));

    const allToDelete = [
      ...qrDocsToDelete,
      ...qrGroupDocs,
      ...salesDocs,
      ...reqDocs,
      ...payDocs,
      ...accessDocs,
      ...notifDocs,
      ...auditDocs,
      db.doc(`users/${uid}`),
    ];

    for (let index = 0; index < allToDelete.length; index += 450) {
      const batch = db.batch();
      allToDelete.slice(index, index + 450).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }

    await audit(token.uid, "user_permanently_banned_and_purged", uid);
    invalidateDashboardCache(uid);
    return { mode: "ban", purged: true, deletedCount: allToDelete.length };
  } else if (mode === "disable") {
    await db.doc(`users/${uid}`).set({ disabled: true, disabledAt: now(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await audit(token.uid, "user_disabled", uid);
    invalidateDashboardCache(uid);
    return { mode: "disable" };
  } else if (mode === "restore") {
    const user = await userFor(uid);
    if (!user) fail(404, "not-found", "User does not exist.");
    await db.doc(`users/${uid}`).set({ disabled: false, disabledAt: null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await audit(token.uid, "user_restored", uid);
    invalidateDashboardCache(uid);
    return { mode: "restore" };
  }
  fail(400, "invalid-argument", "Choose ban, disable, or restore.");
}

async function sendNotificationHandler(request) {
  const token = await administrator(request);
  const audience = request.body?.audience === "all" ? "all" : "single";
  const title = optionalText(request.body?.title, 160) || "Message from WarQ";
  const message = text(request.body?.message, "notification message", 2000);
  let recipientIds;
  if (audience === "all") {
    const users = await db.collection("users").get();
    recipientIds = users.docs.filter((doc) => doc.data().role !== "admin_console").map((doc) => doc.id);
  } else if (Array.isArray(request.body?.recipientIds) && request.body.recipientIds.length) {
    recipientIds = request.body.recipientIds.map((id) => text(id, "recipient ID", 128));
  } else {
    recipientIds = [text(request.body?.recipientId, "recipient ID", 128)];
  }
  if (!recipientIds.length) return { count: 0 };
  for (let start = 0; start < recipientIds.length; start += 450) {
    const batch = db.batch();
    recipientIds.slice(start, start + 450).forEach((recipientId) =>
      batch.set(db.collection("notifications").doc(), {
        recipientId,
        title,
        message,
        readAt: null,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: token.uid,
        audience,
      }),
    );
    await batch.commit();
  }
  await audit(token.uid, "notification_sent", audience, { audience, recipientCount: recipientIds.length });
  return { count: recipientIds.length };
}

async function markNotificationReadHandler(request) {
  const { token } = await customer(request);
  const id = text(request.body?.notificationId, "notification ID", 128);
  const ref = db.doc(`notifications/${id}`);
  const note = await ref.get();
  if (!note.exists || note.data().recipientId !== token.uid) {
    fail(403, "permission-denied", "You cannot update this notification.");
  }
  await ref.update({ readAt: FieldValue.serverTimestamp() });
  return { ok: true };
}

async function deleteNotificationHandler(request) {
  const { token } = await customer(request);
  const id = text(request.body?.notificationId, "notification ID", 128);
  const ref = db.doc(`notifications/${id}`);
  const note = await ref.get();
  if (!note.exists) fail(404, "not-found", "Notification not found.");
  if (note.data().recipientId !== token.uid && !isAdmin(token)) {
    fail(403, "permission-denied", "You cannot delete this notification.");
  }
  await ref.delete();
  return { ok: true, deletedId: id };
}

async function clearNotificationsHandler(request) {
  const { token } = await customer(request);
  const snap = await db.collection("notifications").where("recipientId", "==", token.uid).get();
  if (snap.empty) return { ok: true, deletedCount: 0 };
  for (let start = 0; start < snap.docs.length; start += 450) {
    const batch = db.batch();
    snap.docs.slice(start, start + 450).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return { ok: true, deletedCount: snap.docs.length };
}

async function updateStickerRequestHandler(request) {
  const token = await administrator(request);
  const requestId = text(request.body?.requestId, "request ID", 128);
  const data = request.body || {};
  const orderRef = db.doc(`stickerRequests/${requestId}`);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) fail(404, "not-found", "Sticker request not found.");
  const order = orderSnap.data();
  const update = { updatedAt: FieldValue.serverTimestamp() };
  if (data.deliveryStatus != null) {
    if (order.fulfillment !== "physical" || order.paymentStatus !== "paid") {
      fail(412, "failed-precondition", "Physical delivery can be prepared only after verified payment.");
    }
    const value = text(data.deliveryStatus, "delivery status", 30);
    if (!["preparing", "ready", "out_for_delivery", "delivered"].includes(value)) {
      fail(400, "invalid-argument", "Invalid delivery status.");
    }
    update.deliveryStatus = value;
  }
  if (data.status === "cancelled" && order.status !== "generated") update.status = "cancelled";
  if (Object.keys(update).length === 1) fail(400, "invalid-argument", "Choose a valid delivery update.");
  await orderRef.set(update, { merge: true });
  await audit(token.uid, "sticker_request_updated", requestId, plain(update));
  return { ok: true };
}

async function upgradeStickerRequestToPhysicalHandler(request) {
  const { token } = await subscribed(request);
  const requestId = text(request.body?.requestId, "request ID", 128);
  const orderRef = db.doc(`stickerRequests/${requestId}`);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists || orderSnap.data().ownerId !== token.uid) {
    fail(403, "permission-denied", "You cannot upgrade this sticker request.");
  }
  const order = orderSnap.data();
  if (order.fulfillment === "physical") {
    fail(412, "failed-precondition", "This order already includes physical sticker delivery.");
  }
  if (order.status !== "generated") {
    fail(412, "failed-precondition", "QR codes must finish generating before ordering printed stickers.");
  }
  if (order.paymentStatus === "paid") fail(412, "failed-precondition", "This sticker request has already been paid.");
  const rate = await pricing();
  const totalQrCodes = Number(order.totalQrCodes || 0);
  if (totalQrCodes <= 0) fail(412, "failed-precondition", "This request has no stickers to print.");
  const stickerSubtotal = round(totalQrCodes * rate.perStickerPrice);
  const deliveryCharge = rate.deliveryCharge;
  const totalPrice = round(stickerSubtotal + deliveryCharge);
  await orderRef.set(
    {
      fulfillment: "physical",
      stickerPackSize: rate.stickerPackSize,
      stickerPackPrice: rate.stickerPackPrice,
      perStickerPrice: rate.perStickerPrice,
      stickerSubtotal,
      deliveryCharge,
      totalPrice,
      paymentStatus: "unpaid",
      deliveryStatus: "awaiting_payment",
      upgradedToPhysicalAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await audit(token.uid, "sticker_request_upgraded_to_physical", requestId, {
    totalQrCodes,
    stickerSubtotal,
    deliveryCharge,
    totalPrice,
  });
  return { id: requestId, totalQrCodes, stickerSubtotal, deliveryCharge, totalPrice, pricing: rate };
}

async function deleteStickerRequestHandler(request) {
  const requestId = text(request.body?.requestId, "request ID", 128);
  const orderRef = db.doc(`stickerRequests/${requestId}`);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) fail(404, "not-found", "Sticker request not found.");
  const order = orderSnap.data();

  let actor = null;
  try {
    actor = await administrator(request);
  } catch {
    const { token } = await customer(request);
    actor = token;
    if (order.ownerId !== token.uid) fail(403, "permission-denied", "You cannot delete this sticker request.");
  }

  if (order.paymentStatus === "paid") fail(412, "failed-precondition", "Paid sticker requests cannot be deleted.");

  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(orderRef);
    if (!fresh.exists) return;
    if (fresh.data().paymentStatus !== "paid") tx.delete(orderRef);
  });
  await audit(actor.uid, "sticker_request_deleted", requestId, plain(order));
  invalidateDashboardCache(order.ownerId);
  return { ok: true, deletedId: requestId };
}

async function generateQrsHandler(request) {
  const token = await administrator(request);
  const requestId = text(request.body?.requestId, "request ID", 128);
  const orderRef = db.doc(`stickerRequests/${requestId}`);
  const order = await db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) fail(404, "not-found", "Sticker request not found.");
    const current = snap.data();
    if (current.status === "generated") fail(412, "failed-precondition", "QR codes were already generated for this request.");
    if (current.status === "generating") fail(412, "failed-precondition", "QR generation is already in progress.");
    if (current.status !== "generation_failed") {
      fail(412, "failed-precondition", "This request is being generated automatically.");
    }
    const generationKey = current.generationKey || autoId();
    tx.update(orderRef, {
      status: "generating",
      generationKey,
      generationStartedAt: FieldValue.serverTimestamp(),
      generationStartedBy: token.uid,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ...current, generationKey };
  });
  return generateQrsForRequest(requestId, order, token.uid);
}

async function resetDemoDataHandler() {
  const summary = await resetDemoData();
  return { summary };
}

export async function resetDemoData() {
  invalidateDashboardCache(null);
  await reseedEverything();
  return seedSummary();
}

function sortByCreatedAsc(items) {
  return [...items].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
}

function sortByCreatedDesc(items) {
  return [...items].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function publicUser(user, id) {
  if (!user) return null;
  return {
    id,
    name: user.name || "",
    email: user.email || "",
    shopName: user.shopName || "",
    mobile: user.mobile || "",
    shopAddress: user.shopAddress || "",
    deliveryAddress: user.deliveryAddress || "",
    district: user.district || "",
    upazila: user.upazila || "",
    bio: user.bio || "",
    subscriptionStatus: user.subscriptionStatus || "",
    subscriptionPlan: user.subscriptionPlan || "",
    subscriptionEndsAt: user.subscriptionEndsAt || null,
    unlimitedAccess: Boolean(user.unlimitedAccess),
    disabled: Boolean(user.disabled),
    createdAt: user.createdAt || null,
  };
}

function decodeDataUrl(input) {
  if (typeof input !== "string" || !input.trim()) return null;
  const trimmed = input.trim();
  const match = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return { mimeType: null, dataUrl: trimmed, size: 0 };
  const base64 = match[2].replace(/\s+/g, "");
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const size = Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
  return { mimeType: match[1].toLowerCase(), dataUrl: trimmed, size };
}

async function saveChatImage(database, { ownerId, uploaderId, threadId, mimeType, dataUrl, maxBytes = 2.5 * 1024 * 1024 }) {
  const decoded = decodeDataUrl(dataUrl);
  if (!decoded || !decoded.dataUrl || !decoded.size) {
    fail(400, "invalid-argument", "Provide a valid image upload.");
  }
  const type = (mimeType || decoded.mimeType || "").toLowerCase();
  const ext = ALLOWED_IMAGE_TYPES[type];
  if (!ext) fail(400, "invalid-argument", "Only JPEG, PNG, WebP, or GIF images are allowed.");
  if (decoded.size > maxBytes) fail(400, "invalid-argument", "Images must be 2.5 MB or smaller.");
  const id = autoId();
  await database.doc(`supportImages/${id}`).set({
    id,
    ownerId,
    uploaderId: uploaderId || ownerId,
    threadId,
    mimeType: type,
    fileName: `${id}${ext}`,
    size: decoded.size,
    dataUrl: decoded.dataUrl,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { id, mimeType: type, size: decoded.size };
}

async function removeSupportImage(database, imageId) {
  if (!imageId) return;
  const snap = await database.doc(`supportImages/${imageId}`).get();
  if (!snap.exists) return;
  await database.doc(`supportImages/${imageId}`).delete().catch(() => {});
}

function chatRetentionCutoff(atMs = Date.now()) {
  return atMs - CHAT_RETENTION_MS;
}

function isOlderThanRetention(value, cutoff = chatRetentionCutoff()) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp > 0 && timestamp < cutoff;
}

async function deleteDocsInBatches(database, refs) {
  for (let index = 0; index < refs.length; index += 450) {
    const batch = database.batch();
    refs.slice(index, index + 450).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

async function hardDeleteSupportThread(database, threadId) {
  if (!threadId) return;
  const messageSnap = await database.collection("supportMessages").where("threadId", "==", threadId).get();
  const imageIds = new Set();
  messageSnap.docs.forEach((document) => {
    const imageId = document.data()?.imageId;
    if (imageId) imageIds.add(imageId);
  });
  const imageSnap = await database.collection("supportImages").where("threadId", "==", threadId).get();
  imageSnap.docs.forEach((document) => imageIds.add(document.id));
  for (const imageId of imageIds) {
    await removeSupportImage(database, imageId);
  }
  await deleteDocsInBatches(database, messageSnap.docs.map((document) => document.ref));
  await database.doc(`supportThreads/${threadId}`).delete().catch(() => {});
}

async function hardDeleteSupportMessageDoc(database, document) {
  if (!document) return;
  const raw = typeof document.data === "function" ? document.data() : document.data;
  const data = plain(raw || {});
  if (data.imageId) await removeSupportImage(database, data.imageId);
  if (document.ref) await document.ref.delete().catch(() => {});
  else if (document.id) await database.doc(`supportMessages/${document.id}`).delete().catch(() => {});
}

async function purgeExpiredAiMessages(database, ownerId = null) {
  const cutoff = chatRetentionCutoff();
  const snap = ownerId
    ? await database.collection("aiChatMessages").where("ownerId", "==", ownerId).get()
    : await database.collection("aiChatMessages").get();
  const stale = snap.docs.filter((document) => isOlderThanRetention(plain(document.data()).createdAt, cutoff));
  await deleteDocsInBatches(database, stale.map((document) => document.ref));
  return stale.length;
}

async function purgeExpiredSupportMessages(database, ownerId = null) {
  const cutoff = chatRetentionCutoff();
  let allowedThreadIds = null;
  if (ownerId) {
    const threadSnap = await database.collection("supportThreads").where("ownerId", "==", ownerId).get();
    allowedThreadIds = new Set(threadSnap.docs.map((document) => document.id));
  }
  const messageSnap = await database.collection("supportMessages").get();
  const staleDocs = messageSnap.docs.filter((document) => {
    const data = plain(document.data());
    if (allowedThreadIds && !allowedThreadIds.has(data.threadId)) return false;
    return isOlderThanRetention(data.createdAt, cutoff);
  });
  for (const document of staleDocs) {
    await hardDeleteSupportMessageDoc(database, document);
  }
  const imageSnap = await database.collection("supportImages").get();
  let imagesRemoved = 0;
  for (const document of imageSnap.docs) {
    const data = plain(document.data());
    if (allowedThreadIds && data.threadId && !allowedThreadIds.has(data.threadId)) continue;
    if (!isOlderThanRetention(data.createdAt, cutoff)) continue;
    await removeSupportImage(database, document.id);
    imagesRemoved += 1;
  }
  const threadSnap = ownerId
    ? await database.collection("supportThreads").where("ownerId", "==", ownerId).get()
    : await database.collection("supportThreads").get();
  let threadsRemoved = 0;
  for (const threadDoc of threadSnap.docs) {
    const remaining = await database.collection("supportMessages").where("threadId", "==", threadDoc.id).get();
    if (!remaining.empty) continue;
    await hardDeleteSupportThread(database, threadDoc.id);
    threadsRemoved += 1;
  }
  return staleDocs.length + imagesRemoved + threadsRemoved;
}

async function purgeExpiredChatData(database, { ownerId = null } = {}) {
  const aiRemoved = await purgeExpiredAiMessages(database, ownerId);
  const supportRemoved = await purgeExpiredSupportMessages(database, ownerId);
  return { aiRemoved, supportRemoved };
}

function replyPreviewText(message) {
  if (!message) return "";
  if (message.deleted) {
    return message.deletedType === "image" ? "This image was deleted." : "This message was deleted.";
  }
  const body = String(message.text || "").trim();
  if (body) return body.slice(0, 240);
  if (message.imageId) return "Photo";
  return "Message";
}

function buildReplyToSnapshot(message, messageId) {
  if (!message || !messageId) return null;
  if (message.senderRole === "system") return null;
  return {
    id: messageId,
    senderRole: message.senderRole || "user",
    text: replyPreviewText(message),
    hasImage: Boolean(message.imageId) && !message.deleted,
    deleted: Boolean(message.deleted),
  };
}

async function resolveReplyTo(database, threadId, replyToId, failFn) {
  if (!replyToId) return null;
  const snap = await database.doc(`supportMessages/${replyToId}`).get();
  if (!snap.exists) failFn(404, "not-found", "The message you are replying to was not found.");
  const message = plain(snap.data());
  if (message.threadId !== threadId) {
    failFn(400, "invalid-argument", "You can only reply to a message in this conversation.");
  }
  if (message.senderRole === "system") {
    failFn(400, "invalid-argument", "System messages cannot be replied to.");
  }
  return buildReplyToSnapshot(message, snap.id);
}

function attachLiveReplyState(messages) {
  const byId = new Map(messages.map((message) => [message.id, message]));
  return messages.map((message) => {
    if (!message?.replyTo?.id) return message;
    const original = byId.get(message.replyTo.id);
    if (!original) {
      return {
        ...message,
        replyTo: {
          ...message.replyTo,
          deleted: true,
          hasImage: false,
          text: message.replyTo.deleted ? message.replyTo.text : "This message was deleted.",
        },
      };
    }
    return {
      ...message,
      replyTo: {
        ...message.replyTo,
        senderRole: original.senderRole || message.replyTo.senderRole,
        text: replyPreviewText(original),
        hasImage: Boolean(original.imageId) && !original.deleted,
        deleted: Boolean(original.deleted),
      },
    };
  });
}

function deletedPreviewLabel(message) {
  return message?.deletedType === "image" ? "This image was deleted." : "This message was deleted.";
}

function serializeAiMessage(message) {
  const deleted = Boolean(message.deleted);
  return {
    id: message.id,
    role: message.role,
    content: deleted ? "" : (message.content || ""),
    createdAt: message.createdAt,
    deleted,
    deletedType: deleted ? (message.deletedType || "message") : null,
    deletedAt: message.deletedAt || null,
  };
}

function resolveSupportDeletedType(message) {
  return Boolean(message?.imageId) ? "image" : "message";
}

async function softDeleteSupportMessage(database, snap, message) {
  if (message.deleted) return message.deletedType || resolveSupportDeletedType(message);
  const deletedType = resolveSupportDeletedType(message);
  if (message.imageId) await removeSupportImage(database, message.imageId);
  await snap.ref.set({
    text: "",
    imageId: null,
    deleted: true,
    deletedType,
    deletedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return deletedType;
}

function canEditSupportMessageText(message) {
  if (!message || message.deleted) return false;
  if (message.senderRole === "system") return false;
  return Boolean(String(message.text || "").trim());
}

async function updateSupportMessageText(database, snap, message, nextText) {
  const textBody = String(nextText || "").trim();
  if (!textBody) fail(400, "invalid-argument", "Edited message cannot be empty.");
  if (textBody.length > 4000) fail(400, "invalid-argument", "Message is too long.");
  if (!canEditSupportMessageText(message)) fail(403, "permission-denied", "This message cannot be edited.");
  if (textBody === String(message.text || "").trim()) return message;
  await snap.ref.set({ text: textBody, edited: true, editedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { ...message, text: textBody, edited: true };
}

async function listMessages(database, threadId, limit = 200) {
  const cutoff = chatRetentionCutoff();
  const snap = await database.collection("supportMessages").where("threadId", "==", threadId).get();
  const fresh = [];
  for (const document of snap.docs) {
    const data = plain(document.data());
    if (isOlderThanRetention(data.createdAt, cutoff)) {
      await hardDeleteSupportMessageDoc(database, document);
      continue;
    }
    fresh.push({ id: document.id, ...data });
  }
  const messages = sortByCreatedAsc(fresh).slice(-limit);
  return attachLiveReplyState(messages);
}

async function refreshThreadPreview(database, threadId) {
  const messages = await listMessages(database, threadId, 200);
  const last = messages[messages.length - 1];
  let preview = "Conversation updated";
  if (last) {
    if (last.deleted) preview = deletedPreviewLabel(last);
    else preview = String(last.text || "").trim() || (last.imageId ? "Image attached" : "Message");
  }
  await database.doc(`supportThreads/${threadId}`).update({
    lastMessageAt: last?.createdAt || FieldValue.serverTimestamp(),
    lastMessagePreview: String(preview).slice(0, 160),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return messages;
}

async function findOpenThreadForUser(database, ownerId) {
  await purgeExpiredSupportMessages(database, ownerId);
  const snap = await database.collection("supportThreads").where("ownerId", "==", ownerId).get();
  const open = [];
  for (const document of snap.docs) {
    const thread = { id: document.id, ...plain(document.data()) };
    if (thread.status === "waiting" || thread.status === "active") open.push(thread);
  }
  if (!open.length) return null;
  return sortByCreatedDesc(open)[0];
}

async function queueSnapshot(database) {
  await purgeExpiredSupportMessages(database);
  const snap = await database.collection("supportThreads").get();
  const threads = snap.docs.map((document) => ({ id: document.id, ...plain(document.data()) }));
  const waiting = sortByCreatedAsc(threads.filter((thread) => thread.status === "waiting"));
  const active = sortByCreatedDesc(threads.filter((thread) => thread.status === "active"));
  const recent = sortByCreatedDesc(threads.filter((thread) => thread.status === "resolved" || thread.status === "closed")).slice(0, 30);
  return { waiting, active, recent, waitingCount: waiting.length, activeCount: active.length };
}

async function enrichThreads(database, threads) {
  return Promise.all(threads.map(async (thread) => {
    const userSnap = await database.doc(`users/${thread.ownerId}`).get();
    const user = userSnap.exists ? publicUser(plain(userSnap.data()), thread.ownerId) : { id: thread.ownerId };
    return { ...thread, user };
  }));
}

async function addSystemMessage(database, threadId, body) {
  await database.collection("supportMessages").add({
    threadId,
    senderId: "system",
    senderRole: "system",
    text: body,
    imageId: null,
    createdAt: FieldValue.serverTimestamp(),
  });
}

async function getAiHistory(database, ownerId, limit = 40) {
  const cutoff = chatRetentionCutoff();
  const snap = await database.collection("aiChatMessages").where("ownerId", "==", ownerId).get();
  const staleRefs = [];
  const fresh = [];
  snap.docs.forEach((document) => {
    const data = plain(document.data());
    if (isOlderThanRetention(data.createdAt, cutoff)) {
      staleRefs.push(document.ref);
      return;
    }
    fresh.push({ id: document.id, ...data });
  });
  if (staleRefs.length) {
    await deleteDocsInBatches(database, staleRefs);
  }
  return sortByCreatedAsc(fresh).slice(-limit);
}

async function aiAssistantContext(ownerId, user) {
  const [qrSnap, saleSnap, claimSnap, currentPricing] = await Promise.all([
    db.collection("qrs").where("ownerId", "==", ownerId).get(),
    db.collection("sales").where("ownerId", "==", ownerId).get(),
    db.collection("claims").where("ownerId", "==", ownerId).get(),
    pricing(),
  ]);
  return {
    qrs: qrSnap.docs.map((document) => ({ id: document.id, ...plain(document.data()), warrantyDuration: qrWarranty(document.data()) })),
    sales: saleSnap.docs.map((document) => ({ id: document.id, ...plain(document.data()) })),
    claims: claimSnap.docs.map((document) => ({ id: document.id, ...plain(document.data()) })),
    pricing: currentPricing,
    plans: SERVER_PLANS,
    user,
    shopName: user?.shopName || "",
  };
}

async function getAiChatHandler(request) {
  const { token } = await customer(request);
  const messages = await getAiHistory(db, token.uid);
  return {
    messages: messages.map(serializeAiMessage),
    whatsapp: WHATSAPP_NUMBER,
  };
}

async function clearAiChatHandler(request) {
  const { token } = await customer(request);
  const snap = await db.collection("aiChatMessages").where("ownerId", "==", token.uid).get();
  for (let index = 0; index < snap.docs.length; index += 450) {
    const batch = db.batch();
    snap.docs.slice(index, index + 450).forEach((document) => batch.delete(document.ref));
    await batch.commit();
  }
  return { ok: true };
}

async function deleteAiMessageHandler(request) {
  const { token } = await customer(request);
  const messageId = text(request.body?.messageId, "message ID", 128);
  const snap = await db.doc(`aiChatMessages/${messageId}`).get();
  if (!snap.exists) fail(404, "not-found", "Message not found.");
  const data = plain(snap.data());
  if (data.ownerId !== token.uid) fail(403, "permission-denied", "You cannot delete this message.");
  if (!data.deleted) {
    await snap.ref.set({
      content: "",
      deleted: true,
      deletedType: "message",
      deletedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  const messages = await getAiHistory(db, token.uid);
  return {
    ok: true,
    messages: messages.map(serializeAiMessage),
  };
}

async function aiChatHandler(request) {
  const { token, user } = await customer(request);
  const message = text(request.body?.message, "message", 2000);
  await db.collection("aiChatMessages").add({
    ownerId: token.uid,
    role: "user",
    content: message,
    createdAt: FieldValue.serverTimestamp(),
  });
  const history = await getAiHistory(db, token.uid, 24);
  const chatMessages = [
    { role: "system", content: WARQ_SYSTEM_PROMPT },
    ...history
      .filter((item) => !item.deleted && String(item.content || "").trim())
      .map((item) => ({
        role: item.role === "assistant" ? "assistant" : "user",
        content: String(item.content || "").slice(0, 2000),
      })),
  ];
  const context = await aiAssistantContext(token.uid, user);
  let reply = "";
  let provider = "live";
  try {
    reply = await callAiProxy({ messages: chatMessages });
  } catch (error) {
    if (error && error.code === "ai/offline") {
      provider = "offline";
      reply = await offlineAssistantReply({
        message,
        history: history.map((item) => ({ role: item.role, content: item.content })),
        context,
      });
    } else {
      fail(503, "unavailable", "WarQ AI support is temporarily unavailable. Please try Chat with Admin.");
    }
  }
  await db.collection("aiChatMessages").add({
    ownerId: token.uid,
    role: "assistant",
    content: reply,
    createdAt: FieldValue.serverTimestamp(),
  });
  const messages = await getAiHistory(db, token.uid);
  return {
    reply,
    messages: messages.map(serializeAiMessage),
    whatsapp: WHATSAPP_NUMBER,
    provider,
  };
}

async function getAiInsightsHandler(request) {
  const { token, user } = await customer(request);
  const context = await aiAssistantContext(token.uid, user);
  const insights = await buildAiInsights({
    qrs: context.qrs,
    sales: context.sales,
    claims: context.claims,
    users: [user],
    pricing: context.pricing,
    plans: SERVER_PLANS,
  });
  return { ...insights, insights, provider: "offline", model: "" };
}

async function getSupportThreadHandler(request) {
  const { token, user } = await customer(request);
  const thread = await findOpenThreadForUser(db, token.uid);
  if (!thread) {
    return {
      thread: null,
      messages: [],
      waitingBanner: WAITING_BANNER,
      queuePosition: null,
      whatsapp: WHATSAPP_NUMBER,
      user: publicUser(user, token.uid),
    };
  }
  const messages = await listMessages(db, thread.id);
  const queue = await queueSnapshot(db);
  let queuePosition = null;
  if (thread.status === "waiting") {
    const index = queue.waiting.findIndex((entry) => entry.id === thread.id);
    queuePosition = index >= 0 ? index + 1 : null;
  }
  return {
    thread,
    messages,
    waitingBanner: WAITING_BANNER,
    queuePosition,
    waitingCount: queue.waitingCount,
    whatsapp: WHATSAPP_NUMBER,
    user: publicUser(user, token.uid),
  };
}

async function startSupportChatHandler(request) {
  const { token, user } = await customer(request);
  let thread = await findOpenThreadForUser(db, token.uid);
  if (!thread) {
    const initial = optionalText(request.body?.message, 2000);
    const ref = await db.collection("supportThreads").add({
      ownerId: token.uid,
      status: "waiting",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastMessageAt: FieldValue.serverTimestamp(),
      lastMessagePreview: initial || "Support request opened",
      unreadByAdmin: 1,
      unreadByUser: 0,
      adminJoinedAt: null,
      resolvedAt: null,
      userName: user?.name || "",
      userEmail: user?.email || "",
      userShopName: user?.shopName || "",
      userMobile: user?.mobile || "",
    });
    thread = { id: ref.id, ...plain((await ref.get()).data()) };
    await addSystemMessage(db, thread.id, WAITING_BANNER);
    if (initial) {
      await db.collection("supportMessages").add({
        threadId: thread.id,
        senderId: token.uid,
        senderRole: "user",
        text: initial,
        imageId: null,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  }
  const messages = await listMessages(db, thread.id);
  const queue = await queueSnapshot(db);
  let queuePosition = null;
  if (thread.status === "waiting") {
    const index = queue.waiting.findIndex((entry) => entry.id === thread.id);
    queuePosition = index >= 0 ? index + 1 : null;
  }
  return {
    thread,
    messages,
    waitingBanner: WAITING_BANNER,
    queuePosition,
    waitingCount: queue.waitingCount,
    whatsapp: WHATSAPP_NUMBER,
  };
}

async function sendSupportMessageHandler(request) {
  const { token } = await customer(request);
  const textBody = optionalText(request.body?.message ?? request.body?.text, 4000);
  const imageData = typeof request.body?.imageDataUrl === "string" ? request.body.imageDataUrl : "";
  const mimeType = typeof request.body?.mimeType === "string" ? request.body.mimeType : "";
  const replyToId = optionalText(request.body?.replyToId, 128);
  if (!textBody && !imageData) fail(400, "invalid-argument", "Write a message or attach an image.");

  let thread = await findOpenThreadForUser(db, token.uid);
  if (!thread) {
    const ref = await db.collection("supportThreads").add({
      ownerId: token.uid,
      status: "waiting",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastMessageAt: FieldValue.serverTimestamp(),
      lastMessagePreview: textBody || "Image attached",
      unreadByAdmin: 1,
      unreadByUser: 0,
      adminJoinedAt: null,
      resolvedAt: null,
      userName: "",
      userEmail: "",
      userShopName: "",
      userMobile: "",
    });
    const userSnap = await db.doc(`users/${token.uid}`).get();
    if (userSnap.exists) {
      const profile = userSnap.data();
      await ref.set({
        userName: profile.name || "",
        userEmail: profile.email || "",
        userShopName: profile.shopName || "",
        userMobile: profile.mobile || "",
      }, { merge: true });
    }
    await addSystemMessage(db, ref.id, WAITING_BANNER);
    thread = { id: ref.id, ...plain((await ref.get()).data()) };
  }

  if (thread.status === "resolved" || thread.status === "closed") {
    fail(412, "failed-precondition", "This support conversation was closed. Start a new Chat with Admin request.");
  }

  const replyTo = await resolveReplyTo(db, thread.id, replyToId, fail);

  let imageId = null;
  if (imageData) {
    const saved = await saveChatImage(db, {
      ownerId: token.uid,
      uploaderId: token.uid,
      threadId: thread.id,
      mimeType,
      dataUrl: imageData,
    });
    imageId = saved.id;
  }

  await db.collection("supportMessages").add({
    threadId: thread.id,
    senderId: token.uid,
    senderRole: "user",
    text: textBody || (imageId ? "Sent an image" : ""),
    imageId,
    replyTo: replyTo || null,
    createdAt: FieldValue.serverTimestamp(),
  });

  await db.doc(`supportThreads/${thread.id}`).set({
    lastMessageAt: FieldValue.serverTimestamp(),
    lastMessagePreview: textBody || "Image attached",
    updatedAt: FieldValue.serverTimestamp(),
    unreadByAdmin: Number(thread.unreadByAdmin || 0) + 1,
  }, { merge: true });

  const refreshed = plain((await db.doc(`supportThreads/${thread.id}`).get()).data());
  const messages = await listMessages(db, thread.id);
  const queue = await queueSnapshot(db);
  let queuePosition = null;
  if (refreshed.status === "waiting") {
    const index = queue.waiting.findIndex((entry) => entry.id === thread.id);
    queuePosition = index >= 0 ? index + 1 : null;
  }
  return {
    thread: { id: thread.id, ...refreshed },
    messages,
    waitingBanner: WAITING_BANNER,
    queuePosition,
    waitingCount: queue.waitingCount,
  };
}

async function deleteSupportMessageHandler(request) {
  const { token } = await customer(request);
  const messageId = text(request.body?.messageId, "message ID", 128);
  const snap = await db.doc(`supportMessages/${messageId}`).get();
  if (!snap.exists) fail(404, "not-found", "Message not found.");
  const message = plain(snap.data());
  if (message.senderRole === "system") fail(403, "permission-denied", "System messages cannot be deleted.");
  if (message.senderId !== token.uid || message.senderRole !== "user") {
    fail(403, "permission-denied", "You can only delete your own messages.");
  }
  const threadSnap = await db.doc(`supportThreads/${message.threadId}`).get();
  if (!threadSnap.exists) fail(404, "not-found", "Conversation not found.");
  const thread = plain(threadSnap.data());
  if (thread.ownerId !== token.uid) fail(403, "permission-denied", "You cannot delete this message.");

  await softDeleteSupportMessage(db, snap, message);
  const messages = await refreshThreadPreview(db, message.threadId);
  const fresh = plain((await db.doc(`supportThreads/${message.threadId}`).get()).data());
  return {
    ok: true,
    thread: { id: message.threadId, ...fresh },
    messages,
  };
}

async function editSupportMessageHandler(request) {
  const { token } = await customer(request);
  const messageId = text(request.body?.messageId, "message ID", 128);
  const nextText = text(request.body?.message, "message", 4000);
  const snap = await db.doc(`supportMessages/${messageId}`).get();
  if (!snap.exists) fail(404, "not-found", "Message not found.");
  const message = plain(snap.data());
  if (message.senderRole === "system") fail(403, "permission-denied", "System messages cannot be edited.");
  if (message.deleted) fail(412, "failed-precondition", "Deleted messages cannot be edited.");
  if (message.senderId !== token.uid || message.senderRole !== "user") {
    fail(403, "permission-denied", "You can only edit your own messages.");
  }
  if (!String(message.text || "").trim()) {
    fail(403, "permission-denied", "Only text messages can be edited.");
  }
  const threadSnap = await db.doc(`supportThreads/${message.threadId}`).get();
  if (!threadSnap.exists) fail(404, "not-found", "Conversation not found.");
  const thread = plain(threadSnap.data());
  if (thread.ownerId !== token.uid) fail(403, "permission-denied", "You cannot edit this message.");
  if (thread.status !== "waiting" && thread.status !== "active") {
    fail(412, "failed-precondition", "This support conversation is closed.");
  }

  await updateSupportMessageText(db, snap, message, nextText);
  const messages = await refreshThreadPreview(db, message.threadId);
  const fresh = plain((await db.doc(`supportThreads/${message.threadId}`).get()).data());
  return {
    ok: true,
    thread: { id: message.threadId, ...fresh },
    messages,
  };
}

async function adminSupportQueueHandler(request) {
  await administrator(request);
  const queue = await queueSnapshot(db);
  const [waiting, active, recent] = await Promise.all([
    enrichThreads(db, queue.waiting),
    enrichThreads(db, queue.active),
    enrichThreads(db, queue.recent),
  ]);
  return {
    waiting,
    active,
    recent,
    waitingCount: waiting.length,
    activeCount: active.length,
    waitingBanner: WAITING_BANNER,
  };
}

async function adminOpenSupportHandler(request) {
  const adminToken = await administrator(request);
  let threadId = typeof request.body?.threadId === "string" ? request.body.threadId.trim() : "";
  const queue = await queueSnapshot(db);

  if (!threadId) {
    if (!queue.waiting.length) fail(404, "not-found", "No users are waiting for support.");
    threadId = queue.waiting[0].id;
  }

  const ref = db.doc(`supportThreads/${threadId}`);
  const snap = await ref.get();
  if (!snap.exists) fail(404, "not-found", "Support request not found.");
  const thread = plain(snap.data());
  if (thread.status === "resolved" || thread.status === "closed") {
    fail(412, "failed-precondition", "This support request is already closed.");
  }

  const wasWaiting = thread.status === "waiting";
  if (wasWaiting || thread.status === "active") {
    await ref.set({
      status: "active",
      adminJoinedAt: thread.adminJoinedAt || FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      unreadByAdmin: 0,
      assignedAdminId: adminToken.uid,
    }, { merge: true });
    if (wasWaiting) {
      await addSystemMessage(db, threadId, "The administrator has joined this conversation and is available now.");
      await ref.set({
        unreadByUser: Number(thread.unreadByUser || 0) + 1,
        lastMessageAt: FieldValue.serverTimestamp(),
        lastMessagePreview: "Admin joined the conversation",
      }, { merge: true });
    }
  }

  const fresh = { id: threadId, ...plain((await ref.get()).data()) };
  const userSnap = await db.doc(`users/${fresh.ownerId}`).get();
  const messages = await listMessages(db, threadId);
  return {
    thread: fresh,
    user: userSnap.exists ? publicUser(plain(userSnap.data()), fresh.ownerId) : { id: fresh.ownerId },
    messages,
  };
}

async function adminSendSupportMessageHandler(request) {
  const adminToken = await administrator(request);
  const threadId = text(request.body?.threadId, "thread ID", 128);
  const textBody = optionalText(request.body?.message ?? request.body?.text, 4000);
  const imageData = typeof request.body?.imageDataUrl === "string" ? request.body.imageDataUrl : "";
  const mimeType = typeof request.body?.mimeType === "string" ? request.body.mimeType : "";
  const replyToId = optionalText(request.body?.replyToId, 128);
  if (!textBody && !imageData) fail(400, "invalid-argument", "Write a message or attach an image.");

  const ref = db.doc(`supportThreads/${threadId}`);
  const snap = await ref.get();
  if (!snap.exists) fail(404, "not-found", "Support request not found.");
  const thread = plain(snap.data());
  if (thread.status === "resolved" || thread.status === "closed") {
    fail(412, "failed-precondition", "This conversation is closed.");
  }
  if (thread.status === "waiting") {
    await ref.set({
      status: "active",
      adminJoinedAt: FieldValue.serverTimestamp(),
      assignedAdminId: adminToken.uid,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await addSystemMessage(db, threadId, "The administrator has joined this conversation and is available now.");
  }

  const replyTo = await resolveReplyTo(db, threadId, replyToId, fail);

  let imageId = null;
  if (imageData) {
    const saved = await saveChatImage(db, {
      ownerId: adminToken.uid,
      uploaderId: adminToken.uid,
      threadId,
      mimeType,
      dataUrl: imageData,
    });
    imageId = saved.id;
  }

  await db.collection("supportMessages").add({
    threadId,
    senderId: adminToken.uid,
    senderRole: "admin",
    text: textBody || (imageId ? "Sent an image" : ""),
    imageId,
    replyTo: replyTo || null,
    createdAt: FieldValue.serverTimestamp(),
  });

  await ref.set({
    lastMessageAt: FieldValue.serverTimestamp(),
    lastMessagePreview: textBody || "Image attached",
    updatedAt: FieldValue.serverTimestamp(),
    unreadByUser: Number(thread.unreadByUser || 0) + 1,
    unreadByAdmin: 0,
    status: "active",
  }, { merge: true });

  const messages = await listMessages(db, threadId);
  const fresh = { id: threadId, ...plain((await ref.get()).data()) };
  return { thread: fresh, messages };
}

async function adminGetSupportMessagesHandler(request) {
  await administrator(request);
  const threadId = text(request.body?.threadId, "thread ID", 128);
  const snap = await db.doc(`supportThreads/${threadId}`).get();
  if (!snap.exists) fail(404, "not-found", "Support request not found.");
  const thread = { id: threadId, ...plain(snap.data()) };
  const userSnap = await db.doc(`users/${thread.ownerId}`).get();
  const messages = await listMessages(db, threadId);
  await db.doc(`supportThreads/${threadId}`).set({ unreadByAdmin: 0 }, { merge: true });
  return {
    thread,
    user: userSnap.exists ? publicUser(plain(userSnap.data()), thread.ownerId) : { id: thread.ownerId },
    messages,
  };
}

async function adminDeleteSupportMessageHandler(request) {
  await administrator(request);
  const messageId = text(request.body?.messageId, "message ID", 128);
  const snap = await db.doc(`supportMessages/${messageId}`).get();
  if (!snap.exists) fail(404, "not-found", "Message not found.");
  const message = plain(snap.data());
  if (message.senderRole === "system") fail(403, "permission-denied", "System messages cannot be deleted.");
  const threadSnap = await db.doc(`supportThreads/${message.threadId}`).get();
  if (!threadSnap.exists) fail(404, "not-found", "Conversation not found.");

  await softDeleteSupportMessage(db, snap, message);
  const messages = await refreshThreadPreview(db, message.threadId);
  const fresh = plain((await db.doc(`supportThreads/${message.threadId}`).get()).data());
  const userSnap = await db.doc(`users/${fresh.ownerId}`).get();
  return {
    ok: true,
    thread: { id: message.threadId, ...fresh },
    user: userSnap.exists ? publicUser(plain(userSnap.data()), fresh.ownerId) : { id: fresh.ownerId },
    messages,
  };
}

async function adminEditSupportMessageHandler(request) {
  const adminToken = await administrator(request);
  const messageId = text(request.body?.messageId, "message ID", 128);
  const nextText = text(request.body?.message, "message", 4000);
  const snap = await db.doc(`supportMessages/${messageId}`).get();
  if (!snap.exists) fail(404, "not-found", "Message not found.");
  const message = plain(snap.data());
  if (message.senderRole === "system") fail(403, "permission-denied", "System messages cannot be edited.");
  if (message.deleted) fail(412, "failed-precondition", "Deleted messages cannot be edited.");
  if (message.senderRole !== "admin" || message.senderId !== adminToken.uid) {
    fail(403, "permission-denied", "You can only edit your own admin messages.");
  }
  if (!String(message.text || "").trim()) {
    fail(403, "permission-denied", "Only text messages can be edited.");
  }
  const threadSnap = await db.doc(`supportThreads/${message.threadId}`).get();
  if (!threadSnap.exists) fail(404, "not-found", "Conversation not found.");

  await updateSupportMessageText(db, snap, message, nextText);
  const messages = await refreshThreadPreview(db, message.threadId);
  const fresh = plain((await db.doc(`supportThreads/${message.threadId}`).get()).data());
  const userSnap = await db.doc(`users/${fresh.ownerId}`).get();
  return {
    ok: true,
    thread: { id: message.threadId, ...fresh },
    user: userSnap.exists ? publicUser(plain(userSnap.data()), fresh.ownerId) : { id: fresh.ownerId },
    messages,
  };
}

async function adminResolveSupportHandler(request) {
  await administrator(request);
  const threadId = text(request.body?.threadId, "thread ID", 128);
  const openNext = Boolean(request.body?.openNext);
  const ref = db.doc(`supportThreads/${threadId}`);
  const snap = await ref.get();
  if (!snap.exists) fail(404, "not-found", "Support request not found.");
  const thread = plain(snap.data());
  if (thread.status !== "resolved" && thread.status !== "closed") {
    await addSystemMessage(db, threadId, "The administrator marked this conversation as resolved and closed.");
    await ref.set({
      status: "resolved",
      resolvedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastMessageAt: FieldValue.serverTimestamp(),
      lastMessagePreview: "Conversation resolved",
      unreadByUser: Number(thread.unreadByUser || 0) + 1,
      unreadByAdmin: 0,
    }, { merge: true });
  }

  let next = null;
  if (openNext) {
    const queue = await queueSnapshot(db);
    if (queue.waiting.length) {
      const nextId = queue.waiting[0].id;
      const nextRef = db.doc(`supportThreads/${nextId}`);
      const nextSnap = await nextRef.get();
      if (nextSnap.exists && nextSnap.data().status === "waiting") {
        await nextRef.set({
          status: "active",
          adminJoinedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          unreadByAdmin: 0,
        }, { merge: true });
        await addSystemMessage(db, nextId, "The administrator has joined this conversation and is available now.");
        await nextRef.set({
          unreadByUser: Number(nextSnap.data().unreadByUser || 0) + 1,
          lastMessageAt: FieldValue.serverTimestamp(),
          lastMessagePreview: "Admin joined the conversation",
        }, { merge: true });
        const userSnap = await db.doc(`users/${nextSnap.data().ownerId}`).get();
        next = {
          thread: { id: nextId, ...plain((await nextRef.get()).data()) },
          user: userSnap.exists ? publicUser(plain(userSnap.data()), nextSnap.data().ownerId) : { id: nextSnap.data().ownerId },
          messages: await listMessages(db, nextId),
        };
      }
    }
  }

  const queue = await queueSnapshot(db);
  const [waiting, active] = await Promise.all([
    enrichThreads(db, queue.waiting),
    enrichThreads(db, queue.active),
  ]);
  return {
    ok: true,
    next,
    waiting,
    active,
    waitingCount: waiting.length,
    activeCount: active.length,
  };
}

async function getSupportImageHandler(request) {
  const enabled = await customer(request).catch(async (error) => {
    try {
      const token = await administrator(request);
      return { token, isAdmin: true };
    } catch {
      throw error;
    }
  });
  const imageId = text(request.body?.imageId, "image ID", 128);
  const snap = await db.doc(`supportImages/${imageId}`).get();
  if (!snap.exists) fail(404, "not-found", "Image not found.");
  const meta = plain(snap.data());
  if (isOlderThanRetention(meta.createdAt)) {
    await removeSupportImage(db, imageId);
    fail(404, "not-found", "Image not found.");
  }
  const threadSnap = await db.doc(`supportThreads/${meta.threadId}`).get();
  if (!threadSnap.exists) fail(404, "not-found", "Image not found.");
  const thread = threadSnap.data();
  const isAdminUser = enabled.isAdmin || false;
  if (!isAdminUser && thread.ownerId !== enabled.token.uid) {
    fail(403, "permission-denied", "You cannot view this image.");
  }
  if (!meta.dataUrl) fail(404, "not-found", "Image file is missing.");
  return {
    imageId,
    mimeType: meta.mimeType,
    dataUrl: meta.dataUrl,
  };
}

const CLAIM_STATUSES = ["submitted", "reviewing", "approved", "rejected", "resolved"];

function attachClaimQr(claim, qr) {
  if (!qr) return { ...claim, qr: null };
  return {
    ...claim,
    qr: {
      id: qr.id,
      code: qr.code,
      productName: qr.productName || "",
      productModel: qr.productModel || "",
      brandName: qr.brandName || "",
      shopName: qr.shopName || "",
      status: qr.status || "",
      activated: qr.status === "activated",
      purchaseAt: qr.saleDate || qr.activatedAt || qr.soldAt || null,
      warrantyExpiresAt: qr.warrantyExpiresAt || null,
      warrantyStatus: warrantyState(qr),
    },
  };
}

async function loadClaimQrMap(claims) {
  const map = new Map();
  const hasTarget = claims.some((claim) => claim.qrId || claim.qrCode);
  if (!hasTarget) return map;
  const all = await db.collection("qrs").get();
  all.docs.forEach((document) => {
    const qr = { id: document.id, ...plain(document.data()) };
    if (qr.code) map.set(qr.code, qr);
    map.set(qr.id, qr);
  });
  return map;
}

function claimVisibleTo(claim, token, user) {
  if (user?.role === "admin_console") return true;
  if (claim.ownerId === token.uid) return true;
  if (claim.customerUserId && claim.customerUserId === token.uid) return true;
  const email = String(user?.email || "").toLowerCase();
  return Boolean(email && claim.customerEmail && String(claim.customerEmail).toLowerCase() === email);
}

async function nextClaimCode() {
  const snap = await db.collection("claims").get();
  const sequence = String(snap.size + 1).padStart(4, "0");
  return `CLM-${sequence}-${autoId().slice(0, 4).toUpperCase()}`;
}

async function submitClaimHandler(request) {
  const qrCode = text(request.body?.qrCode ?? request.body?.code, "QR code", 200);
  const category = optionalText(request.body?.category, 64) || "repair";
  const description = text(request.body?.description, "claim description", 4000);
  const customerName = optionalText(request.body?.customerName, 160);
  const customerPhone = optionalText(request.body?.customerPhone, 50);
  const customerEmail = optionalText(request.body?.customerEmail, 160);
  const found = await findQr(qrCode);
  const qr = { id: found.id, ...plain(found.data()) };
  let customerUserId = null;
  if (request.identity && request.identity.uid) {
    customerUserId = tokenFor(request.identity).uid;
  }
  const claimId = `claim-${autoId()}`;
  const code = await nextClaimCode();
  const at = now();
  const ref = db.doc(`claims/${claimId}`);
  await ref.set({
    code,
    ownerId: qr.ownerId,
    qrId: found.id,
    qrCode: qr.code,
    customerUserId,
    customerName: customerName || qr.customerName || "",
    customerPhone: customerPhone || qr.customerPhone || "",
    customerEmail: customerEmail || qr.customerEmail || "",
    category,
    description,
    status: "submitted",
    resolutionNote: "",
    timeline: [{ status: "submitted", at, note: "Claim submitted by the customer." }],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await audit(customerUserId || qr.ownerId, "claim_submitted", claimId, { qrCode: qr.code, category });
  const stored = { id: claimId, ...plain((await ref.get()).data()) };
  return { ok: true, claim: attachClaimQr(stored, qr) };
}

async function getClaimsHandler(request) {
  const { token, user } = await customer(request);
  const snap = await db.collection("claims").get();
  const claims = snap.docs.map((document) => ({ id: document.id, ...plain(document.data()) }));
  const role = user?.role;
  let scoped;
  if (role === "admin_console") scoped = claims;
  else if (role === "merchant") scoped = claims.filter((claim) => claim.ownerId === token.uid);
  else scoped = claims.filter((claim) => claimVisibleTo(claim, token, user));
  const qrMap = await loadClaimQrMap(scoped);
  const enriched = scoped
    .map((claim) => attachClaimQr(claim, qrMap.get(claim.qrId) || qrMap.get(claim.qrCode)))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return { claims: enriched };
}

async function getClaimHandler(request) {
  const { token, user } = await customer(request);
  const claimId = text(request.body?.claimId, "claim ID", 128);
  const snap = await db.doc(`claims/${claimId}`).get();
  if (!snap.exists) fail(404, "not-found", "Claim not found.");
  const claim = { id: snap.id, ...plain(snap.data()) };
  if (!claimVisibleTo(claim, token, user)) fail(403, "permission-denied", "You cannot view this claim.");
  const qrMap = await loadClaimQrMap([claim]);
  return { claim: attachClaimQr(claim, qrMap.get(claim.qrId) || qrMap.get(claim.qrCode)) };
}

async function updateClaimStatusHandler(request) {
  const { token, user } = await customer(request);
  const claimId = text(request.body?.claimId, "claim ID", 128);
  const status = text(request.body?.status, "claim status", 32);
  if (!CLAIM_STATUSES.includes(status)) fail(400, "invalid-argument", "Choose a valid claim status.");
  const ref = db.doc(`claims/${claimId}`);
  const snap = await ref.get();
  if (!snap.exists) fail(404, "not-found", "Claim not found.");
  const claim = plain(snap.data());
  const isAdminUser = user?.role === "admin_console";
  if (!isAdminUser && claim.ownerId !== token.uid) {
    fail(403, "permission-denied", "You cannot update this claim.");
  }
  const note = optionalText(request.body?.resolutionNote, 2000);
  if (claim.status !== status || note) {
    const at = now();
    const timeline = Array.isArray(claim.timeline) ? [...claim.timeline] : [];
    timeline.push({ status, at, note: note || "" });
    const payload = {
      status,
      timeline,
      updatedAt: FieldValue.serverTimestamp(),
      reviewedBy: token.uid,
      reviewedAt: at,
    };
    if (note) payload.resolutionNote = note;
    await ref.set(payload, { merge: true });
    await audit(token.uid, "claim_status_updated", claimId, { status });
  }
  const stored = { id: claimId, ...plain((await ref.get()).data()) };
  const qrMap = await loadClaimQrMap([stored]);
  return { ok: true, claim: attachClaimQr(stored, qrMap.get(stored.qrId) || qrMap.get(stored.qrCode)) };
}

const API_HANDLERS = {
  sendVerificationEmail: sendVerificationEmailHandler,
  confirmEmailVerification: confirmEmailVerificationHandler,
  sendPasswordReset: sendPasswordResetHandler,
  ensureUser: ensureUserHandler,
  updateProfile: updateProfileHandler,
  getDashboard: getDashboardHandler,
  createStickerRequest: createStickerRequestHandler,
  requestAccess: requestAccessHandler,
  getQr: getQrHandler,
  getPublicQr: getPublicQrHandler,
  recordSale: recordSaleHandler,
  activateQr: activateQrHandler,
  deleteQr: deleteQrHandler,
  deleteQrs: deleteQrsHandler,
  deleteQrGroup: deleteQrGroupHandler,
  updateSaleAmount: updateSaleAmountHandler,
  returnSale: returnSaleHandler,
  startPayment: startPaymentHandler,
  upgradeStickerRequestToPhysical: upgradeStickerRequestToPhysicalHandler,
  getSandboxPayment: getSandboxPaymentHandler,
  completeSandboxPayment: completeSandboxPaymentHandler,
  markNotificationRead: markNotificationReadHandler,
  deleteNotification: deleteNotificationHandler,
  clearNotifications: clearNotificationsHandler,
  adminPasswordLogin: adminPasswordLoginHandler,
  adminSummary: adminSummaryHandler,
  generateQrs: generateQrsHandler,
  updateStickerRequest: updateStickerRequestHandler,
  deleteStickerRequest: deleteStickerRequestHandler,
  setStickerPricing: setStickerPricingHandler,
  setUserAccess: setUserAccessHandler,
  resolveAccessRequest: resolveAccessRequestHandler,
  revokeUserAccess: revokeUserAccessHandler,
  setUserStatus: setUserStatusHandler,
  sendNotification: sendNotificationHandler,
  getAiChat: getAiChatHandler,
  clearAiChat: clearAiChatHandler,
  aiChat: aiChatHandler,
  deleteAiMessage: deleteAiMessageHandler,
  getAiInsights: getAiInsightsHandler,
  getSupportThread: getSupportThreadHandler,
  startSupportChat: startSupportChatHandler,
  sendSupportMessage: sendSupportMessageHandler,
  deleteSupportMessage: deleteSupportMessageHandler,
  editSupportMessage: editSupportMessageHandler,
  getSupportImage: getSupportImageHandler,
  getClaims: getClaimsHandler,
  getClaim: getClaimHandler,
  submitClaim: submitClaimHandler,
  updateClaimStatus: updateClaimStatusHandler,
  adminSupportQueue: adminSupportQueueHandler,
  adminOpenSupport: adminOpenSupportHandler,
  adminSendSupportMessage: adminSendSupportMessageHandler,
  adminGetSupportMessages: adminGetSupportMessagesHandler,
  adminDeleteSupportMessage: adminDeleteSupportMessageHandler,
  adminEditSupportMessage: adminEditSupportMessageHandler,
  adminResolveSupport: adminResolveSupportHandler,
  resetDemoData: resetDemoDataHandler,
};

export async function getPublicQr(code) {
  return loadPublicQrForCustomer(code);
}

export async function handleApi(name, data = {}, options = {}) {
  const handler = API_HANDLERS[name];
  if (!handler) {
    throw new ApiError(404, "not-found", "Route not found.");
  }
  const payload = data || {};
  const request = {
    identity: resolveIdentity(options),
    body: payload,
    query: payload,
  };
  try {
    const result = await handler(request);
    if (result && typeof result === "object") return { ...result, serverTime: Date.now() };
    return result;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error && typeof error.status === "number" && typeof error.code === "string") {
      throw new ApiError(error.status, error.code, error.message || "Request failed.");
    }
    throw new ApiError(500, "internal", error && error.message ? error.message : "Something went wrong.");
  }
}
