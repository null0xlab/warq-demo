import { getDb, resetDatabase, query, docs } from "../src/demo/db.js";
import { seedAll, seedSummary } from "../src/demo/seed.js";
import { registerWithEmail, peekPendingCode } from "../src/demo/auth.js";
import { handleApi, ApiError } from "../src/demo/backend.js";

const SHOP = { uid: "demo-shop-rahman", email: "rahman@warq.demo", emailVerified: true };
const SYL = { uid: "demo-shop-sylhet", email: "sylhet@warq.demo", emailVerified: true };
const ADMIN = { uid: "demo-admin", email: "admin@warq.demo", emailVerified: true };
const CUST = { uid: "demo-cust-nusrat", email: "nusrat@warq.demo", emailVerified: true };

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC";

const EXPECTED = [
  "sendVerificationEmail",
  "confirmEmailVerification",
  "sendPasswordReset",
  "ensureUser",
  "updateProfile",
  "getDashboard",
  "createStickerRequest",
  "requestAccess",
  "getQr",
  "getPublicQr",
  "recordSale",
  "activateQr",
  "deleteQr",
  "deleteQrs",
  "deleteQrGroup",
  "updateSaleAmount",
  "returnSale",
  "startPayment",
  "upgradeStickerRequestToPhysical",
  "getSandboxPayment",
  "completeSandboxPayment",
  "markNotificationRead",
  "deleteNotification",
  "clearNotifications",
  "adminPasswordLogin",
  "adminSummary",
  "generateQrs",
  "updateStickerRequest",
  "deleteStickerRequest",
  "setStickerPricing",
  "setUserAccess",
  "resolveAccessRequest",
  "revokeUserAccess",
  "setUserStatus",
  "sendNotification",
  "getAiChat",
  "clearAiChat",
  "aiChat",
  "deleteAiMessage",
  "getAiInsights",
  "getSupportThread",
  "startSupportChat",
  "sendSupportMessage",
  "deleteSupportMessage",
  "editSupportMessage",
  "getSupportImage",
  "getClaims",
  "getClaim",
  "submitClaim",
  "updateClaimStatus",
  "adminSupportQueue",
  "adminOpenSupport",
  "adminSendSupportMessage",
  "adminGetSupportMessages",
  "adminDeleteSupportMessage",
  "adminEditSupportMessage",
  "adminResolveSupport",
  "resetDemoData",
];

const exercised = new Set();
const passed = [];

