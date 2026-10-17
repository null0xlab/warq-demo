import { createDemoDatabase } from "./firestore.js";

const db = createDemoDatabase();

function durationOf(qr) {
  const source = qr?.warrantyDuration;
  if (!source || typeof source !== "object") return null;
  const value = {
    months: Number(source.months) || 0,
    days: Number(source.days) || 0,
    hours: Number(source.hours) || 0,
    minutes: Number(source.minutes) || 0,
    seconds: Number(source.seconds) || 0,
  };
  return Object.values(value).some(Boolean) ? value : null;
}

export function customerWarrantyState(qr, nowMs = Date.now()) {
  if (!qr) return "unknown";
  if (qr.status === "returned") return "voided";
  if (!durationOf(qr)) return "no_warranty";
  if (qr.status !== "activated") return "pending_activation";
  if (!qr.warrantyExpiresAt) return "pending_activation";
  return new Date(qr.warrantyExpiresAt).getTime() > nowMs ? "active" : "expired";
}

export function customerWarrantyView(qr, nowMs = Date.now()) {
  const duration = durationOf(qr);
  const state = customerWarrantyState(qr, nowMs);
  const activated = qr.status === "activated" || Boolean(qr.activatedAt || qr.activationDate);
  return {
    code: qr.code,
    productName: qr.productName || "",
    productModel: qr.productModel || "",
    brandName: qr.brandName || "",
    shopName: qr.shopName || "",
    status: qr.status || "generated",
    state,
    activated: Boolean(activated && qr.status !== "returned"),
    soldAt: qr.soldAt || qr.saleDate || qr.activatedAt || qr.activationDate || null,
    warrantyExpiresAt: qr.warrantyExpiresAt || null,
    warrantyDuration: duration,
    actualPrice: qr.actualPrice === null || qr.actualPrice === undefined ? null : Number(qr.actualPrice),
    customerName: qr.customerName || "",
    customerPhone: qr.customerPhone || "",
    customerEmail: qr.customerEmail || "",
    ownerId: qr.ownerId || "",
  };
}

export async function listCustomerWarranties(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return [];
  const snapshot = await db.collection("qrs").get();
  return snapshot.docs
    .map(entry => entry.data())
    .filter(row => String(row.customerEmail || "").trim().toLowerCase() === normalized)
    .map(row => customerWarrantyView(row))
    .sort((a, b) => String(b.soldAt || "").localeCompare(String(a.soldAt || "")));
}

export async function lookupWarrantyByCode(code) {
  const value = String(code || "").trim().toUpperCase();
  if (!value) return null;
  const snapshot = await db.collection("qrs").where("code", "==", value).limit(1).get();
  if (snapshot.empty) return null;
  return customerWarrantyView(snapshot.docs[0].data());
}
