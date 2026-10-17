import { AI_PROXY_URL } from "./config.js";

export const WHATSAPP_NUMBER = "01815533416";
export const WARQ_AI_MODEL = "openai/gpt-4o-mini";
const AI_TIMEOUT_MS = 30000;

export function whatsappChatUrlForPrompt(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "https://wa.me/";
  let international = digits;
  if (international.startsWith("00")) international = international.slice(2);
  else if (international.startsWith("0")) international = `880${international.slice(1)}`;
  return `https://wa.me/${international}`;
}

export const WARQ_SYSTEM_PROMPT = `You are the official WarQ Support assistant for the WarQ Smart Warranty Card System.

Your ONLY job is to help with WarQ-related questions: product features, QR warranty stickers, activation, subscriptions, user accounts, payments (bKash/Nagad), sticker requests, scanning QR codes, admin contact, and WhatsApp contact.

If a user asks about anything unrelated to WarQ (general knowledge, other products, coding help, politics, etc.), politely refuse and say you can only assist with WarQ-related questions and support. Suggest switching to "Chat with Admin" for human help when appropriate.

## About WarQ
WarQ turns product stickers into secure digital warranty records using unique QR codes.
Merchants register with email/password, verify email, complete a business profile, then subscribe (or request free admin access) to generate and manage QR warranty codes.

## Core features
1. Account: email/password registration, email verification, password reset, business profile (name, shop name, Bangladeshi phone, shop/delivery address, district, upazila).
2. Subscriptions (BDT):
   - 1 Month: 50 BDT
   - 6 Months: 200 BDT (Most Popular)
   - 1 Year: 350 BDT (Best Value)
   Users may also request free access; an administrator can approve unlimited or timed access.
3. QR sticker requests: request digital QR folders and/or physical printed stickers. Physical orders may include delivery charge.
4. QR inventory: folders of QR codes per product; print sheets or download; sell/activate a QR when a product is sold.
5. Warranty: each QR can have a warranty duration (months/days/hours/minutes/seconds). Warranty countdown starts when the QR is activated/sold. Returned products void warranty and that QR cannot be sold again.
6. Sales & reports: record sales, track revenue/profit, returns, warranty status charts.
7. Scanner: scan WarQ QR codes to view/activate product warranty details.
8. Payments: bKash and Nagad gateways (when merchant credentials are configured on the server).
9. Notifications: administrators can send announcements to users.
10. Chat Board: General Conversation (this AI) or Chat with Admin (human support with image uploads).

## How to activate a warranty
- Own an active subscription/access and completed profile.
- Generate QR codes for a product (Requests / QR inventory).
- When selling the product, scan or open the QR and record the sale / activate — warranty starts immediately.

## How to scan a QR
Use the Scan button in the bottom navigation (or open a shared WarQ QR link). Sign in with the merchant account that owns the QR to view or activate it.

## How to request QR codes
Open Requests after subscription/access is active. Enter product details and quantities. Choose digital generation and/or physical sticker fulfillment, then pay if required.

## Subscription system
Buy a plan from Subscription using bKash/Nagad when configured, or request free access for admin review. Access unlocks QR generation, inventory, scanner activation, and related tools until the plan expires (unless unlimited access was granted).

## Contact
- WhatsApp: [${WHATSAPP_NUMBER}](${whatsappChatUrlForPrompt(WHATSAPP_NUMBER)})
- In-app: Chat Board → Chat with Admin for screenshots and live help.

When users ask for WhatsApp (e.g. "What is your WhatsApp number?", "How can I contact you on WhatsApp?", "Give me your WhatsApp contact.", "I want to talk on WhatsApp."), reply with a clickable Markdown link exactly like: WhatsApp: [${WHATSAPP_NUMBER}](${whatsappChatUrlForPrompt(WHATSAPP_NUMBER)}) and brief guidance to tap/click that number to open WhatsApp for WarQ support.

## Response formatting (mandatory)
- Format replies with clean Markdown so the Chat Board can render them professionally.
- Use **bold**, *italic*, headings (# ## ###), bullet lists (-), numbered lists (1.), blockquotes (>), inline code (\`code\`), and fenced code blocks when helpful.
- Use [link text](https://example.com) for links. Prefer short paragraphs and clear structure.
- Do NOT use raw HTML, scripts, or iframe tags — Markdown only.
- Keep answers concise and scannable on mobile.

Be concise, friendly, and accurate. Prefer step-by-step WarQ UI guidance. Never invent features that do not exist. Never reveal API keys, admin passwords, server paths, or internal secrets.`;