async function call(name, data = {}, identity = null) {
  const result = await handleApi(name, data, { identity });
  exercised.add(name);
  return result;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectFail(fn, code) {
  try {
    await fn();
  } catch (error) {
    if (!(error instanceof ApiError)) {
      throw new Error(`Expected ApiError but got ${error && error.message ? error.message : String(error)}`);
    }
    if (code && error.code !== code) {
      throw new Error(`Expected error code "${code}" but got "${error.code}"`);
    }
    return error;
  }
  throw new Error(`Expected failure${code ? ` (${code})` : ""} but the call succeeded.`);
}

async function step(name, fn) {
  try {
    const value = await fn();
    passed.push(name);
    return value;
  } catch (error) {
    console.error("");
    console.error(`FAILED: ${name}`);
    console.error(error && error.stack ? error.stack : String(error));
    console.error("");
    console.error(`Passed steps before failure: ${passed.length}`);
    process.exit(1);
  }
}

function messageIdByText(messages, body) {
  const match = (messages || []).find((message) => !message.deleted && message.text === body);
  return match ? match.id : "";
}

await getDb();
await resetDatabase();
const seeded = await seedAll();
const seedCounts = await seedSummary();

globalThis.fetch = async () => {
  throw new Error("Smoke test network is disabled.");
};

const stamp = Date.now();
const modelActive = `Smoke Active ${stamp}`;
const modelDelete = `Smoke Delete ${stamp}`;
const modelGenerate = `Smoke Generate ${stamp}`;

let codesA = [];
let codesB = [];
let groupA = "";
let groupB = "";
let requestA = {};
let requestB = {};
let requestC = {};
let saleId = "";
let saleId2 = "";
let paymentId = "";
let stickerPaymentId = "";
let claimId = "";
let editTargetId = "";
let deleteTargetId = "";
let supportImageId = "";
let adminMessageId = "";

await step("sendVerificationEmail", async () => {
  const account = await registerWithEmail("verify-smoke@warq.demo", "warq1234");
  const result = await call("sendVerificationEmail", {}, { uid: account.uid, email: account.email, emailVerified: false });
  assert(result.sent === true, "sendVerificationEmail did not report sent");
  const pending = peekPendingCode("verify-email", account.uid);
  assert(pending && pending.code, "verification code was not issued");
  const verified = await call("confirmEmailVerification", { token: pending.code }, null);
  assert(verified.verified === true, "confirmEmailVerification did not verify");
});

await step("sendPasswordReset", async () => {
  const known = await call("sendPasswordReset", { email: "rahman@warq.demo" }, null);
  assert(known.sent === true && known.demoCode, "sendPasswordReset did not issue a code");
  const unknown = await call("sendPasswordReset", { email: "nobody@warq.demo" }, null);
  assert(unknown.unknownAccount === true, "sendPasswordReset unknown account mismatch");
});

await step("ensureUser", async () => {
  const result = await call("ensureUser", {}, SHOP);
  assert(result.user && result.user.uid === SHOP.uid, "ensureUser returned the wrong profile");
});

await step("updateProfile", async () => {
  const result = await call("updateProfile", {
    name: "Abdur Rahman",
    shopName: "Rahman Electronics",
    mobile: "01712345678",
    shopAddress: "Mirpur 10, Dhaka",
    deliveryAddress: "Mirpur 10, Dhaka",
    district: "Dhaka",
    upazila: "Mirpur",
    bio: "Smoke test profile",
  }, SHOP);
  assert(result.user && result.user.shopName === "Rahman Electronics", "updateProfile did not persist the shop name");
});

await step("getDashboard", async () => {
  const result = await call("getDashboard", {}, SHOP);
  assert(Array.isArray(result.qrs) && Array.isArray(result.sales), "getDashboard payload missing collections");
});

await step("createStickerRequest", async () => {
  requestA = await call("createStickerRequest", {
    shopName: "Rahman Electronics",
    shopAddress: "Mirpur 10, Dhaka",
    productName: "Smoke Fridge A",
    productModel: modelActive,
    brandName: "SmokeBrand",
    quantity: 3,
    defaultPrice: 1000,
    costPrice: 700,
    warrantyDuration: { months: 12 },
    fulfillment: "digital",
  }, SHOP);
  assert(requestA.id && requestA.groupId, "createStickerRequest missing id");
  groupA = requestA.groupId;
  codesA = (await docs("SELECT code FROM qrs WHERE group_id = $1 ORDER BY serial", [groupA])).map((qr) => qr.code);
  assert(codesA.length === 3, `expected 3 QR codes in group A, found ${codesA.length}`);

  requestB = await call("createStickerRequest", {
    shopName: "Rahman Electronics",
    shopAddress: "Mirpur 10, Dhaka",
    productName: "Smoke Fridge B",
    productModel: modelDelete,
    brandName: "SmokeBrand",
    quantity: 3,
    defaultPrice: 1000,
    costPrice: 700,
    warrantyDuration: { months: 6 },
    fulfillment: "digital",
  }, SHOP);
  groupB = requestB.groupId;
  codesB = (await docs("SELECT code FROM qrs WHERE group_id = $1 ORDER BY serial", [groupB])).map((qr) => qr.code);
  assert(codesB.length === 3, `expected 3 QR codes in group B, found ${codesB.length}`);

  requestC = await call("createStickerRequest", {
    shopName: "Rahman Electronics",
    shopAddress: "Mirpur 10, Dhaka",
    productName: "Smoke Fridge C",
    productModel: modelGenerate,
    brandName: "SmokeBrand",
    quantity: 2,
    defaultPrice: 1000,
    costPrice: 700,
    warrantyDuration: { months: 3 },
    fulfillment: "digital",
  }, SHOP);
  assert(requestC.id, "createStickerRequest (generate) missing id");
});

await step("resolveAccessRequest", async () => {
  const result = await call("resolveAccessRequest", {
    requestId: "access-sylhet-1",
    decision: "rejected",
    decisionNote: "Smoke test rejection.",
  }, ADMIN);
  assert(result.ok === true, "resolveAccessRequest did not report ok");
});

await step("requestAccess", async () => {
  const result = await call("requestAccess", { message: "Smoke test access request." }, SYL);
  assert(result.id, "requestAccess did not return an id");
});

await step("getQr", async () => {
  const result = await call("getQr", { code: codesB[0] }, SHOP);
  assert(result.qr && result.qr.code === codesB[0], "getQr returned the wrong QR code");
});

await step("getPublicQr", async () => {
  const result = await call("getPublicQr", { code: codesB[0] }, null);
  assert(result.qr && result.qr.code === codesB[0], "getPublicQr returned the wrong payload");
});

await step("recordSale", async () => {
  const result = await call("recordSale", {
    code: codesA[0],
    actualPrice: 1200,
    customerName: "Smoke Buyer",
    customerPhone: "01700000000",
    customerEmail: "buyer@warq.demo",
  }, SHOP);
  saleId = result.sale && result.sale.id;
  assert(saleId, "recordSale did not return a sale id");
});

await step("activateQr", async () => {
  const result = await call("activateQr", {
    code: codesA[1],
    actualPrice: 2200,
    customerName: "Smoke Buyer Two",
  }, SHOP);
  saleId2 = result.sale && result.sale.id;
  assert(saleId2 && result.qr, "activateQr did not return the activated QR and sale");
});

await step("updateSaleAmount", async () => {
  const result = await call("updateSaleAmount", { saleId, actualPrice: 1500 }, SHOP);
  assert(result.ok === true, "updateSaleAmount did not report ok");
});

await step("returnSale", async () => {
  const result = await call("returnSale", { saleId: saleId2, reason: "Smoke test return" }, SHOP);
  assert(result.ok === true && result.code === codesA[1], "returnSale returned unexpected payload");
});

await step("deleteQr", async () => {
  const result = await call("deleteQr", { code: codesB[1] }, SHOP);
  assert(result.ok === true, "deleteQr did not report ok");
});

await step("deleteQrs", async () => {
  const result = await call("deleteQrs", { codes: [codesB[2]] }, SHOP);
  assert(result.deletedCount === 1, `deleteQrs expected 1 deletion, got ${result.deletedCount}`);
});

await step("deleteQrGroup", async () => {
  const result = await call("deleteQrGroup", { groupId: groupB }, SHOP);
  assert(result.ok === true && result.deleted >= 1, "deleteQrGroup did not report a deletion");
});

await step("startPayment", async () => {
  const result = await call("startPayment", { packageId: "monthly", provider: "bkash" }, SHOP);
  paymentId = result.paymentId;
  assert(paymentId && result.sandbox === true, "startPayment did not return a sandbox payment");
});

await step("getSandboxPayment", async () => {
  const result = await call("getSandboxPayment", { paymentId }, SHOP);
  assert(result.payment && result.testCards && result.sandbox === true, "getSandboxPayment payload mismatch");
});

await step("completeSandboxPayment", async () => {
  const result = await call("completeSandboxPayment", {
    paymentId,
    testCard: { number: "01700000000", pin: "1234" },
  }, SHOP);
  assert(result.success === true && result.kind === "subscription", "completeSandboxPayment subscription failed");
});

await step("upgradeStickerRequestToPhysical", async () => {
  const result = await call("upgradeStickerRequestToPhysical", { requestId: requestA.id }, SHOP);
  assert(result.totalQrCodes === 3 && result.totalPrice > 0, "upgradeStickerRequestToPhysical payload mismatch");
});

await step("startPayment sticker", async () => {
  const result = await call("startPayment", {
    kind: "sticker_request",
    stickerRequestId: requestA.id,
    provider: "nagad",
  }, SHOP);
  stickerPaymentId = result.paymentId;
  assert(stickerPaymentId && result.kind === "sticker_request", "sticker startPayment payload mismatch");
});

await step("completeSandboxPayment sticker", async () => {
  const result = await call("completeSandboxPayment", {
    paymentId: stickerPaymentId,
    testCard: { number: "01800000000", pin: "1234" },
  }, SHOP);
  assert(result.success === true && result.kind === "sticker_request", "completeSandboxPayment sticker failed");
});

await step("updateStickerRequest", async () => {
  const result = await call("updateStickerRequest", { requestId: requestA.id, deliveryStatus: "ready" }, ADMIN);
  assert(result.ok === true, "updateStickerRequest did not report ok");
});

await step("notifications", async () => {
  const notes = await docs("SELECT id FROM notifications WHERE recipient_id = $1 ORDER BY created_at DESC", [SHOP.uid]);
  assert(notes.length >= 2, "expected at least two seeded notifications");
  await call("markNotificationRead", { notificationId: notes[1].id }, SHOP);
  const sent = await call("sendNotification", { recipientId: SHOP.uid, title: "Smoke", message: "Smoke notification" }, ADMIN);
  assert(sent.count === 1, `sendNotification expected count 1, got ${sent.count}`);
  await call("deleteNotification", { notificationId: notes[0].id }, SHOP);
  const cleared = await call("clearNotifications", {}, SHOP);
  assert(cleared.ok === true, "clearNotifications did not report ok");
});

await step("adminPasswordLogin", async () => {
  const result = await call("adminPasswordLogin", { adminId: "warq-admin", password: "admin1234" }, null);
  assert(String(result.customToken || "").startsWith("demo-admin."), "adminPasswordLogin token mismatch");
});

await step("adminSummary", async () => {
  const result = await call("adminSummary", {}, ADMIN);
  assert(Array.isArray(result.users) && Array.isArray(result.claims), "adminSummary payload missing collections");
});

await step("setStickerPricing", async () => {
  const result = await call("setStickerPricing", { stickerPackSize: 300, stickerPackPrice: 50, deliveryCharge: 120 }, ADMIN);
  assert(result.pricing && result.pricing.stickerPackSize === 300, "setStickerPricing payload mismatch");
});

await step("setUserAccess", async () => {
  const result = await call("setUserAccess", { uid: SYL.uid, unlimited: true }, ADMIN);
  assert(result.unlimited === true, "setUserAccess did not grant unlimited access");
});

await step("revokeUserAccess", async () => {
  const result = await call("revokeUserAccess", { uid: SYL.uid }, ADMIN);
  assert(result.ok === true, "revokeUserAccess did not report ok");
});

await step("setUserStatus", async () => {
  const disabled = await call("setUserStatus", { uid: CUST.uid, mode: "disable" }, ADMIN);
  assert(disabled.mode === "disable", "setUserStatus disable mismatch");
  const restored = await call("setUserStatus", { uid: CUST.uid, mode: "restore" }, ADMIN);
  assert(restored.mode === "restore", "setUserStatus restore mismatch");
});

await step("generateQrs", async () => {
  await query("UPDATE sticker_requests SET status = $1 WHERE id = $2", ["generation_failed", requestC.id]);
  const result = await call("generateQrs", { requestId: requestC.id }, ADMIN);
  assert(result.count === 2, `generateQrs expected 2 QR codes, got ${result.count}`);
});

await step("deleteStickerRequest", async () => {
  const result = await call("deleteStickerRequest", { requestId: requestC.id }, ADMIN);
  assert(result.ok === true && result.deletedId === requestC.id, "deleteStickerRequest payload mismatch");
});

await step("getAiChat", async () => {
  const result = await call("getAiChat", {}, SHOP);
  assert(Array.isArray(result.messages) && result.whatsapp, "getAiChat payload mismatch");
});

await step("aiChat", async () => {
  const result = await call("aiChat", { message: "How long is the warranty?" }, SHOP);
  assert(typeof result.reply === "string" && result.reply.length > 0, "aiChat reply missing");
  assert(result.provider === "offline", `aiChat expected offline provider, got ${result.provider}`);
  assert(Array.isArray(result.messages) && result.messages.length >= 2, "aiChat messages missing");
  const last = result.messages[result.messages.length - 1];
  assert(last && last.id, "aiChat assistant message has no id");
});

await step("deleteAiMessage", async () => {
  const chat = await call("aiChat", { message: "Show me my claims." }, SHOP);
  const target = chat.messages[chat.messages.length - 1];
  const result = await call("deleteAiMessage", { messageId: target.id }, SHOP);
  assert(result.ok === true && Array.isArray(result.messages), "deleteAiMessage payload mismatch");
});

await step("getAiInsights", async () => {
  const result = await call("getAiInsights", {}, SHOP);
  assert(Array.isArray(result.cards) && result.cards.length > 0, "getAiInsights cards missing");
  assert(result.provider === "offline", "getAiInsights provider should be offline");
});

await step("clearAiChat", async () => {
  const result = await call("clearAiChat", {}, SHOP);
  assert(result.ok === true, "clearAiChat did not report ok");
});

await step("support customer flow", async () => {
  const thread = await call("getSupportThread", {}, SHOP);
  assert(thread.waitingBanner, "getSupportThread missing waiting banner");
  const started = await call("startSupportChat", {}, SHOP);
  assert(started.thread && Array.isArray(started.messages), "startSupportChat payload mismatch");
  await call("sendSupportMessage", { message: "smoke edit target" }, SHOP);
  const edited = await call("sendSupportMessage", { message: "smoke edit target" }, SHOP);
  editTargetId = messageIdByText(edited.messages, "smoke edit target");
  const deleted = await call("sendSupportMessage", { message: "smoke delete target" }, SHOP);
  deleteTargetId = messageIdByText(deleted.messages, "smoke delete target");
  const imageMessage = await call("sendSupportMessage", {
    message: "",
    imageDataUrl: TINY_PNG,
    mimeType: "image/png",
  }, SHOP);
  const withImage = imageMessage.messages.find((message) => message.imageId);
  supportImageId = withImage ? withImage.imageId : "";
  assert(editTargetId && deleteTargetId && supportImageId, "support message identifiers missing");
  const editResult = await call("editSupportMessage", { messageId: editTargetId, message: "smoke edited" }, SHOP);
  assert(editResult.ok === true, "editSupportMessage did not report ok");
  const deleteResult = await call("deleteSupportMessage", { messageId: deleteTargetId }, SHOP);
  assert(deleteResult.ok === true, "deleteSupportMessage did not report ok");
  const image = await call("getSupportImage", { imageId: supportImageId }, SHOP);
  assert(image.dataUrl === TINY_PNG, "getSupportImage data URL mismatch");
});

await step("admin support flow", async () => {
  const queue = await call("adminSupportQueue", {}, ADMIN);
  assert(Array.isArray(queue.waiting) && Array.isArray(queue.active), "adminSupportQueue payload mismatch");
  const opened = await call("adminOpenSupport", { threadId: "thread-sylhet-1" }, ADMIN);
  assert(opened.thread && opened.thread.status === "active", "adminOpenSupport did not activate the thread");
  const sent = await call("adminSendSupportMessage", { threadId: "thread-rahman-1", message: "admin smoke reply" }, ADMIN);
  adminMessageId = messageIdByText(sent.messages, "admin smoke reply");
  assert(adminMessageId, "adminSendSupportMessage did not return the admin message");
  const read = await call("adminGetSupportMessages", { threadId: "thread-rahman-1" }, ADMIN);
  assert(read.thread && Array.isArray(read.messages), "adminGetSupportMessages payload mismatch");
  const edited = await call("adminEditSupportMessage", { messageId: adminMessageId, message: "admin smoke reply edited" }, ADMIN);
  assert(edited.ok === true, "adminEditSupportMessage did not report ok");
  const deleted = await call("adminDeleteSupportMessage", { messageId: adminMessageId }, ADMIN);
  assert(deleted.ok === true, "adminDeleteSupportMessage did not report ok");
  const resolved = await call("adminResolveSupport", { threadId: "thread-sylhet-1", openNext: true }, ADMIN);
  assert(resolved.ok === true && Array.isArray(resolved.waiting), "adminResolveSupport payload mismatch");
});

await step("submitClaim", async () => {
  const result = await call("submitClaim", {
    qrCode: codesA[0],
    category: "repair",
    description: "The compressor stopped cooling after two weeks of use.",
  }, CUST);
  claimId = result.claim && result.claim.id;
  assert(claimId && result.claim.qr && result.claim.code, "submitClaim payload mismatch");
});

await step("getClaims", async () => {
  const mine = await call("getClaims", {}, CUST);
  assert(Array.isArray(mine.claims) && mine.claims.some((claim) => claim.id === claimId), "getClaims missing the customer claim");
  const owner = await call("getClaims", {}, SHOP);
  assert(owner.claims.some((claim) => claim.id === claimId), "getClaims missing the owner claim");
});

await step("getClaim", async () => {
  const result = await call("getClaim", { claimId }, CUST);
  assert(result.claim && result.claim.id === claimId && result.claim.qr, "getClaim payload mismatch");
});

await step("updateClaimStatus", async () => {
  const result = await call("updateClaimStatus", {
    claimId,
    status: "reviewing",
    resolutionNote: "Smoke review in progress.",
  }, ADMIN);
  assert(result.ok === true && result.claim.status === "reviewing", "updateClaimStatus payload mismatch");
});

await step("error paths", async () => {
  await expectFail(() => handleApi("definitelyNotARoute", {}, { identity: null }), "not-found");
  await expectFail(() => handleApi("getQr", { code: codesA[0] }, { identity: null }), "unauthenticated");
  await expectFail(() => call("getQr", { code: "WQ-NOT-A-REAL-CODE" }, SHOP), "not-found");
  await expectFail(() => call("adminSummary", {}, SHOP), "permission-denied");
});

await step("resetDemoData", async () => {
  const result = await call("resetDemoData", {}, null);
  assert(result.summary && Number(result.summary.qrs) > 0, "resetDemoData summary mismatch");
});

const missing = EXPECTED.filter((name) => !exercised.has(name));
if (missing.length) {
  console.error(`Missing handlers: ${missing.join(", ")}`);
  process.exit(1);
}

console.log(JSON.stringify({
  seeded,
  seedCounts,
  passedSteps: passed.length,
  handlersExpected: EXPECTED.length,
  handlersExercised: exercised.size,
  missing,
  steps: passed,
}, null, 2));

await resetDatabase();
