import { expect, test } from "@playwright/test";
import zlib from "node:zlib";

function encodeOfflinePayload(record) {
  const duration = record.warrantyDuration || null;
  const compact = [
    record.code,
    record.productName,
    record.productModel,
    record.brandName,
    record.shopName,
    record.status || "generated",
    record.warrantyStatus || "",
    record.soldAt || "",
    record.warrantyExpiresAt || "",
    duration
      ? [duration.months || 0, duration.days || 0, duration.hours || 0, duration.minutes || 0, duration.seconds || 0]
      : null,
    null,
    "",
  ];
  const bytes = zlib.deflateRawSync(Buffer.from(JSON.stringify(compact), "utf8"));
  return `1${bytes.toString("base64url")}`;
}

function trackErrors(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error && error.message ? error.message : error)));
  return errors;
}

async function startDemo(page) {
  await page.goto("/");
  const gate = page.locator(".wq-gate");
  await expect(gate).toBeVisible({ timeout: 60000 });
  await page.getByRole("button", { name: /Start demo as a shopkeeper/i }).click();
  await expect(page.locator(".wq-launcher")).toBeVisible({ timeout: 60000 });
  await expect(page.locator(".wq-gate")).toHaveCount(0);
}

async function openGuide(page) {
  await page.locator(".wq-launcher").click();
  await expect(page.locator(".wq-panel.is-open")).toBeVisible();
}

async function switchRole(page, label) {
  await openGuide(page);
  await page.locator(".wq-role-btn", { hasText: label }).first().click();
  const close = page.locator(".wq-close");
  if (await close.count()) await close.first().click();
  await expect(page.locator(".wq-panel.is-open")).toHaveCount(0);
}