function offlineError(message) {
  const error = new Error(message || "The WarQ assistant is offline.");
  error.code = "ai/offline";
  return error;
}

function extractProxyContent(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (typeof payload.content === "string") return payload.content;
  const choice = Array.isArray(payload.choices) ? payload.choices[0] : null;
  if (choice && choice.message && typeof choice.message.content === "string") return choice.message.content;
  if (typeof payload.reply === "string") return payload.reply;
  return null;
}

export async function callAiProxy({ messages }) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), AI_TIMEOUT_MS) : null;
  try {
    if (!AI_PROXY_URL) throw offlineError("The WarQ AI proxy is not configured.");
    const response = await fetch(AI_PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, model: WARQ_AI_MODEL }),
      signal: controller ? controller.signal : undefined,
    });
    if (!response.ok) throw offlineError(`The WarQ AI proxy responded with ${response.status}.`);
    const payload = await response.json().catch(() => null);
    const content = extractProxyContent(payload);
    if (typeof content !== "string" || !content.trim()) throw offlineError("The WarQ assistant returned an empty reply.");
    return content.trim();
  } catch (error) {
    if (error && error.code === "ai/offline") throw error;
    throw offlineError(error && error.message ? error.message : "The WarQ AI proxy is unavailable.");
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

function warrantyDuration(qr) {
  const raw = qr && qr.warrantyDuration;
  if (!raw || typeof raw !== "object") return null;
  const value = {
    months: Number(raw.months) || 0,
    days: Number(raw.days) || 0,
    hours: Number(raw.hours) || 0,
    minutes: Number(raw.minutes) || 0,
    seconds: Number(raw.seconds) || 0,
  };
  return Object.values(value).some(Boolean) ? value : null;
}

function durationLabel(duration) {
  if (!duration) return "no warranty";
  const parts = [];
  if (duration.months) parts.push(`${duration.months} Month${duration.months === 1 ? "" : "s"}`);
  if (duration.days) parts.push(`${duration.days} Day${duration.days === 1 ? "" : "s"}`);
  if (duration.hours) parts.push(`${duration.hours} Hour${duration.hours === 1 ? "" : "s"}`);
  if (duration.minutes) parts.push(`${duration.minutes} Minute${duration.minutes === 1 ? "" : "s"}`);
  if (duration.seconds) parts.push(`${duration.seconds} Second${duration.seconds === 1 ? "" : "s"}`);
  return parts.join(" ") || "no warranty";
}

function warrantyState(qr, nowMs = Date.now()) {
  if (qr && qr.status === "returned") return "voided";
  if (!warrantyDuration(qr)) return "no_warranty";
  if (!qr || qr.status !== "activated") return "pending_activation";
  if (!qr.warrantyExpiresAt) return "pending_activation";
  return new Date(qr.warrantyExpiresAt).getTime() > nowMs ? "active" : "expired";
}

function money(value) {
  return `BDT ${new Intl.NumberFormat("en-BD", { maximumFractionDigits: 2 }).format(Number(value) || 0)}`;
}

function summarizeQrs(qrs, nowMs = Date.now()) {
  const list = Array.isArray(qrs) ? qrs : [];
  const summary = {
    total: list.length,
    active: 0,
    expired: 0,
    voided: 0,
    noWarranty: 0,
    pending: 0,
    expiringSoon: 0,
    expiringSoonDays: 30,
    available: 0,
    activated: 0,
    expiringWithin: [],
  };
  for (const qr of list) {
    const state = warrantyState(qr, nowMs);
    if (state === "active") summary.active += 1;
    else if (state === "expired") summary.expired += 1;
    else if (state === "voided") summary.voided += 1;
    else if (state === "no_warranty") summary.noWarranty += 1;
    else if (state === "pending_activation") summary.pending += 1;
    if (qr && qr.status === "activated") summary.activated += 1;
    if (qr && (qr.status === "generated" || qr.status === "inactive")) summary.available += 1;
    if (state === "active" && qr && qr.warrantyExpiresAt) {
      const remaining = new Date(qr.warrantyExpiresAt).getTime() - nowMs;
      if (remaining <= summary.expiringSoonDays * DAY_MS) {
        summary.expiringSoon += 1;
        summary.expiringWithin.push({ code: qr.code, productName: qr.productName || "", expiresAt: qr.warrantyExpiresAt, days: Math.max(0, Math.ceil(remaining / DAY_MS)) });
      }
    }
  }
  summary.expiringWithin.sort((a, b) => a.days - b.days);
  return summary;
}

function summarizeSales(sales) {
  const list = Array.isArray(sales) ? sales : [];
  const net = list.filter((sale) => sale && sale.status !== "returned");
  const revenue = net.reduce((sum, sale) => sum + Number(sale.actualPrice ?? sale.defaultPrice ?? 0), 0);
  const cost = net.reduce((sum, sale) => sum + Number(sale.costPrice ?? 0), 0);
  return {
    total: list.length,
    net: net.length,
    returned: list.length - net.length,
    revenue: Math.round(revenue * 100) / 100,
    profit: Math.round((revenue - cost) * 100) / 100,
  };
}

function summarizeClaims(claims) {
  const list = Array.isArray(claims) ? claims : [];
  const pending = list.filter((claim) => claim && (claim.status === "submitted" || claim.status === "reviewing"));
  const decided = list.filter((claim) => claim && (claim.status === "approved" || claim.status === "rejected" || claim.status === "resolved"));
  return {
    total: list.length,
    pending: pending.length,
    decided: decided.length,
    recent: list.slice(0, 3),
  };
}

function topProductModel(sales) {
  const list = Array.isArray(sales) ? sales.filter((sale) => sale && sale.status !== "returned") : [];
  const map = new Map();
  for (const sale of list) {
    const key = sale.productModel || sale.productName || "Unknown product";
    const item = map.get(key) || { name: key, units: 0, revenue: 0 };
    item.units += 1;
    item.revenue += Number(sale.actualPrice ?? sale.defaultPrice ?? 0);
    map.set(key, item);
  }
  const ranked = [...map.values()].sort((a, b) => b.units - a.units || b.revenue - a.revenue);
  return ranked[0] || null;
}

function planList(plans) {
  if (!plans || typeof plans !== "object") return [];
  const order = ["monthly", "halfYearly", "yearly"];
  return order
    .filter((key) => plans[key])
    .map((key) => {
      const plan = plans[key];
      return { id: key, label: plan.label || plan.name || key, amount: Number(plan.amount) || 0, months: Number(plan.months) || 0 };
    });
}

export async function offlineAssistantReply({ message, history, context } = {}) {
  const source = String(message || "").toLowerCase();
  const ctx = context || {};
  const qrs = Array.isArray(ctx.qrs) ? ctx.qrs : [];
  const sales = Array.isArray(ctx.sales) ? ctx.sales : [];
  const claims = Array.isArray(ctx.claims) ? ctx.claims : [];
  const qrStats = summarizeQrs(qrs);
  const saleStats = summarizeSales(sales);
  const claimStats = summarizeClaims(claims);
  const plans = planList(ctx.plans);
  const user = ctx.user || null;
  const shopName = ctx.shopName || (user && user.shopName) || "your shop";
  const pricing = ctx.pricing || {};
  const has = (words) => words.some((word) => source.includes(word));
  const planText = plans.length
    ? plans.map((plan) => `- **${plan.label}** — ${money(plan.amount)}`).join("\n")
    : "- **1 Month** — BDT 50\n- **6 Months** — BDT 200\n- **1 Year** — BDT 350";

  if (has(["whatsapp", "wa.me", "contact number", "your number", "phone number of warq", "hotline"])) {
    return [
      `You can reach WarQ support on WhatsApp: [${WHATSAPP_NUMBER}](${whatsappChatUrlForPrompt(WHATSAPP_NUMBER)}).`,
      "",
      "Tap that number to open WhatsApp and send your question, screenshots, or claim details directly to the WarQ team.",
      "",
      "Inside the app you can also open **Chat Board → Chat with Admin** for live help with image uploads.",
    ].join("\n");
  }

  if (has(["claim", "complaint", "repair request", "replacement", "warranty claim", "defective", "broken"])) {
    const lines = [
      "# Warranty claims",
      "",
      "A claim lets a customer raise a repair, replacement or refund request against a sold product. Open the product from **Scan** (or the public warranty page) and choose **Raise a claim**, then pick a category and describe the issue.",
      "",
      `**${shopName}** currently has **${claimStats.total}** claim${claimStats.total === 1 ? "" : "s"} on record — **${claimStats.pending}** awaiting review and **${claimStats.decided}** already decided.`,
    ];
    if (claimStats.recent.length) {
      lines.push("", "Most recent:");
      for (const claim of claimStats.recent) {
        lines.push(`- \`${claim.code || claim.id}\` — ${claim.category || "claim"} — *${claim.status || "submitted"}*`);
      }
    }
    lines.push("", "Shopkeepers review and update claims from the **Claims** area of the dashboard.");
    return lines.join("\n");
  }

  if (has(["return", "returned", "voided", "void warranty", "refund the sale", "exchange"])) {
    return [
      "# Returned products and voided warranties",
      "",
      "Marking a sale as **returned** keeps the sale and its history permanently for audit, but it **voids the warranty**. The public page switches to *Warranty Voided* and the QR can never be sold again.",
      "",
      `In your records there are **${qrStats.voided}** voided / returned QR code${qrStats.voided === 1 ? "" : "s"} out of **${qrStats.total}** total, and **${saleStats.returned}** returned sale${saleStats.returned === 1 ? "" : "s"} out of **${saleStats.total}**.`,
      "",
      "Returned records are excluded from net revenue and net profit in every report.",
    ].join("\n");
  }

  if (has(["scan", "scanning", "customer see", "public page", "qr link", "without installing", "without an account"])) {
    return [
      "# How scanning works",
      "",
      "Every WarQ QR sticker points to a public page that needs **no account and no app install**.",
      "",
      "1. The customer scans the sticker with their phone camera.",
      "2. The page shows the product, the shop, the purchase date, the warranty duration and a **live countdown** to expiry.",
      "3. Your cost prices and customer personal details are never shown on that public page.",
      "",
      `**${shopName}** has **${qrStats.activated}** activated QR code${qrStats.activated === 1 ? "" : "s"} currently viewable by customers.`,
    ].join("\n");
  }

  if (has(["sticker", "pricing", "price", "cost", "pack", "physical", "print", "printed", "delivery charge", "order qr", "quantity"])) {
    const packSize = Number(pricing.stickerPackSize) || 300;
    const packPrice = Number(pricing.stickerPackPrice) || 50;
    const perSticker = Number(pricing.perStickerPrice) || (packPrice / packSize);
    const delivery = Number(pricing.deliveryCharge) || 0;
    return [
      "# QR stickers: pricing and ordering",
      "",
      "Open **Requests** to order QR codes for a product model. You can generate them **digitally** (instant, free) or as **physical printed stickers**.",
      "",
      `- Sticker pack: **${packSize} stickers for ${money(packPrice)}**`,
      `- Effective unit price: **${money(perSticker)} per sticker**`,
      `- Physical delivery charge: **${money(delivery)}**`,
      "",
      "Digital QR sheets need no payment. Physical packs require payment (bKash or Nagad) before they are prepared for delivery.",
      "",
      `You currently have **${qrStats.available}** unused QR code${qrStats.available === 1 ? "" : "s"} ready to sell.`,
    ].join("\n");
  }

  if (has(["plan", "subscription", "renew", "renewal", "subscribe", "upgrade", "membership"])) {
    const status = user && user.subscriptionStatus ? String(user.subscriptionStatus) : "unknown";
    const ends = user && user.subscriptionEndsAt ? new Date(user.subscriptionEndsAt).toLocaleDateString() : null;
    return [
      "# Subscription plans and renewal",
      "",
      "WarQ plans (paid with bKash or Nagad):",
      "",
      planText,
      "",
      `Your account status is **${status}**${ends ? ` and the current access ends on **${ends}**` : ""}. Renewing simply extends access from the existing end date, so you never lose remaining time.`,
      "",
      "If you cannot pay right now you can **Request free access** and an administrator will review it.",
    ].join("\n");
  }

  if (has(["report", "export", "excel", "xlsx", "pdf", "csv", "analytics", "download data"])) {
    return [
      "# Reports and exports",
      "",
      "Open **Reports** (Full Report) to build a period report and download it as **Excel (.xlsx)**, **Word (.docx)**, **PDF**, or **CSV**.",
      "",
      "Reports include product performance, best sellers, returns, the warranty register, monthly trends, the sales register and customer purchase details.",
      "",
      "All export formats share the same dashboard figures, so the numbers never disagree between files.",
    ].join("\n");
  }

  if (has(["access", "expired subscription", "inactive", "free access", "admin access", "no access", "unlock", "expiry of my account"])) {
    const status = user && user.subscriptionStatus ? String(user.subscriptionStatus) : "unknown";
    const ends = user && user.subscriptionEndsAt ? new Date(user.subscriptionEndsAt).toLocaleDateString() : null;
    const unlimited = user && user.unlimitedAccess ? "You currently have **unlimited access** granted by an administrator." : `Your access status is **${status}**${ends ? ` until **${ends}**` : ""}.`;
    return [
      "# Access and subscription status",
      "",
      unlimited,
      "",
      "To restore access you can either a) buy a plan from **Subscription**, or b) open **Subscription → Request free access** and let an administrator approve it.",
      "",
      "Access unlocks QR generation, the inventory of folders, the scanner and sale activation.",
    ].join("\n");
  }

  if (has(["profile", "verify", "verification", "email", "password", "sign in", "signin", "log in", "login", "reset"])) {
    const missing = [];
    if (user) {
      if (!`${user.name || ""}`.trim()) missing.push("Full Name");
      if (!`${user.shopName || ""}`.trim()) missing.push("Shop Name");
      if (!`${user.mobile || ""}`.trim()) missing.push("Phone Number");
      if (!`${user.shopAddress || ""}`.trim()) missing.push("Shop Address");
      if (!`${user.deliveryAddress || ""}`.trim()) missing.push("Delivery Address");
      if (!`${user.district || ""}`.trim()) missing.push("District");
      if (!`${user.upazila || ""}`.trim()) missing.push("Upazila");
    }
    const profileLine = !user
      ? "Sign in to check your profile."
      : missing.length
        ? `Your profile still needs: **${missing.join(", ")}**.`
        : "Your profile is **complete** — all required fields are filled in.";
    return [
      "# Account, profile and verification",
      "",
      "WarQ uses email and password. After registering you verify your email address, complete your business profile, then subscribe or request free access.",
      "",
      profileLine,
      "",
      "Required profile fields: Full Name, Shop Name, a valid Bangladeshi phone number, Shop Address, Delivery Address, District and Upazila.",
      "",
      "Forgot your password? Use **Forgot password** on the sign-in screen to receive a reset code.",
    ].join("\n");
  }

  if (has(["warranty", "guarantee", "how long", "duration", "expire", "expires", "expiry", "expiring", "valid for", "coverage"])) {
    const expiringLine = qrStats.expiringSoon
      ? `**${qrStats.expiringSoon}** warranty${qrStats.expiringSoon === 1 ? "" : "ies"} will expire within the next ${qrStats.expiringSoonDays} days.`
      : `No warranties are due to expire within the next ${qrStats.expiringSoonDays} days.`;
    const lines = [
      "# How warranty duration and expiry work",
      "",
      "The warranty length is defined by the **product model** when you create its QR folder — not by the sticker. Every QR generated in that folder inherits the same duration, and the countdown only starts the moment you **record the sale / activate** the QR.",
      "",
      `For **${shopName}**: **${qrStats.total}** QR code${qrStats.total === 1 ? "" : "s"} in total — **${qrStats.active}** active, **${qrStats.expired}** expired, **${qrStats.voided}** voided, **${qrStats.pending}** awaiting activation${qrStats.noWarranty ? `, ${qrStats.noWarranty} with no warranty` : ""}.`,
      "",
      expiringLine,
    ];
    if (qrStats.expiringWithin.length) {
      lines.push("", "Expiring soonest:");
      for (const item of qrStats.expiringWithin.slice(0, 5)) {
        lines.push(`- \`${item.code}\` — ${item.productName || "product"} — in **${item.days} day${item.days === 1 ? "" : "s"}**`);
      }
    }
    lines.push("", "> Tip: opening a product from **Scan** shows the exact expiry date and a live countdown.");
    return lines.join("\n");
  }

  if (has(["admin", "support", "human", "agent", "talk to someone", "help me", "chat with"])) {
    return [
      "# Talking to a human",
      "",
      "For anything this assistant cannot resolve, use **Chat Board → Chat with Admin**. You can attach screenshots and the administrator will reply in the same thread.",
      "",
      `You can also message WarQ on WhatsApp: [${WHATSAPP_NUMBER}](${whatsappChatUrlForPrompt(WHATSAPP_NUMBER)}).`,
    ].join("\n");
  }

  return [
    "# I want to help you accurately",
    "",
    "I could not find a WarQ feature that matches that question from your own data, so I will not guess.",
    "",
    "I can help with:",
    "- Warranty duration, expiry and returned/voided warranties",
    "- How scanning works and what customers see",
    "- QR sticker ordering, pricing and physical delivery",
    "- Subscription plans, renewal and free access requests",
    "- Reports and exports",
    "- Warranty claims",
    "- Profile, email verification and account access",
    "",
    "If your question is different, please rephrase it, or switch to **Chat Board → Chat with Admin** for human help.",
  ].join("\n");
}

export async function buildAiInsights({ qrs, sales, claims, users, pricing, plans } = {}) {
  const qrStats = summarizeQrs(qrs);
  const saleStats = summarizeSales(sales);
  const claimStats = summarizeClaims(claims);
  const best = topProductModel(sales);
  const planListValue = planList(plans);
  const pricingValue = pricing || {};
  const packSize = Number(pricingValue.stickerPackSize) || 300;
  const packPrice = Number(pricingValue.stickerPackPrice) || 50;
  const delivery = Number(pricingValue.deliveryCharge) || 0;
  const totalQrs = qrStats.total;
  const health = totalQrs ? Math.round((qrStats.active / totalQrs) * 100) : 0;

  const nowMs = Date.now();
  const buckets = [
    { label: "0-7 days", max: 7 },
    { label: "8-14 days", max: 14 },
    { label: "15-30 days", max: 30 },
  ];
  const forecast = buckets.map((bucket) => ({
    label: bucket.label,
    value: qrStats.expiringWithin.filter((item) => item.days <= bucket.max).length,
  }));

  const suggestedPacks = Math.max(1, Math.ceil(Math.max(qrStats.available, 1) / Math.max(packSize, 1) / 4));

  const cards = [
    {
      id: "warranty-health",
      title: "Warranty health",
      status: "implemented",
      headline: `${qrStats.active} active of ${totalQrs} QR codes`,
      detail: `${qrStats.expiringSoon} expire within 30 days, ${qrStats.expired} already expired, ${qrStats.voided} voided by returns, ${qrStats.pending} awaiting activation.`,
      metric: `${health}% active`,
      tone: qrStats.expired > qrStats.active ? "warning" : "positive",
    },
    {
      id: "revenue",
      title: "Revenue snapshot",
      status: "implemented",
      headline: `${money(saleStats.revenue)} net revenue`,
      detail: `From ${saleStats.net} non-returned sale${saleStats.net === 1 ? "" : "s"}; net profit ${money(saleStats.profit)}. ${saleStats.returned} returned sale${saleStats.returned === 1 ? "" : "s"} excluded.`,
      metric: money(saleStats.profit),
      tone: saleStats.profit > 0 ? "positive" : "neutral",
    },
    {
      id: "claims",
      title: "Claims workload",
      status: "implemented",
      headline: `${claimStats.pending} claim${claimStats.pending === 1 ? "" : "s"} awaiting review`,
      detail: `${claimStats.total} claim${claimStats.total === 1 ? "" : "s"} on record, ${claimStats.decided} already decided.`,
      metric: `${claimStats.total} total`,
      tone: claimStats.pending > 0 ? "warning" : "positive",
    },
    {
      id: "best-seller",
      title: "Best-selling product model",
      status: "implemented",
      headline: best ? best.name : "No sales recorded yet",
      detail: best ? `${best.units} unit${best.units === 1 ? "" : "s"} sold for ${money(best.revenue)}.` : "Record a sale to see your top product model.",
      metric: best ? `${best.units} sold` : "0 sold",
      tone: best ? "positive" : "neutral",
    },
    {
      id: "expiry-forecast",
      title: "Next 30-day warranty expiry forecast",
      status: "preview",
      headline: `${qrStats.expiringSoon} warrant${qrStats.expiringSoon === 1 ? "y" : "ies"} due to expire`,
      detail: `Bucket estimate: ${forecast.map((item) => `${item.label}: ${item.value}`).join(", ")}. Heuristic projection based on current expiry dates.`,
      metric: `${qrStats.expiringSoon} expiring`,
      tone: qrStats.expiringSoon > 0 ? "warning" : "neutral",
    },
    {
      id: "restock",
      title: "Sticker restock recommendation",
      status: "preview",
      headline: `Consider ~${suggestedPacks} sticker pack${suggestedPacks === 1 ? "" : "s"} soon`,
      detail: `${qrStats.available} unused QR code${qrStats.available === 1 ? "" : "s"} left. A pack is ${packSize} stickers for ${money(packPrice)} plus ${money(delivery)} delivery. Heuristic estimate.`,
      metric: `${qrStats.available} unused`,
      tone: qrStats.available < packSize ? "warning" : "neutral",
    },
  ];

  const recommendations = [
    qrStats.expiringSoon > 0
      ? `Contact the ${qrStats.expiringSoon} customer${qrStats.expiringSoon === 1 ? "" : "s"} whose warranty expires within 30 days to offer an extension or service.`
      : "No warranties expire in the next 30 days.",
    claimStats.pending > 0
      ? `Review and respond to the ${claimStats.pending} open warranty claim${claimStats.pending === 1 ? "" : "s"}.`
      : "No warranty claims are awaiting review.",
    saleStats.returned > 0
      ? `${saleStats.returned} returned sale${saleStats.returned === 1 ? "" : "s"} voided warranties — check the return reasons for quality patterns.`
      : "No returns recorded — return rate is clean.",
    best
      ? `Keep stock of **${best.name}**, your best-selling product model.`
      : "Generate QR codes for a product model so you can start recording sales.",
    `Sticker packs come in ${packSize} at ${money(packPrice)} with ${money(delivery)} delivery charge.`,
    planListValue.length
      ? `Renewing with the **${planListValue[0].label}** plan (${money(planListValue[0].amount)}) is the quickest way to extend access.`
      : "Choose a subscription plan to extend access.",
  ];

  const summary = [
    `${totalQrs} QR code${totalQrs === 1 ? "" : "s"}`,
    `${qrStats.active} active warrant${qrStats.active === 1 ? "y" : "ies"}`,
    `${money(saleStats.revenue)} net revenue`,
    `${claimStats.pending} open claim${claimStats.pending === 1 ? "" : "s"}`,
  ].join(" · ");

  return {
    generatedAt: new Date(nowMs).toISOString(),
    summary,
    cards,
    recommendations,
    forecast,
    totals: {
      qrs: totalQrs,
      active: qrStats.active,
      expiringSoon: qrStats.expiringSoon,
      expired: qrStats.expired,
      voided: qrStats.voided,
      available: qrStats.available,
      sales: saleStats.total,
      netSales: saleStats.net,
      revenue: saleStats.revenue,
      profit: saleStats.profit,
      claims: claimStats.total,
      pendingClaims: claimStats.pending,
      users: Array.isArray(users) ? users.length : 0,
    },
  };
}