test.describe("WarQ demo smoke", () => {
  test("first screen explains WarQ and starts the demo", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/");
    await expect(page.locator(".wq-gate")).toBeVisible({ timeout: 60000 });
    await expect(page.locator(".wq-gate-card h1")).toContainText(/verifiable digital warranty/i);
    await page.getByRole("button", { name: /Start demo as a shopkeeper/i }).click();
    await expect(page.locator(".wq-launcher")).toBeVisible({ timeout: 60000 });
    expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
  });

  test("shopkeeper dashboard, requests and judge guide", async ({ page }) => {
    const errors = trackErrors(page);
    await test.step("start the demo as a shopkeeper", async () => {
      await startDemo(page);
    });
    await test.step("dashboard renders the AI preview module", async () => {
      await expect(page.locator(".ai-preview")).toBeVisible({ timeout: 90000 });
    });
    await test.step("requests view loads", async () => {
      await page.getByRole("button", { name: /^Requests$/i }).first().click();
      await expect(page.locator(".page")).toBeVisible();
    });
    await test.step("judge guide opens and closes", async () => {
      await openGuide(page);
      await expect(page.locator(".wq-panel")).toContainText(/steps done/i);
      await page.locator(".wq-close").click();
      await expect(page.locator(".wq-panel.is-open")).toHaveCount(0);
    });
    expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
  });

  test("role switcher reaches admin and customer without signing out", async ({ page }) => {
    const errors = trackErrors(page);
    await startDemo(page);

    await switchRole(page, "Administrator");
    await expect(page.locator("h1", { hasText: /WarQ control center/i })).toBeVisible({ timeout: 60000 });
    await page.locator(".admin-tabs").getByRole("button", { name: /^Claims/i }).click();
    await expect(page.locator(".admin-claims-list")).toBeVisible();

    await switchRole(page, "Customer · Nusrat Jahan");
    await expect(page.locator(".cp-shell")).toBeVisible({ timeout: 60000 });
    await expect(page.locator(".cp-tabs")).toBeVisible();

    await switchRole(page, "Shopkeeper · Rahman Electronics (Dhaka)");
    await expect(page.locator("main.app-shell")).toBeVisible({ timeout: 60000 });

    expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
  });

  test("public warranty page renders and offers a claim form", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/#/scan/WQ-DHK-P1-0001");
    await expect(page.locator(".public-warranty-page")).toBeVisible({ timeout: 60000 });
    const raise = page.getByRole("button", { name: /Raise a warranty claim/i });
    if (await raise.count()) {
      await raise.first().click();
      await expect(page.locator(".public-claim-form")).toBeVisible();
    }
    expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
  });

  test("offline QR payload renders the warranty without the database", async ({ page }) => {
    const errors = trackErrors(page);
    const record = {
      code: "WQ-OFFLINE-TEST-0001",
      productName: "Offline Demo Refrigerator",
      productModel: "OD-400",
      brandName: "WarQ Labs",
      shopName: "Rahman Electronics",
      status: "generated",
      warrantyStatus: "active",
      soldAt: new Date(Date.now() - 86400000).toISOString(),
      warrantyExpiresAt: new Date(Date.now() + 200 * 86400000).toISOString(),
      warrantyDuration: { months: 12, days: 0, hours: 0, minutes: 0, seconds: 0 },
    };
    const token = encodeOfflinePayload(record);
    const checksum = zlib.crc32(Buffer.from(token)).toString(16).padStart(8, "0");
    await page.goto(`/#/scan/${record.code}?d=${token}&k=${checksum}`);
    await expect(page.locator(".public-warranty-page")).toBeVisible({ timeout: 60000 });
    await expect(page.locator(".public-warranty-page")).toContainText(/Verified from the QR sticker/i);
    await expect(page.locator(".public-warranty-page")).toContainText(record.productName);
    expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
  });

  test("subscription sandbox payment completes with a test card", async ({ page }) => {
    const errors = trackErrors(page);
    await startDemo(page);
    await test.step("open the subscription view", async () => {
      await page.evaluate(() => {
        window.location.hash = "#/app/subscription";
      });
      await expect(page.locator(".subscription-page")).toBeVisible({ timeout: 60000 });
    });
    await test.step("start a sandbox payment", async () => {
      await page.getByRole("button", { name: /Pay BDT .* with/i }).click();
      await expect(page.locator(".sandbox-page")).toBeVisible({ timeout: 60000 });
      await expect(page.locator(".sandbox-banner")).toContainText(/Sandbox/i);
    });
    await test.step("pay with the success test card", async () => {
      await page.locator(".sandbox-testcard").first().click();
      await page.locator(".sandbox-actions button[type=submit]").click();
      await expect(page.locator(".sandbox-success")).toBeVisible({ timeout: 60000 });
    });
    expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
  });

  test("customer portal submits a warranty claim", async ({ page }) => {
    const errors = trackErrors(page);
    await startDemo(page);
    await switchRole(page, "Customer · Nusrat Jahan");
    await expect(page.locator(".cp-shell")).toBeVisible({ timeout: 60000 });
    await page.locator(".cp-tabs").getByRole("button", { name: /Scan & claim/i }).click();
    await page.locator("#cp-manual-code").fill("WQ-DHK-P1-0001");
    await page.getByRole("button", { name: /^Look up$/i }).click();
    await expect(page.locator(".cp-modal")).toBeVisible({ timeout: 60000 });
    await page
      .locator("#cp-claim-description")
      .fill("The screen flickers and the device overheats while charging.");
    await page.getByRole("button", { name: /^Submit claim$/i }).click();
    await expect(page.locator(".cp-toast-success")).toBeVisible({ timeout: 60000 });
    await expect(page.locator(".cp-tabs")).toBeVisible();
    expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
  });

  test("reset demo data returns to the first screen", async ({ page }) => {
    await startDemo(page);
    await openGuide(page);
    await page.getByRole("button", { name: /Reset demo data/i }).click();
    await expect(page.locator(".wq-gate")).toBeVisible({ timeout: 90000 });
  });
});
