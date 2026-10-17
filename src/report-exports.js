import JSZip from "jszip";

const moneyFormat = new Intl.NumberFormat("en-BD", { maximumFractionDigits: 2 });

export function moneyValue(value) {
  return moneyFormat.format(Number(value || 0));
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

/** Short collision-safe id for export filenames (e.g. 8F3A2C). */
function uniqueExportId() {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(3);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  }
  return Date.now().toString(36).slice(-6).toUpperCase().padStart(6, "0");
}

function safeFileName(seed) {
  const cleaned = String(seed || "WarQ")
    .replace(/[^a-zA-Z0-9_\-\u0980-\u09FF]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return cleaned || "WarQ";
}

function extensionOf(filename) {
  const parts = String(filename || "").split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "";
}

function mimeForFilename(filename, fallback = "application/octet-stream") {
  switch (extensionOf(filename)) {
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "csv":
      return "text/csv";
    case "pdf":
      return "application/pdf";
    case "png":
      return "image/png";
    case "zip":
      return "application/zip";
    default:
      return fallback;
  }
}

function typedExportBlob(blob, filename) {
  const mime = mimeForFilename(filename, blob?.type || "application/octet-stream");
  if (blob?.type && blob.type !== "application/octet-stream") return blob;
  return new Blob([blob], { type: mime });
}

/**
 * Open the native Save dialog immediately (while the click gesture is still
 * valid). Returns null when the API is unavailable; throws AbortError when the
 * user cancels.
 */
async function pickSaveHandle(filename) {
  if (typeof window.showSaveFilePicker !== "function") return null;
  const mime = mimeForFilename(filename);
  const ext = extensionOf(filename);
  return window.showSaveFilePicker({
    suggestedName: filename,
    types: [
      {
        description: "WarQ export",
        accept: { [mime]: ext ? [`.${ext}`] : [] },
      },
    ],
  });
}

async function writeBlobToHandle(handle, blob, filename) {
  const fileBlob = typedExportBlob(blob, filename);
  const writable = await handle.createWritable();
  await writable.write(fileBlob);
  await writable.close();
}

function triggerAnchorDownload(blob, filename) {
  const fileBlob = typedExportBlob(blob, filename);
  const blobUrl = URL.createObjectURL(fileBlob);
  const link = document.createElement("a");
  link.style.display = "none";
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    if (document.body.contains(link)) document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  }, 500);
}

/**
 * Save a generated Blob to a previously chosen File System Access handle, or
 * fall back to a classic Downloads-folder anchor download.
 */
async function downloadBlob(blob, filename, handle = null) {
  if (handle) {
    await writeBlobToHandle(handle, blob, filename);
    return;
  }

  if (typeof window.showSaveFilePicker === "function") {
    try {
      const picked = await pickSaveHandle(filename);
      if (picked) {
        await writeBlobToHandle(picked, blob, filename);
        return;
      }
    } catch (err) {
      if (err?.name === "AbortError") return;
      console.warn("Save picker unavailable; falling back to browser download.", err);
    }
  }

  triggerAnchorDownload(blob, filename);
}

/** Pick destination first (keeps the user gesture), then build + write. */
async function saveGeneratedExport(filename, buildBlobFn) {
  let handle = null;
  try {
    handle = await pickSaveHandle(filename);
  } catch (err) {
    if (err?.name === "AbortError") return;
    console.warn("Save picker unavailable; falling back to browser download.", err);
    handle = null;
  }
  const blob = await buildBlobFn();
  await downloadBlob(blob, filename, handle);
}

function dateTimeText(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("en-BD", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function dateOnly(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("en-BD", { dateStyle: "medium" }).format(new Date(value));
  } catch {
    return String(value);
  }
}

// Use a compact, unambiguous timestamp in spreadsheet cells. The display
// format is intentionally shorter than the document/PDF timestamp so it fits
// in a normal Excel column without wrapping or depending on a viewer's zoom.
function excelDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/* ==========================================================================
   Shared report normalization helpers
   ========================================================================== */

function topProduct(customer) {
  const ordered = [...(customer.productDetails || [])].sort(
    (a, b) =>
      b.purchases - a.purchases ||
      b.revenue - a.revenue ||
      String(a.productName || "").localeCompare(String(b.productName || "")),
  );
  return ordered[0] || { productName: "", productModel: "", purchases: 0 };
}

function normalizeReport(report = {}) {
  const totals = report.totals || {};
  const customers = (report.customerPurchases || []).map((customer) => {
    const top = topProduct(customer);
    const details = (customer.productDetails || []).map((d) => ({
      productName: String(d.productName || ""),
      productModel: String(d.productModel || ""),
      brandName: String(d.brandName || ""),
      code: String(d.code || ""),
      purchases: Number(d.purchases || 0),
      revenue: Number(d.revenue || 0),
      cost: Number(d.cost || 0),
      profit: Number(d.profit || 0),
    }));
    return {
      name: String(customer.name || ""),
      phone: String(customer.phone || ""),
      address: String(customer.address || ""),
      purchases: Number(customer.purchases || 0),
      revenue: Number(customer.revenue || 0),
      cost: Number(customer.cost || 0),
      profit: Number(customer.profit || 0),
      distinctProducts: details.length,
      productName: String((customer.productDetails || [])[0]?.productName || ""),
      productModel: String((customer.productDetails || [])[0]?.productModel || ""),
      details,
      top: {
        productName: top.productName || "",
        productModel: top.productModel || "",
        purchases: Number(top.purchases || 0),
        revenue: Number(top.revenue || 0),
        profit: Number(top.profit || 0),
      },
    };
  });

  customers.sort(
    (a, b) =>
      b.purchases - a.purchases ||
      b.revenue - a.revenue ||
      b.profit - a.profit ||
      String(a.name || a.phone).localeCompare(String(b.name || b.phone)),
  );

  const phones = customers
    .filter((c) => c.phone)
    .map((c, index) => ({ index: index + 1, name: c.name, phone: c.phone, address: c.address, purchases: c.purchases }));

  return {
    shopName: String(report.shopName || "WarQ Merchant"),
    label: String(report.label || "Complete history (All Time)"),
    period: String(report.label || "Complete history (All Time)"),
    generatedAt: report.generatedAt || new Date().toISOString(),
    totals: {
      units: Number(totals.units || 0),
      grossUnits: Number(totals.grossUnits || totals.units || 0),
      revenue: Number(totals.revenue || 0),
      cost: Number(totals.cost || 0),
      profit: Number(totals.profit || 0),
      returns: Number(totals.returns || 0),
      returnRate: Number(totals.returnRate || 0),
      returnRateBase: Number(totals.returnRateBase || totals.grossUnits || 0),
      uniqueProductsSold: Number(totals.uniqueProductsSold || 0),
    },
    products: (report.products || []).map((p) => ({
      productName: String(p.productName || ""),
      brandName: String(p.brandName || ""),
      productModel: String(p.productModel || ""),
      units: Number(p.units || 0),
      sold: Number(p.sold ?? p.units ?? 0),
      revenue: Number(p.revenue || 0),
      cost: Number(p.cost || 0),
      profit: Number(p.profit || 0),
      returns: Number(p.returns || 0),
      returnRate: Number(p.returnRate || 0),
    })),
    bestSellers: (report.bestSellers || []).map((p) => ({
      productName: String(p.productName || ""),
      brandName: String(p.brandName || ""),
      model: String(p.productModel || ""),
      units: Number(p.units || 0),
      revenue: Number(p.revenue || 0),
      profit: Number(p.profit || 0),
    })),
    mostReturned: (report.mostReturned || []).map((p) => ({
      productName: String(p.productName || ""),
      units: Number(p.units || 0),
      returns: Number(p.returns || 0),
      returnRate: Number(p.returnRate || 0),
    })),
    returnRows: (report.returnRows || []).map((p) => ({
      productName: String(p.productName || ""),
      brandName: String(p.brandName || ""),
      returns: Number(p.returns || 0),
      returnRate: Number(p.returnRate || 0),
    })),
    warrantyTotals: {
      active: Number(report.warrantyTotals?.active || 0),
      expired: Number(report.warrantyTotals?.expired || 0),
      voided: Number(report.warrantyTotals?.voided || 0),
      noWarranty: Number(report.warrantyTotals?.noWarranty || 0),
      pending: Number(report.warrantyTotals?.pending || 0),
    },
    warrantyDetails: (report.warrantyDetails || []).map((w) => ({
      productName: String(w.productName || ""),
      code: String(w.code || ""),
      activatedAt: w.activatedAt,
      warrantyExpiresAt: w.warrantyExpiresAt,
      status: String(w.status || ""),
      warrantyDuration: w.warrantyDuration || "",
    })),
    monthly: (report.monthly || []).map((m) => ({
      label: String(m.label || ""),
      units: Number(m.units || 0),
      revenue: Number(m.revenue || 0),
      cost: Number(m.cost ?? (m.revenue - m.profit) ?? 0),
      profit: Number(m.profit || 0),
      returns: Number(m.returns || 0),
    })),
    activitySales: (report.activitySales || []).map((s, index) => ({
      id: s.id || s.qrId || s.code || `activity-${index}`,
      code: String(s.code || ""),
      qrId: String(s.qrId || ""),
      requestId: String(s.requestId || ""),
      productName: String(s.productName || ""),
      productModel: String(s.productModel || ""),
      brandName: String(s.brandName || ""),
      customerName: String(s.customerName || ""),
      customerPhone: String(s.customerPhone || ""),
      customerAddress: String(s.customerAddress || ""),
      actualPrice: Number(s.actualPrice ?? s.defaultPrice ?? 0),
      defaultPrice: Number(s.defaultPrice ?? 0),
      costPrice: Number(s.costPrice ?? 0),
      profit: Number.isFinite(Number(s.profit))
        ? Number(s.profit)
        : Number(s.actualPrice ?? s.defaultPrice ?? 0) - Number(s.costPrice ?? 0),
      saleDate: s.saleDate || s.soldAt || s.activatedAt || s.createdAt || null,
      soldAt: s.soldAt || null,
      activatedAt: s.activatedAt || null,
      returnedAt: s.returnedAt || null,
      // Activity rows include both completed sales and later returns. Always
      // preserve that state so a detail register cannot be mistaken for the
      // net-sales ledger used by the headline figures.
      status: String(s.status || (s.returnedAt ? "returned" : "sold")),
    })),
    customers,
    phones,
  };
}

// The Full Report page already builds these values with buildReport().  Keep
// that calculation source authoritative and send only the fields needed by the
// template-backed renderer; do not send duplicate raw sales/QR arrays.
function professionalExcelPayload(report = {}) {
  const customers = (report.customerPurchases || []).map((customer) => ({
    name: customer?.name,
    phone: customer?.phone,
    address: customer?.address,
    purchases: customer?.purchases,
    revenue: customer?.revenue,
    cost: customer?.cost,
    profit: customer?.profit,
    productDetails: (customer?.productDetails || []).map((detail) => ({
      productName: detail?.productName,
      productModel: detail?.productModel,
      brandName: detail?.brandName,
      code: detail?.code,
      purchases: detail?.purchases,
      revenue: detail?.revenue,
      cost: detail?.cost,
      profit: detail?.profit,
    })),
  }));
  return {
    shopName: report.shopName,
    label: report.label,
    generatedAt: report.generatedAt,
    totals: report.totals,
    products: (report.products || []).map((product) => ({
      productName: product?.productName,
      brandName: product?.brandName,
      productModel: product?.productModel,
      units: product?.units,
      grossUnits: product?.grossUnits,
      revenue: product?.revenue,
      cost: product?.cost,
      profit: product?.profit,
      returns: product?.returns,
      returnRate: product?.returnRate,
    })),
    bestSellers: report.bestSellers,
    returnRows: report.returnRows,
    warrantyTotals: report.warrantyTotals,
    warrantyDetails: (report.warrantyDetails || []).map((warranty) => ({
      productName: warranty?.productName,
      code: warranty?.code,
      activatedAt: warranty?.activatedAt,
      warrantyExpiresAt: warranty?.warrantyExpiresAt,
      status: warranty?.status,
      warrantyDuration: warranty?.warrantyDuration,
    })),
    monthly: report.monthly,
    activitySales: (report.activitySales || []).map((sale) => ({
      code: sale?.code,
      qrId: sale?.qrId,
      productName: sale?.productName,
      productModel: sale?.productModel,
      brandName: sale?.brandName,
      customerName: sale?.customerName,
      customerPhone: sale?.customerPhone,
      customerAddress: sale?.customerAddress,
      actualPrice: sale?.actualPrice,
      defaultPrice: sale?.defaultPrice,
      costPrice: sale?.costPrice,
      profit: sale?.profit,
      saleDate: sale?.saleDate,
      soldAt: sale?.soldAt,
      activatedAt: sale?.activatedAt,
      returnedAt: sale?.returnedAt,
      status: sale?.status || (sale?.returnedAt ? "returned" : "sold"),
    })),
    customerPurchases: customers,
  };
}

// The professional DOCX generator is intentionally template-first. This
// adapter only translates the already-calculated Full Report view into its
// documented slots; it does not recalculate business figures in another path.
function professionalDocxPayload(report = {}) {
  const totals = report.totals || {};
  const warrantyTotals = report.warrantyTotals || {};
  const products = report.products || [];
  const sales = report.activitySales || [];
  const customerPurchases = report.customerPurchases || [];
  const best = (report.bestSellers || [])[0] || {};
  const asNumber = (value) => Number(value || 0);
  const uniqueCustomers = customerPurchases.filter((customer) => customer?.phone).length;
  const customerProducts = [];
  customerPurchases.forEach((customer, customerIndex) => {
    (customer?.productDetails || []).forEach((detail, detailIndex) => {
      customerProducts.push({
        rank: detailIndex === 0 ? customerIndex + 1 : '',
        name: detailIndex === 0 ? customer?.name : '',
        phone: detailIndex === 0 ? customer?.phone : '',
        product: detail?.productName,
        model: detail?.productModel,
        qty: detail?.purchases,
        revenue: detail?.revenue,
      });
    });
  });
  const returnRate = asNumber(totals.returnRate);
  return {
    meta: {
      shop_name: report.shopName || 'WarQ Merchant',
      period: report.label || 'Complete history (All Time)',
      report_date: dateTimeText(report.generatedAt || new Date().toISOString()),
      report_scope: 'Sales performance | Product profitability | Warranty tracking | Monthly trend | Customer purchase details',
    },
    snapshot: {
      net_units_sold: asNumber(totals.units), net_revenue: asNumber(totals.revenue), net_cost: asNumber(totals.cost), net_profit: asNumber(totals.profit),
      gross_units: asNumber(totals.grossUnits ?? totals.units), returns_recorded: asNumber(totals.returns), return_rate: returnRate,
      unique_products_sold: asNumber(totals.uniqueProductsSold), active_warranties: asNumber(warrantyTotals.active), expired_warranties: asNumber(warrantyTotals.expired),
      voided_warranties: asNumber(warrantyTotals.voided), no_warranty_unlinked: asNumber(warrantyTotals.noWarranty), pending_activation: asNumber(warrantyTotals.pending),
    },
    management_readout: [
      { area: 'Sales volume', current_position: `${asNumber(totals.units)} net units sold`, supporting_detail: `${asNumber(totals.returns)} returns recorded (${returnRate.toFixed(1)}%)` },
      { area: 'Financial result', current_position: `BDT ${moneyValue(totals.revenue)} revenue`, supporting_detail: `BDT ${moneyValue(totals.profit)} net profit` },
      { area: 'Product mix', current_position: `${asNumber(totals.uniqueProductsSold)} unique products sold`, supporting_detail: `${products.length} products in the performance register` },
      { area: 'Warranty register', current_position: `${asNumber(warrantyTotals.active)} active / ${asNumber(warrantyTotals.expired)} expired`, supporting_detail: `${asNumber(warrantyTotals.noWarranty)} no-warranty or unlinked` },
      { area: 'Customer coverage', current_position: `${uniqueCustomers} registered customers with phones`, supporting_detail: `${customerPurchases.length} customer purchase records` },
    ],
    products: products.map((product) => ({ name: product?.productName, brand: product?.brandName, units: product?.units, revenue: product?.revenue, net_profit: product?.profit, returns: product?.returns, return_rate: product?.returnRate })),
    best_seller: best ? { name: best?.productName, brand: best?.brandName, model: best?.productModel, units: best?.units, revenue: best?.revenue, profit: best?.profit } : {},
    returned_products: (report.returnRows || []).map((item) => ({ name: item?.productName, return_count: item?.returns, return_rate: item?.returnRate })),
    monthly_trends: (report.monthly || []).map((item) => ({ month: item?.label, units: item?.units, revenue: item?.revenue, net_profit: item?.profit, returns: item?.returns })),
    warranty_summary: [
      ['Active', warrantyTotals.active, 'Active'], ['Expired', warrantyTotals.expired, 'Expired'], ['Voided', warrantyTotals.voided, 'Voided'], ['No warranty', warrantyTotals.noWarranty, 'No-warranty / unlinked'], ['Pending activation', warrantyTotals.pending, 'Pending activation'],
    ].map(([status, count, system_category]) => ({ status, count: asNumber(count), system_category, share: asNumber(totals.grossUnits ?? totals.units) ? asNumber(count) * 100 / asNumber(totals.grossUnits ?? totals.units) : 0 })),
    warranty_records: (report.warrantyDetails || []).map((item) => ({ product: item?.productName, qr_code: item?.code, activation: item?.activatedAt, expiration: item?.warrantyExpiresAt, status: warrantyStatusLabel(item?.status) })),
    sales_records: sales.map((item) => ({
      product: item?.productName,
      model: item?.productModel,
      customer: item?.customerName || '—',
      phone: item?.customerPhone || '—',
      sale_price: item?.actualPrice ?? item?.defaultPrice,
      cost: item?.costPrice,
      profit: item?.profit,
      sale_date: item?.returnedAt || item?.saleDate || item?.soldAt || item?.activatedAt,
      status: item?.status || (item?.returnedAt ? 'returned' : 'sold'),
    })),
    customer_summary: { registered_with_phone: uniqueCustomers, purchase_breakdown_entries: customerPurchases.length },
    customers: customerPurchases.filter((customer) => customer?.phone).map((customer, index) => ({ rank: index + 1, name: customer?.name, phone: customer?.phone, address: customer?.address, purchases: customer?.purchases })),
    customer_purchases: customerPurchases.map((customer, index) => ({ rank: index + 1, name: customer?.name, phone: customer?.phone, address: customer?.address, purchases: customer?.purchases, total_spent: customer?.revenue, total_profit: customer?.profit })),
    customer_products: customerProducts,
  };
}

const warrantyStatusLabel = (status) =>
  ({
    active: "Active",
    expired: "Expired",
    voided: "Voided",
    no_warranty: "No warranty",
    pending_activation: "Pending",
  })[status] || status || "";

const saleStatusLabel = (status) => {
  const normalized = String(status || "sold").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "returned" || normalized === "voided") return "Returned";
  if (normalized === "sold" || normalized === "activated") return "Sold";
  return normalized ? normalized.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase()) : "Sold";
};

// Keep the key metrics identical across the report's DOCX, XLSX, and CSV
// views. Each format can choose an appropriate number representation without
// maintaining a different set of report facts.
function keyBusinessMetrics(n) {
  return [
    { label: "Net Units Sold", value: n.totals.units, excelType: "Number", excelStyle: "Num2" },
    { label: "Net Revenue", spreadsheetLabel: "Net Revenue (BDT)", value: n.totals.revenue, currency: true, excelType: "Number", excelStyle: "Num" },
    { label: "Net Cost", spreadsheetLabel: "Net Cost (BDT)", value: n.totals.cost, currency: true, excelType: "Number", excelStyle: "Num" },
    { label: "Net Profit", spreadsheetLabel: "Net Profit (BDT)", value: n.totals.profit, currency: true, excelType: "Number", excelStyle: "Num" },
    { label: "Gross Units (incl. returns)", value: n.totals.grossUnits, excelType: "Number", excelStyle: "Num2" },
    { label: "Returns Recorded", value: n.totals.returns, excelType: "Number", excelStyle: "Num2" },
    { label: "Period Return Rate", value: n.totals.returnRate, percentage: true, excelType: "Percentage", excelStyle: "Percent" },
    { label: "Unique Products Sold", value: n.totals.uniqueProductsSold, excelType: "Number", excelStyle: "Num2" },
    { label: "Active Warranties", value: n.warrantyTotals.active, excelType: "Number", excelStyle: "Num2" },
    { label: "Expired Warranties", value: n.warrantyTotals.expired, excelType: "Number", excelStyle: "Num2" },
    { label: "Voided Warranties", value: n.warrantyTotals.voided, excelType: "Number", excelStyle: "Num2" },
    { label: "No-Warranty / Unlinked", value: n.warrantyTotals.noWarranty, excelType: "Number", excelStyle: "Num2" },
  ];
}

function displayMetricValue(metric, { currency = false } = {}) {
  if (metric.currency && currency) return `BDT ${moneyValue(metric.value)}`;
  if (metric.percentage) return `${metric.value}%`;
  return metric.value;
}

/* ==========================================================================
   CSV — RFC 4180 compliant with UTF-8 BOM, structured sections, accurate columns
   ========================================================================== */

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function csvRow(cells) {
  return cells.map(csvCell).join(",");
}

function csvSection(title, headers, rows, options = {}) {
  const out = [];
  if (title) out.push(csvRow([title]));
  if (headers?.length) out.push(csvRow(headers));
  const body = rows || [];
  if (options.headingOnly) return out.join("\r\n");
  if (!body.length) {
    out.push(csvRow([options.empty || "No records."]));
  } else {
    body.forEach((row) => out.push(csvRow(row)));
  }
  return out.join("\r\n");
}

function csvSectionHeading(text) {
  return csvSection(text, [], [], { headingOnly: true });
}

function buildCsvReport(n, { scope = "complete" } = {}) {
  const blocks = [];
  const title = scope === "analytics"
    ? "WarQ Full Analytics Report"
    : scope === "customers"
    ? "WarQ Customer Purchase Details"
    : "WarQ Sales & Warranty Report";

  blocks.push(
    csvRow([title]),
    csvRow([`${n.shopName} — ${n.period}`]),
    csvRow([`Report generated on ${dateTimeText(n.generatedAt)}`]),
    "",
  );

  const includeAnalytics = scope === "analytics" || scope === "complete";
  const includeCustomers = scope === "customers" || scope === "complete";

  if (includeAnalytics) {
    if (scope === "complete") blocks.push(csvSectionHeading("SECTION A: FULL ANALYTICS REPORT"), "");

    // 1. Key Business Statistics
    blocks.push(
      csvSection(
        "Key Business Statistics",
        ["Metric", "Value"],
        [
          ...keyBusinessMetrics(n).map((m) => [m.spreadsheetLabel || m.label, displayMetricValue(m, { currency: true })]),
          ["Pending Warranty Activations", n.warrantyTotals.pending],
        ],
      ),
      "",
    );

    // 2. Product-wise Sales & Profit
    const productRows = n.products
      .filter((p) => p.units || p.returns)
      .map((p) => [
        p.productName || "—",
        p.brandName || "—",
        p.productModel || "—",
        p.units,
        p.sold ?? p.units,
        p.revenue,
        p.cost,
        p.profit,
        p.revenue > 0 ? `${((p.profit / p.revenue) * 100).toFixed(1)}%` : "0.0%",
        p.returns,
        `${p.returnRate}%`,
      ]);
    blocks.push(
      csvSection(
        "Product-wise Sales & Profit",
        [
          "Product Name", "Brand", "Model", "Units Sold", "Gross Units",
          "Revenue (BDT)", "Cost (BDT)", "Net Profit (BDT)", "Profit Margin (%)", "Returns", "Return Rate (%)",
        ],
        productRows.length
          ? [
              ...productRows,
              [
                "Total (All Products)", "—", "—",
                n.totals.units, n.totals.grossUnits,
                n.totals.revenue, n.totals.cost, n.totals.profit,
                n.totals.revenue > 0 ? `${((n.totals.profit / n.totals.revenue) * 100).toFixed(1)}%` : "0.0%",
                n.totals.returns, `${n.totals.returnRate}%`,
              ],
            ]
          : [["No sales recorded in this period", "", "", "", "", "", "", "", "", "", ""]],
      ),
      "",
    );

    // 3. Best Selling Products
    const bestSellerRows = n.bestSellers.map((p, i) => [
      i + 1,
      p.productName || "—",
      p.brandName || "—",
      p.model || "—",
      p.units,
      p.revenue,
      p.profit,
      n.totals.revenue > 0 ? `${((p.revenue / n.totals.revenue) * 100).toFixed(1)}%` : "0.0%",
    ]);
    const totalBestUnits = n.bestSellers.reduce((sum, p) => sum + p.units, 0);
    const totalBestRevenue = n.bestSellers.reduce((sum, p) => sum + p.revenue, 0);
    const totalBestProfit = n.bestSellers.reduce((sum, p) => sum + p.profit, 0);
    blocks.push(
      csvSection(
        "Best Selling Products",
        ["Rank", "Product Name", "Brand", "Model", "Units Sold", "Revenue (BDT)", "Profit (BDT)", "Share of Revenue (%)"],
        bestSellerRows.length
          ? [
              ...bestSellerRows,
              ["Total", "—", "—", "—", totalBestUnits, totalBestRevenue, totalBestProfit, n.totals.revenue > 0 ? `${((totalBestRevenue / n.totals.revenue) * 100).toFixed(1)}%` : "—"],
            ]
          : [["No best sellers recorded in this period", "", "", "", "", "", "", ""]],
      ),
      "",
    );

    // 4. Returned Products
    const returnRows = n.returnRows.map((p, i) => [
      i + 1,
      p.productName || "—",
      p.brandName || "—",
      p.returns,
      `${p.returnRate}%`,
    ]);
    blocks.push(
      csvSection(
        "Returned Products",
        ["Rank", "Product Name", "Brand", "Return Count", "Return Rate (%)"],
        returnRows.length
          ? [
              ...returnRows,
              ["Total", "—", "—", n.totals.returns, `${n.totals.returnRate}%`],
            ]
          : [["—", "No returns recorded in this period", "", "", ""]],
      ),
      "",
    );

    // 5. Warranty Distribution Breakdown
    const totalWarranties =
      n.warrantyTotals.active +
      n.warrantyTotals.expired +
      n.warrantyTotals.voided +
      n.warrantyTotals.noWarranty +
      n.warrantyTotals.pending;
    const warrantyRows = [
      ["Active", n.warrantyTotals.active, totalWarranties > 0 ? `${((n.warrantyTotals.active / totalWarranties) * 100).toFixed(1)}%` : "0.0%"],
      ["Expired", n.warrantyTotals.expired, totalWarranties > 0 ? `${((n.warrantyTotals.expired / totalWarranties) * 100).toFixed(1)}%` : "0.0%"],
      ["Voided (Returns)", n.warrantyTotals.voided, totalWarranties > 0 ? `${((n.warrantyTotals.voided / totalWarranties) * 100).toFixed(1)}%` : "0.0%"],
      ["No warranty / Unlinked", n.warrantyTotals.noWarranty, totalWarranties > 0 ? `${((n.warrantyTotals.noWarranty / totalWarranties) * 100).toFixed(1)}%` : "0.0%"],
      ["Pending activation", n.warrantyTotals.pending, totalWarranties > 0 ? `${((n.warrantyTotals.pending / totalWarranties) * 100).toFixed(1)}%` : "0.0%"],
    ];
    blocks.push(
      csvSection(
        "Warranty Distribution Breakdown",
        ["Warranty Status", "Count", "Share (%)"],
        [
          ...warrantyRows,
          ["Total Tracked Warranties", totalWarranties, "100.0%"],
        ],
      ),
      "",
    );

    // 6. Warranty Tracking List
    const warrantyDetailRows = n.warrantyDetails.map((w, i) => [
      i + 1,
      w.productName || "—",
      w.code || "—",
      dateOnly(w.activatedAt),
      dateOnly(w.warrantyExpiresAt),
      warrantyStatusLabel(w.status),
    ]);
    blocks.push(
      csvSection(
        "Warranty Tracking List",
        ["#", "Product Name", "QR / Serial Code", "Activation Date", "Expiration Date", "Warranty Status"],
        warrantyDetailRows.length
          ? [
              ...warrantyDetailRows,
              ["Total Tracked", n.warrantyDetails.length, "", "", "", ""],
            ]
          : [["—", "No activated warranties in this period", "", "", "", ""]],
      ),
      "",
    );

    // 7. Monthly Trends
    if (n.monthly.length) {
      const sumMonthUnits = n.monthly.reduce((s, m) => s + m.units, 0);
      const sumMonthRev = n.monthly.reduce((s, m) => s + m.revenue, 0);
      const sumMonthCost = n.monthly.reduce((s, m) => s + (m.cost || 0), 0);
      const sumMonthProf = n.monthly.reduce((s, m) => s + m.profit, 0);
      const sumMonthRet = n.monthly.reduce((s, m) => s + m.returns, 0);
      blocks.push(
        csvSection(
          "Monthly Trends",
          ["Month", "Units Sold", "Revenue (BDT)", "Cost (BDT)", "Net Profit (BDT)", "Profit Margin (%)", "Returns"],
          [
            ...n.monthly.map((m) => [
              m.label || "—",
              m.units,
              m.revenue,
              m.cost || 0,
              m.profit,
              m.revenue > 0 ? `${(((m.profit) / m.revenue) * 100).toFixed(1)}%` : "0.0%",
              m.returns,
            ]),
            [
              "Total",
              sumMonthUnits,
              sumMonthRev,
              sumMonthCost,
              sumMonthProf,
              sumMonthRev > 0 ? `${((sumMonthProf / sumMonthRev) * 100).toFixed(1)}%` : "0.0%",
              sumMonthRet,
            ],
          ],
        ),
        "",
      );
    }

    // 8. Sales & Activation Records
    const salesRows = n.activitySales.map((s, i) => [
      i + 1,
      s.productName || "—",
      s.brandName || "—",
      s.productModel || "—",
      s.code || "—",
      s.customerName || "Walk-in",
      s.customerPhone || "—",
      s.customerAddress || "—",
      s.actualPrice,
      s.costPrice,
      s.profit,
      dateTimeText(s.returnedAt || s.saleDate || s.soldAt || s.activatedAt),
      saleStatusLabel(s.status || (s.returnedAt ? "returned" : "sold")),
    ]);
    // Detail activity includes returns so it is auditable. Financial totals
    // remain explicitly net, matching the dashboard cards and product ledger.
    const netActivitySales = n.activitySales.filter((s) => {
      const status = String(s.status || (s.returnedAt ? "returned" : "sold")).toLowerCase();
      return status !== "returned" && status !== "voided";
    });
    const totalSalesRev = netActivitySales.reduce((sum, s) => sum + s.actualPrice, 0);
    const totalSalesCost = netActivitySales.reduce((sum, s) => sum + s.costPrice, 0);
    const totalSalesProf = netActivitySales.reduce((sum, s) => sum + s.profit, 0);
    blocks.push(
      csvSection(
        "Sales & Activation Records",
        [
          "#", "Product Name", "Brand", "Model", "QR / Item Code",
          "Customer Name", "Customer Phone", "Customer Address",
          "Sale Price (BDT)", "Cost (BDT)", "Profit (BDT)", "Event Date & Time", "Status",
        ],
        salesRows.length
          ? [
              ...salesRows,
              [
                "Net Total", `${netActivitySales.length} completed sales (${n.activitySales.length} activity records)`, "—", "—", "—",
                "—", "—", "—",
                totalSalesRev, totalSalesCost, totalSalesProf, "—", "Returned records excluded from net totals",
              ],
            ]
          : [["—", "No sales recorded in this period", "", "", "", "", "", "", "", "", "", "", ""]],
      ),
      "",
    );
  }

  if (includeCustomers) {
    if (scope === "complete") blocks.push(csvSectionHeading("SECTION B: CUSTOMER PURCHASE DETAILS"), "");

    // 9. Registered Customer Phone Numbers
    const phoneRows = n.phones.map((p) => [
      p.index,
      p.name || "—",
      p.phone || "—",
      p.address || "—",
      p.purchases,
    ]);
    const sumPhonePurchases = n.phones.reduce((sum, p) => sum + p.purchases, 0);
    blocks.push(
      csvSection(
        "Registered Customer Phone Numbers",
        ["#", "Customer Name", "Phone Number", "Address", "Total Purchases"],
        phoneRows.length
          ? [
              ...phoneRows,
              ["Total Registered", `${n.phones.length} customers`, "—", "—", sumPhonePurchases],
            ]
          : [["—", "No customer phone numbers recorded in this period", "", "", ""]],
      ),
      csvRow(["Total customers with phone numbers", n.phones.length]),
      "",
    );

    // 10. Customer Purchase Breakdown (ranked by value)
    const customerBreakdownRows = n.customers.map((c, i) => [
      i + 1,
      c.name || "Unnamed customer",
      c.phone || "—",
      c.address || "—",
      c.purchases,
      c.distinctProducts,
      c.revenue,
      c.cost,
      c.profit,
      c.top.productName || "—",
      c.top.productModel || "—",
    ]);
    const sumCustPurchases = n.customers.reduce((s, c) => s + c.purchases, 0);
    const sumCustRev = n.customers.reduce((s, c) => s + c.revenue, 0);
    const sumCustCost = n.customers.reduce((s, c) => s + c.cost, 0);
    const sumCustProf = n.customers.reduce((s, c) => s + c.profit, 0);
    blocks.push(
      csvSection(
        "Customer Purchase Breakdown (ranked by value)",
        [
          "Rank", "Customer Name", "Phone", "Address", "Purchases",
          "Distinct Products", "Total Spent (BDT)", "Total Cost (BDT)", "Total Profit (BDT)",
          "Top Product", "Top Model",
        ],
        customerBreakdownRows.length
          ? [
              ...customerBreakdownRows,
              [
                "Total", `${n.customers.length} customers`, "—", "—",
                sumCustPurchases, "—", sumCustRev, sumCustCost, sumCustProf, "—", "—",
              ],
            ]
          : [["—", "No customer purchase data recorded in this period", "", "", "", "", "", "", "", "", ""]],
      ),
      "",
    );

    // 11. Products Each Customer Bought
    const customerProductRows = n.customers.flatMap((c, i) => {
      const details = c.details.length
        ? c.details
        : [{ productName: "—", brandName: "—", productModel: "—", code: "—", purchases: c.purchases, revenue: c.revenue, cost: c.cost, profit: c.profit }];
      return details.map((d) => [
        i + 1,
        c.name || "Unnamed customer",
        c.phone || "—",
        c.address || "—",
        d.productName || "—",
        d.brandName || "—",
        d.productModel || "—",
        d.code || "—",
        d.purchases,
        d.revenue,
        d.cost,
        d.profit,
      ]);
    });
    const sumProdPurchases = customerProductRows.reduce((s, r) => s + (Number(r[8]) || 0), 0);
    const sumProdRev = customerProductRows.reduce((s, r) => s + (Number(r[9]) || 0), 0);
    const sumProdCost = customerProductRows.reduce((s, r) => s + (Number(r[10]) || 0), 0);
    const sumProdProf = customerProductRows.reduce((s, r) => s + (Number(r[11]) || 0), 0);
    blocks.push(
      csvSection(
        "Products Each Customer Bought",
        [
          "Customer Rank", "Customer Name", "Phone", "Address",
          "Product Name", "Brand", "Model", "QR / Serial Code",
          "Purchases (Qty)", "Revenue (BDT)", "Cost (BDT)", "Profit (BDT)",
        ],
        customerProductRows.length
          ? [
              ...customerProductRows,
              [
                "Total", "—", "—", "—", "—", "—", "—", "—",
                sumProdPurchases, sumProdRev, sumProdCost, sumProdProf,
              ],
            ]
          : [["—", "No customer product data recorded in this period", "", "", "", "", "", "", "", "", "", ""]],
      ),
      "",
    );
  }

  blocks.push("End of report · WarQ Smart Warranty System", "");
  return blocks.join("\r\n");
}

async function csvExport(report, { scope = "complete" } = {}) {
  const n = normalizeReport(report);
  const content = buildCsvReport(n, { scope });
  const blob = new Blob(["\ufeff", content], { type: "text/csv;charset=utf-8" });
  return blob;
}

/* ==========================================================================
   EXCEL — Genuine .xlsx (OOXML) workbook built with JSZip.
   Professional multi-sheet layout, restrained styling, borders, and number formats.
   ========================================================================== */

const XLSX_STYLE_INDEX = {
  "": 0, Blank: 0,
  Title: 1,
  Section: 2,
  Muted: 3,
  Header: 4,
  HeaderRight: 5,
  HeaderCenter: 6,
  String: 7,
  StringCenter: 8,
  Num: 9,
  Num2: 10,
  Decimal: 11,
  Percent: 12,
  Date: 13,
  DateTime: 14,
  Totals: 15,
  TotalsNum: 16,
  TotalsPercent: 17,
  TotalsCenter: 18,
  MetricLabel: 19,
  MetricValue: 20,
  KpiLabel: 21,
  KpiNum: 22,
  KpiMoney: 23,
  KpiPercent: 24,
  KpiText: 25,
  TotalsMoney: 26,
  Subtitle: 27,
};

function excelEscape(value) {
  return String(value ?? "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function xlsxCol(index) {
  let col = "";
  let n = index;
  while (n > 0) {
    const rem = (n - 1) % 26;
    col = String.fromCharCode(65 + rem) + col;
    n = Math.floor((n - 1) / 26);
  }
  return col;
}

function excelCell(value, type = "String", style = "") {
  const styleIdx = XLSX_STYLE_INDEX[style] ?? 0;
  if (type === "Number" || type === "Percentage" || type === "Integer") {
    const num = Number(value);
    if (!Number.isFinite(num)) {
      return { v: 0, t: "n", s: styleIdx };
    }
    return { v: type === "Percentage" ? num / 100 : type === "Integer" ? Math.round(num) : num, t: "n", s: styleIdx };
  }
  return { v: String(value ?? ""), t: "s", s: styleIdx };
}

function excelDateCell(value, mode = "date") {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return excelCell("—", "String", "StringCenter");
  }
  const utcCalendarTime = Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    mode === "date" ? 0 : date.getHours(),
    mode === "date" ? 0 : date.getMinutes(),
    mode === "date" ? 0 : date.getSeconds(),
  );
  const excelSerial = (utcCalendarTime - Date.UTC(1899, 11, 30)) / 86400000;
  return { v: excelSerial, t: "n", s: XLSX_STYLE_INDEX[mode === "date" ? "Date" : "DateTime"] };
}

function excelRow(cells, height = null, role = null, groups = null) {
  // `groups` lists [fromColumn, toColumn] pairs (1-based) that share the first
  // cell's value and style, which is how the dashboard builds its KPI cards.
  return { cells, span: 0, height, role, groups };
}

function excelTitleRow(text, span) {
  return { cells: [excelCell(text, "String", "Title")], span, height: 32 };
}

function excelSubheadRow(text, span) {
  return { cells: [excelCell(text, "String", "Section")], span, height: 24 };
}

// Title strip directly under the sheet title. Uses the dark navy report band so
// teal section headers below keep their own, separate level in the hierarchy.
function excelSubtitleRow(text, span) {
  return { cells: [excelCell(text, "String", "Subtitle")], span, height: 22 };
}

function excelBlankRow(span, height = 10) {
  return { cells: [excelCell("", "String", "Blank")], span, height };
}

function excelMergedRow(text, span, style = "String", height = 20) {
  return { cells: [excelCell(text, "String", style)], span, height };
}

function excelColumnWidths(columns, width = 16) {
  return columns.map((col) => (typeof col === "number" ? col : width));
}

// Excel summaries read better with correct plurals ("1 record", "2 records")
// than with a fixed noun, so every generated count uses this helper.
function countText(count, singular, plural = `${singular}s`) {
  const value = Number(count) || 0;
  return `${value} ${value === 1 ? singular : plural}`;
}

function excelHeaders(columns) {
  return {
    cells: columns.map((col) => {
      const align = col.align || "left";
      const style = align === "right" ? "HeaderRight" : align === "center" ? "HeaderCenter" : "Header";
      return excelCell(col.label, "String", style);
    }),
    span: 0,
    height: 26,
    role: "header",
  };
}

// Rows whose first cell uses a totals style end the table, so the sheet's
// auto-filter never swallows the summary row.
const XLSX_TOTALS_STYLES = new Set([
  XLSX_STYLE_INDEX.Totals,
  XLSX_STYLE_INDEX.TotalsNum,
  XLSX_STYLE_INDEX.TotalsPercent,
  XLSX_STYLE_INDEX.TotalsCenter,
  XLSX_STYLE_INDEX.TotalsMoney,
]);

function excelSheet(wsName, bodyLines, options = {}) {
  const rows = bodyLines.slice(1);
  const widths = Array.isArray(bodyLines[0]) ? bodyLines[0] : [];
  const headerRows = rows
    .map((row, index) => (row.role === "header" ? index + 1 : null))
    .filter(Boolean);
  const lastRow = rows[rows.length - 1];
  const endsWithTotals = Boolean(lastRow) && XLSX_TOTALS_STYLES.has(Number(lastRow.cells[0]?.s));
  // Sheets that stack several unrelated tables (the dashboard) opt out of the
  // frozen header row and auto-filter, because no single row heads the page.
  const useTable = options.table !== false;
  return {
    name: wsName,
    widths,
    rows,
    headerRow: useTable && headerRows.length === 1 ? headerRows[0] : null,
    filterEnd: endsWithTotals ? rows.length - 1 : rows.length,
  };
}

function worksheetXml(wsName, widths, rows, headerRow = null, filterEnd = null) {
  const merged = [];
  const rowXml = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const r = i + 1;
    const groups = Array.isArray(row.groups) && row.groups.length
      ? row.groups
      : row.span > 1
      ? [[1, row.span]]
      : [];
    // Columns covered by a merged group keep the anchor cell's style so the
    // merged region renders with one continuous fill and border.
    const placeholders = new Map();
    groups.forEach((group) => {
      const from = Math.max(1, Number(group?.[0]) || 0);
      const to = Number(group?.[1]) || 0;
      if (to <= from) return;
      merged.push(`${xlsxCol(from)}${r}:${xlsxCol(to)}${r}`);
      const anchorStyle = row.cells[from - 1]?.s ?? row.cells[0]?.s ?? 0;
      for (let col = from + 1; col <= to; col += 1) placeholders.set(col, anchorStyle);
    });
    const columns = Math.max(row.cells.length, ...placeholders.keys(), 0);
    let cells = "";
    for (let col = 1; col <= columns; col += 1) {
      const ref = `${xlsxCol(col)}${r}`;
      if (placeholders.has(col)) {
        cells += `<c r="${ref}" s="${placeholders.get(col)}"/>`;
        continue;
      }
      const cell = row.cells[col - 1];
      if (!cell) continue;
      const styleAttr = cell.s !== undefined ? ` s="${cell.s}"` : "";
      if (cell.t === "n") {
        cells += `<c r="${ref}"${styleAttr}><v>${cell.v}</v></c>`;
      } else {
        cells += `<c r="${ref}"${styleAttr} t="inlineStr"><is><t xml:space="preserve">${excelEscape(cell.v)}</t></is></c>`;
      }
    }
    const ht = row.height ? ` ht="${row.height}" customHeight="1"` : "";
    rowXml.push(`    <row r="${r}"${ht}>${cells}</row>`);
  }
  const cols = widths.length
    ? `  <cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${Number(w) || 15}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const mergeXml = merged.length
    ? `  <mergeCells count="${merged.length}">${merged.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>`
    : "";
  const rowColumnCount = (row) => {
    const groupEnds = (row.groups || []).map((group) => Number(group?.[1]) || 0);
    return Math.max(row.span || 0, row.cells.length, ...groupEnds, 0);
  };
  const maxCol = Math.max(widths.length, ...rows.map(rowColumnCount));
  const dimension = maxCol && rows.length ? `<dimension ref="A1:${xlsxCol(maxCol)}${rows.length}"/>` : "";
  const freezePane = headerRow
    ? `<pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${headerRow + 1}" sqref="A${headerRow + 1}"/>`
    : "";
  // Auto-filter stops above a trailing totals row so the summary stays visible
  // and is never filtered out by the user.
  const filterLastRow = Number.isFinite(filterEnd) && filterEnd > 0 ? filterEnd : rows.length;
  const autoFilter = headerRow && filterLastRow > headerRow
    ? `<autoFilter ref="A${headerRow}:${xlsxCol(maxCol)}${filterLastRow}"/>`
    : "";
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>` +
    dimension +
    `<sheetViews><sheetView showGridLines="0" workbookViewId="0">${freezePane}</sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="20"/>` +
    cols +
    `<sheetData>${rowXml.join("")}</sheetData>` +
    autoFilter +
    mergeXml +
    `<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>` +
    `<pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0" horizontalDpi="300" verticalDpi="300"/>` +
    `</worksheet>`
  );
}

// 1. Summary Sheet
function excelSummarySheet(n) {
  const colW = excelColumnWidths([30, 20, 30, 20], 25);
  const rows = [];

  rows.push(excelTitleRow("WarQ Sales & Warranty Report", 4));
  rows.push(excelSubtitleRow(`${n.shopName}  ·  ${n.period}  ·  Generated ${dateTimeText(n.generatedAt)}`, 4));
  rows.push(excelBlankRow(4));

  rows.push(excelSubheadRow("Key Business Statistics", 4));
  rows.push(excelHeaders([
    { label: "Metric", align: "left" },
    { label: "Value", align: "right" },
    { label: "Metric", align: "left" },
    { label: "Value", align: "right" },
  ]));

  const statPairs = keyBusinessMetrics(n).map((metric) => [
    metric.spreadsheetLabel || metric.label,
    metric.value,
    metric.excelStyle || "Num",
    metric.excelType || "Number",
  ]);

  for (let i = 0; i < statPairs.length; i += 2) {
    const left = statPairs[i];
    const right = statPairs[i + 1] || ["", ""];
    rows.push(
      excelRow([
        excelCell(left[0], "String", "MetricLabel"),
        excelCell(left[1], left[3] || "String", left[2] || "MetricValue"),
        excelCell(right[0] || "", "String", right[0] ? "MetricLabel" : "String"),
        excelCell(right[1] !== "" ? right[1] : "", right[3] || "String", right[2] || (right[0] ? "MetricValue" : "String")),
      ]),
    );
  }
  rows.push(excelBlankRow(4));

  // Warranty Distribution Breakdown table
  const totalWarranties =
    n.warrantyTotals.active +
    n.warrantyTotals.expired +
    n.warrantyTotals.voided +
    n.warrantyTotals.noWarranty +
    n.warrantyTotals.pending;

  rows.push(excelSubheadRow("Warranty Distribution Breakdown", 4));
  rows.push(excelHeaders([
    { label: "Warranty Status", align: "left" },
    { label: "Count", align: "right" },
    { label: "System Category", align: "left" },
    { label: "Share of Total", align: "right" },
  ]));

  const distItems = [
    ["Active", n.warrantyTotals.active, "Registered & Active Warranties"],
    ["Expired", n.warrantyTotals.expired, "Period Expired Warranties"],
    ["Voided (Returns)", n.warrantyTotals.voided, "Voided due to Return / Replacement"],
    ["No warranty / Unlinked", n.warrantyTotals.noWarranty, "Unregistered / OTC Sold Items"],
    ["Pending activation", n.warrantyTotals.pending, "Awaiting Customer Activation"],
  ];

  distItems.forEach(([label, count, desc]) => {
    const share = totalWarranties > 0 ? (count / totalWarranties) * 100 : 0;
    rows.push(
      excelRow([
        excelCell(label, "String", "String"),
        excelCell(count, "Integer", "Num2"),
        excelCell(desc, "String", "String"),
        excelCell(share, "Percentage", "Percent"),
      ]),
    );
  });

  rows.push(
    excelRow([
      excelCell("Total Tracked Warranties", "String", "Totals"),
      excelCell(totalWarranties, "Integer", "TotalsNum"),
      excelCell("All Warranty Categories", "String", "Totals"),
      excelCell(totalWarranties > 0 ? 100 : 0, "Percentage", "TotalsPercent"),
    ]),
  );
  rows.push(excelBlankRow(4));

  // Report Highlights — the few facts a reader should take away without
  // opening any of the detailed sheets.
  const profitMargin = n.totals.revenue > 0 ? (n.totals.profit / n.totals.revenue) * 100 : 0;
  const warrantyBreakdown = [
    [n.warrantyTotals.active, "active"],
    [n.warrantyTotals.expired, "expired"],
    [n.warrantyTotals.voided, "voided"],
    [n.warrantyTotals.noWarranty, "no warranty"],
    [n.warrantyTotals.pending, "pending activation"],
  ]
    .filter(([count]) => count > 0)
    .map(([count, label]) => `${count} ${label}`)
    .join(" · ");
  const topProduct = [...n.products]
    .filter((product) => product.units > 0)
    .sort((a, b) => b.units - a.units || b.revenue - a.revenue)[0];
  const topCustomer = n.customers[0];

  rows.push(excelSubheadRow("Report Highlights", 4));
  rows.push(excelRow([
    excelCell("Metric", "String", "Header"),
    excelCell("Value", "String", "HeaderRight"),
    excelCell("Source Context", "String", "Header"),
    excelCell("", "String"),
  ], 26, null, [[3, 4]]));
  [
    ["Net Revenue", n.totals.revenue, "Num", `${n.totals.units} units sold in ${n.period}`],
    ["Net Profit", n.totals.profit, "Num", `Profit margin ${profitMargin.toFixed(1)}%`],
    ["Tracked Warranties", totalWarranties, "Num2", warrantyBreakdown || "No warranty records in this period"],
    ["Returns Recorded", n.totals.returns, "Num2", n.totals.returns > 0 ? `Return rate ${n.totals.returnRate.toFixed(1)}%` : "No returns recorded in this period"],
    ["Best Selling Product", topProduct?.productName || "—", "String", topProduct ? `${topProduct.units} units · ${topProduct.revenue} BDT` : "No sales recorded in this period"],
    ["Top Customer", topCustomer?.name || "—", "String", topCustomer ? `${topCustomer.purchases} purchases · ${topCustomer.revenue} BDT` : "No customer purchases in this period"],
  ].forEach(([label, value, style, context]) => {
    const isNumeric = style === "Num" || style === "Num2";
    rows.push(excelRow([
      excelCell(label, "String", "MetricLabel"),
      isNumeric ? excelCell(value, "Number", style) : excelCell(value, "String", "String"),
      excelCell(context, "String", "String"),
      excelCell("", "String"),
    ], null, null, [[3, 4]]));
  });

  rows.push(excelBlankRow(4));
  rows.push(excelRow([
    excelCell("Detailed operational data is retained in the dedicated sheets: Product Sales, Best Sellers, Returned Products, Warranty Tracking, Monthly Trends, Sales Records, Customer Registry, Customer Purchases and Customer Products.", "String", "Muted"),
  ], 30, null, [[1, 4]]));

  return excelSheet("Summary", [colW, ...rows]);
}

// Dashboard is intentionally a compact management view rather than a chart
// gallery. It mirrors the supplied professional workbook: executive KPI cards,
// product performance, warranty status, customer overview and an index of the
// detailed sheets that follow it in the workbook.
function excelDashboardSheet(n) {
  const colW = excelColumnWidths([24, 18, 20, 18, 18, 20, 14, 26], 18);
  const rows = [];
  // Every KPI card spans two columns so a 9pt label stays readable and a 14pt
  // BDT value never gets clipped, even for six-figure amounts.
  const cardGroups = [[1, 2], [3, 4], [5, 6], [7, 8]];
  const cardRow = (definitions, height) => excelRow(
    definitions.flatMap((definition) => [
      definition,
      excelCell("", "String", definition.s),
    ]),
    height,
    null,
    cardGroups,
  );
  const kpiLabel = (text) => excelCell(text, "String", "KpiLabel");
  const kpiValue = (value, style, type = "Number") => excelCell(value, type, style);

  const profitMargin = n.totals.revenue > 0 ? (n.totals.profit / n.totals.revenue) * 100 : 0;
  const totalWarranties =
    n.warrantyTotals.active +
    n.warrantyTotals.expired +
    n.warrantyTotals.voided +
    n.warrantyTotals.noWarranty +
    n.warrantyTotals.pending;

  rows.push(excelTitleRow("WarQ Sales & Warranty Dashboard", 8));
  rows.push(excelSubtitleRow(`${n.shopName}  ·  ${n.period}  ·  Generated ${dateTimeText(n.generatedAt)}`, 8));
  rows.push(excelBlankRow(8, 12));

  // --- Executive Snapshot ---------------------------------------------------
  rows.push(excelSubheadRow("Executive Snapshot", 8));
  rows.push(cardRow([
    kpiLabel("NET UNITS SOLD"),
    kpiLabel("NET REVENUE (BDT)"),
    kpiLabel("NET PROFIT (BDT)"),
    kpiLabel("PROFIT MARGIN"),
  ], 26));
  rows.push(cardRow([
    kpiValue(n.totals.units, "KpiNum"),
    kpiValue(n.totals.revenue, "KpiMoney"),
    kpiValue(n.totals.profit, "KpiMoney"),
    kpiValue(profitMargin, "KpiPercent", "Percentage"),
  ], 34));
  rows.push(cardRow([
    kpiLabel("GROSS UNITS"),
    kpiLabel("RETURNS RECORDED"),
    kpiLabel("PERIOD RETURN RATE"),
    kpiLabel("UNIQUE PRODUCTS SOLD"),
  ], 26));
  rows.push(cardRow([
    kpiValue(n.totals.grossUnits, "KpiNum"),
    kpiValue(n.totals.returns, "KpiNum"),
    kpiValue(n.totals.returnRate, "KpiPercent", "Percentage"),
    kpiValue(n.totals.uniqueProductsSold, "KpiNum"),
  ], 30));
  rows.push(excelBlankRow(8, 12));

  // --- Product Performance --------------------------------------------------
  rows.push(excelSubheadRow("Product Performance", 8));
  rows.push(excelHeaders([
    { label: "Product Name", align: "left" },
    { label: "Brand", align: "left" },
    { label: "Units Sold", align: "right" },
    { label: "Revenue (BDT)", align: "right" },
    { label: "Cost (BDT)", align: "right" },
    { label: "Net Profit (BDT)", align: "right" },
    { label: "Returns", align: "right" },
    { label: "Profit Margin", align: "right" },
  ]));

  const products = n.products.filter((product) => product.units || product.returns);
  const productLimit = 10;
  if (products.length) {
    products.slice(0, productLimit).forEach((product) => {
      const margin = product.revenue > 0 ? (product.profit / product.revenue) * 100 : 0;
      rows.push(excelRow([
        excelCell(product.productName || "—", "String", "String"),
        excelCell(product.brandName || "—", "String", "String"),
        excelCell(product.units, "Integer", "Num2"),
        excelCell(product.revenue, "Number", "Num"),
        excelCell(product.cost, "Number", "Num"),
        excelCell(product.profit, "Number", "Num"),
        excelCell(product.returns, "Integer", "Num2"),
        excelCell(margin, "Percentage", "Percent"),
      ]));
    });
    if (products.length > productLimit) {
      rows.push(excelRow([
        excelCell(`${products.length - productLimit} more products are listed in the Product Sales sheet.`, "String", "Muted"),
      ]));
    }
  } else {
    rows.push(excelRow([
      excelCell("No sales recorded in this period.", "String", "Muted"),
      excelCell("", "String"), excelCell("", "String"), excelCell("", "String"),
      excelCell("", "String"), excelCell("", "String"), excelCell("", "String"), excelCell("", "String"),
    ]));
  }


  // --- Warranty Status ------------------------------------------------------
  rows.push(excelBlankRow(8, 12));
  rows.push(excelSubheadRow("Warranty Status", 8));
  rows.push(excelRow([
    excelCell("Warranty Status", "String", "Header"),
    excelCell("Count", "String", "HeaderRight"),
    excelCell("System Category", "String", "Header"),
    excelCell("", "String"),
    excelCell("", "String"),
    excelCell("", "String"),
    excelCell("Share of Total", "String", "HeaderCenter"),
    excelCell("", "String"),
  ], 26, null, [[3, 6], [7, 8]]));
  [
    ["Active", n.warrantyTotals.active, "Registered and active warranties"],
    ["Expired", n.warrantyTotals.expired, "Warranty period has ended"],
    ["Voided (returns)", n.warrantyTotals.voided, "Voided by a return or replacement"],
    ["No warranty / unlinked", n.warrantyTotals.noWarranty, "Sold without a linked warranty record"],
    ["Pending activation", n.warrantyTotals.pending, "Awaiting customer activation"],
  ].forEach(([label, count, description]) => {
    rows.push(excelRow([
      excelCell(label, "String", "String"),
      excelCell(count, "Integer", "Num2"),
      excelCell(description, "String", "String"),
      excelCell("", "String"),
      excelCell("", "String"),
      excelCell("", "String"),
      excelCell(totalWarranties > 0 ? (count / totalWarranties) * 100 : 0, "Percentage", "Percent"),
      excelCell("", "String"),
    ], null, null, [[3, 6], [7, 8]]));
  });
  rows.push(excelRow([
    excelCell("Total tracked warranties", "String", "Totals"),
    excelCell(totalWarranties, "Integer", "TotalsNum"),
    excelCell("All warranty categories", "String", "Totals"),
    excelCell("", "String"),
    excelCell("", "String"),
    excelCell("", "String"),
    excelCell(totalWarranties > 0 ? 100 : 0, "Percentage", "TotalsPercent"),
    excelCell("", "String"),
  ], null, null, [[3, 6], [7, 8]]));

  // --- Customer Overview ----------------------------------------------------
  rows.push(excelBlankRow(8, 12));
  rows.push(excelSubheadRow("Customer Overview", 8));
  rows.push(excelHeaders([
    { label: "Rank", align: "center" },
    { label: "Customer", align: "left" },
    { label: "Phone", align: "center" },
    { label: "Purchases", align: "right" },
    { label: "Spend (BDT)", align: "right" },
    { label: "Profit (BDT)", align: "right" },
    { label: "Products", align: "right" },
    { label: "Address", align: "left" },
  ]));
  if (n.customers.length) {
    n.customers.slice(0, 8).forEach((customer, index) => {
      rows.push(excelRow([
        excelCell(index + 1, "Integer", "StringCenter"),
        excelCell(customer.name || "Unnamed customer", "String", "String"),
        excelCell(customer.phone || "—", "String", "StringCenter"),
        excelCell(customer.purchases, "Integer", "Num2"),
        excelCell(customer.revenue, "Number", "Num"),
        excelCell(customer.profit, "Number", "Num"),
        excelCell(customer.distinctProducts, "Integer", "Num2"),
        excelCell(customer.address || "—", "String", "String"),
      ]));
    });
  } else {
    rows.push(excelRow([
      excelCell("—", "String", "StringCenter"),
      excelCell("No customer purchase data recorded in this period.", "String", "Muted"),
      excelCell("", "String"), excelCell("", "String"), excelCell("", "String"),
      excelCell("", "String"), excelCell("", "String"), excelCell("", "String"),
    ]));
  }

  // --- Report Pack index ----------------------------------------------------
  rows.push(excelBlankRow(8, 12));
  rows.push(excelSubheadRow("Report Pack — Detailed Sheet Index", 8));
  rows.push(excelRow([
    excelCell("Sheet", "String", "Header"),
    excelCell("Purpose", "String", "Header"),
    excelCell("", "String"),
    excelCell("", "String"),
    excelCell("", "String"),
    excelCell("", "String"),
    excelCell("Scope", "String", "HeaderCenter"),
    excelCell("", "String"),
  ], 26, null, [[2, 6], [7, 8]]));
  const packIndex = [
    ["Product Sales", "Product-level revenue, cost and profit", countText(products.length, "product")],
    ["Best Sellers", "Top-selling products by units", countText(n.bestSellers.length, "ranked product")],
    ["Returned Products", "Returns recorded in the period", countText(n.totals.returns, "return")],
    ["Warranty Tracking", "QR-level warranty status log", countText(n.warrantyDetails.length, "record")],
    ["Monthly Trends", "Month-by-month performance", countText(n.monthly.length, "month")],
    ["Sales Records", "QR-level sales and activation log", countText(n.activitySales.length, "record")],
    ["Customer Registry", "Registered customer phone list", countText(n.phones.length, "customer")],
    ["Customer Purchases", "Customer value summary", countText(n.customers.length, "customer")],
    ["Customer Products", "Itemized customer purchases", countText(n.customers.reduce((sum, customer) => sum + customer.details.length, 0), "item row")],
  ];
  packIndex.forEach(([sheet, purpose, scope]) => {
    rows.push(excelRow([
      excelCell(sheet, "String", "String"),
      excelCell(purpose, "String", "String"),
      excelCell("", "String"),
      excelCell("", "String"),
      excelCell("", "String"),
      excelCell("", "String"),
      excelCell(scope, "String", "StringCenter"),
      excelCell("", "String"),
    ], null, null, [[2, 6], [7, 8]]));
  });

  rows.push(excelBlankRow(8, 12));
  rows.push(excelRow([
    excelCell(`Generated by WarQ Smart Warranty System · ${n.period} · All values are calculated from live WarQ sales, warranty and customer records.`, "String", "Muted"),
  ], 24, null, [[1, 8]]));

  return excelSheet("Dashboard", [colW, ...rows], { table: false });
}


// 2. Product-wise Sales & Profit
function excelProductSalesSheet(n) {
  const colW = excelColumnWidths([30, 18, 20, 14, 14, 18, 18, 18, 16, 12, 16], 16);
  const rows = [];
  rows.push(excelTitleRow("Product-wise Sales & Profit", 11));
  rows.push(excelSubtitleRow(`${n.shopName}  ·  ${n.period}`, 11));
  rows.push(excelBlankRow(11));
  rows.push(excelHeaders([
    { label: "Product Name", align: "left" },
    { label: "Brand", align: "left" },
    { label: "Model", align: "left" },
    { label: "Units Sold", align: "right" },
    { label: "Gross Units", align: "right" },
    { label: "Total Revenue (BDT)", align: "right" },
    { label: "Cost (BDT)", align: "right" },
    { label: "Net Profit (BDT)", align: "right" },
    { label: "Profit Margin", align: "right" },
    { label: "Returns", align: "right" },
    { label: "Return Rate (%)", align: "right" },
  ]));

  const activeProducts = n.products.filter((p) => p.units || p.returns);
  if (!activeProducts.length) {
    rows.push(excelRow([
      excelCell("No sales recorded in this period.", "String", "Muted"),
      excelCell("", "String"), excelCell("", "String"), excelCell("", "String"),
      excelCell("", "String"), excelCell("", "String"), excelCell("", "String"),
      excelCell("", "String"), excelCell("", "String"), excelCell("", "String"), excelCell("", "String"),
    ]));
  } else {
    activeProducts.forEach((p) => {
      const margin = p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0;
      rows.push(
        excelRow([
          excelCell(p.productName || "—", "String", "String"),
          excelCell(p.brandName || "—", "String", "String"),
          excelCell(p.productModel || "—", "String", "String"),
          excelCell(p.units, "Integer", "Num2"),
          excelCell(p.sold ?? p.units, "Integer", "Num2"),
          excelCell(p.revenue, "Number", "Num"),
          excelCell(p.cost, "Number", "Num"),
          excelCell(p.profit, "Number", "Num"),
          excelCell(margin, "Percentage", "Percent"),
          excelCell(p.returns, "Integer", "Num2"),
          excelCell(p.returnRate, "Percentage", "Percent"),
        ]),
      );
    });
  }

  // Proper total row aligned with every column
  const overallMargin = n.totals.revenue > 0 ? (n.totals.profit / n.totals.revenue) * 100 : 0;
  rows.push(
    excelRow([
      excelCell("Total (All Products)", "String", "Totals"),
      excelCell("—", "String", "Totals"),
      excelCell("—", "String", "Totals"),
      excelCell(n.totals.units, "Integer", "TotalsNum"),
      excelCell(n.totals.grossUnits, "Integer", "TotalsNum"),
      excelCell(n.totals.revenue, "Number", "TotalsMoney"),
      excelCell(n.totals.cost, "Number", "TotalsMoney"),
      excelCell(n.totals.profit, "Number", "TotalsMoney"),
      excelCell(overallMargin, "Percentage", "TotalsPercent"),
      excelCell(n.totals.returns, "Integer", "TotalsNum"),
      excelCell(n.totals.returnRate, "Percentage", "TotalsPercent"),
    ]),
  );

  return excelSheet("Product Sales", [colW, ...rows]);
}

// 3. Best Sellers Sheet
function excelBestSellersSheet(n) {
  const colW = excelColumnWidths([8, 30, 18, 20, 14, 18, 18, 16], 16);
  const rows = [];
  rows.push(excelTitleRow("Best Selling Products", 8));
  rows.push(excelSubtitleRow(`${n.shopName}  ·  ${n.period}`, 8));
  rows.push(excelBlankRow(8));
  rows.push(excelHeaders([
    { label: "Rank", align: "center" },
    { label: "Product Name", align: "left" },
    { label: "Brand", align: "left" },
    { label: "Model", align: "left" },
    { label: "Units Sold", align: "right" },
    { label: "Revenue (BDT)", align: "right" },
    { label: "Profit (BDT)", align: "right" },
    { label: "Share of Revenue", align: "right" },
  ]));

  if (!n.bestSellers.length) {
    rows.push(excelRow([
      excelCell("—", "String", "StringCenter"),
      excelCell("No best sellers recorded in this period.", "String", "Muted"),
      excelCell("", "String"), excelCell("", "String"), excelCell("", "String"),
      excelCell("", "String"), excelCell("", "String"), excelCell("", "String"),
    ]));
  } else {
    n.bestSellers.forEach((p, i) => {
      const share = n.totals.revenue > 0 ? (p.revenue / n.totals.revenue) * 100 : 0;
      rows.push(
        excelRow([
          excelCell(i + 1, "Integer", "StringCenter"),
          excelCell(p.productName || "—", "String", "String"),
          excelCell(p.brandName || "—", "String", "String"),
          excelCell(p.model || "—", "String", "String"),
          excelCell(p.units, "Integer", "Num2"),
          excelCell(p.revenue, "Number", "Num"),
          excelCell(p.profit, "Number", "Num"),
          excelCell(share, "Percentage", "Percent"),
        ]),
      );
    });

    const sumUnits = n.bestSellers.reduce((s, p) => s + p.units, 0);
    const sumRev = n.bestSellers.reduce((s, p) => s + p.revenue, 0);
    const sumProf = n.bestSellers.reduce((s, p) => s + p.profit, 0);
    const sumShare = n.totals.revenue > 0 ? (sumRev / n.totals.revenue) * 100 : 0;

    rows.push(
      excelRow([
        excelCell("Total", "String", "TotalsCenter"),
        excelCell("—", "String", "Totals"),
        excelCell("—", "String", "Totals"),
        excelCell("—", "String", "Totals"),
        excelCell(sumUnits, "Integer", "TotalsNum"),
        excelCell(sumRev, "Number", "TotalsMoney"),
        excelCell(sumProf, "Number", "TotalsMoney"),
        excelCell(sumShare, "Percentage", "TotalsPercent"),
      ]),
    );
  }

  return excelSheet("Best Sellers", [colW, ...rows]);
}

// 4. Returned Products Sheet
function excelReturnedProductsSheet(n) {
  const colW = excelColumnWidths([8, 30, 20, 16, 16], 18);
  const rows = [];
  rows.push(excelTitleRow("Returned Products & Defect Rates", 5));
  rows.push(excelSubtitleRow(`${n.shopName}  ·  ${n.period}`, 5));
  rows.push(excelBlankRow(5));
  rows.push(excelHeaders([
    { label: "Rank", align: "center" },
    { label: "Product Name", align: "left" },
    { label: "Brand", align: "left" },
    { label: "Return Count", align: "right" },
    { label: "Return Rate (%)", align: "right" },
  ]));

  if (!n.returnRows.length) {
    rows.push(excelRow([
      excelCell("—", "String", "StringCenter"),
      excelCell("No returns recorded in this period.", "String", "String"),
      excelCell("—", "String", "String"),
      excelCell(0, "Integer", "Num2"),
      excelCell(0, "Percentage", "Percent"),
    ]));
  } else {
    n.returnRows.forEach((r, i) => {
      rows.push(
        excelRow([
          excelCell(i + 1, "Integer", "StringCenter"),
          excelCell(r.productName || "—", "String", "String"),
          excelCell(r.brandName || "—", "String", "String"),
          excelCell(r.returns, "Integer", "Num2"),
          excelCell(r.returnRate, "Percentage", "Percent"),
        ]),
      );
    });

    rows.push(
      excelRow([
        excelCell("Total Returns", "String", "TotalsCenter"),
        excelCell("—", "String", "Totals"),
        excelCell("—", "String", "Totals"),
        excelCell(n.totals.returns, "Integer", "TotalsNum"),
        excelCell(n.totals.returnRate, "Percentage", "TotalsPercent"),
      ]),
    );
  }

  return excelSheet("Returned Products", [colW, ...rows]);
}

// 5. Warranty Tracking Sheet
function excelWarrantyTrackingSheet(n) {
  const colW = excelColumnWidths([8, 28, 32, 18, 18, 18], 18);
  const rows = [];
  rows.push(excelTitleRow("Warranty Tracking List", 6));
  rows.push(excelSubtitleRow(`${n.shopName}  ·  ${n.period}  ·  ${countText(n.warrantyDetails.length, "tracked record")}`, 6));
  rows.push(excelBlankRow(6));
  rows.push(excelHeaders([
    { label: "#", align: "center" },
    { label: "Product Name", align: "left" },
    { label: "QR / Serial Code", align: "center" },
    { label: "Activation Date", align: "center" },
    { label: "Expiration Date", align: "center" },
    { label: "Warranty Status", align: "center" },
  ]));

  if (!n.warrantyDetails.length) {
    rows.push(excelRow([
      excelCell("—", "String", "StringCenter"),
      excelCell("No activated warranties in this period.", "String", "Muted"),
      excelCell("", "String"), excelCell("", "String"), excelCell("", "String"), excelCell("", "String"),
    ]));
  } else {
    n.warrantyDetails.forEach((w, i) => {
      rows.push(
        excelRow([
          excelCell(i + 1, "Integer", "StringCenter"),
          excelCell(w.productName || "—", "String", "String"),
          excelCell(w.code || "—", "String", "StringCenter"),
          excelDateCell(w.activatedAt, "date"),
          excelDateCell(w.warrantyExpiresAt, "date"),
          excelCell(warrantyStatusLabel(w.status), "String", "StringCenter"),
        ]),
      );
    });

    rows.push(
      excelRow([
        excelCell(`Total Tracked Warranties: ${n.warrantyDetails.length}`, "String", "Totals"),
        excelCell("—", "String", "Totals"),
        excelCell("—", "String", "Totals"),
        excelCell("—", "String", "Totals"),
        excelCell("—", "String", "Totals"),
        excelCell(`${n.warrantyTotals.active} Active`, "String", "TotalsCenter"),
      ]),
    );
  }

  return excelSheet("Warranty Tracking", [colW, ...rows]);
}

// 6. Monthly Trends Sheet
function excelMonthlyTrendsSheet(n) {
  const colW = excelColumnWidths([24, 14, 18, 18, 18, 16, 14], 16);
  const rows = [];
  rows.push(excelTitleRow("Monthly Trends", 7));
  rows.push(excelSubtitleRow(`${n.shopName}  ·  ${n.period}  ·  ${countText(n.monthly.length, "month")} of data`, 7));
  rows.push(excelBlankRow(7));
  rows.push(excelHeaders([
    { label: "Month", align: "left" },
    { label: "Units Sold", align: "right" },
    { label: "Revenue (BDT)", align: "right" },
    { label: "Cost (BDT)", align: "right" },
    { label: "Net Profit (BDT)", align: "right" },
    { label: "Profit Margin", align: "right" },
    { label: "Returns", align: "right" },
  ]));

  if (!n.monthly.length) {
    rows.push(excelRow([
      excelCell("No monthly trend records in this period.", "String", "Muted"),
      excelCell("", "String"), excelCell("", "String"), excelCell("", "String"),
      excelCell("", "String"), excelCell("", "String"), excelCell("", "String"),
    ]));
  } else {
    n.monthly.forEach((m) => {
      const margin = m.revenue > 0 ? (m.profit / m.revenue) * 100 : 0;
      rows.push(
        excelRow([
          excelCell(m.label || "—", "String", "String"),
          excelCell(m.units, "Integer", "Num2"),
          excelCell(m.revenue, "Number", "Num"),
          excelCell(m.cost || 0, "Number", "Num"),
          excelCell(m.profit, "Number", "Num"),
          excelCell(margin, "Percentage", "Percent"),
          excelCell(m.returns, "Integer", "Num2"),
        ]),
      );
    });

    const sumUnits = n.monthly.reduce((s, m) => s + m.units, 0);
    const sumRev = n.monthly.reduce((s, m) => s + m.revenue, 0);
    const sumCost = n.monthly.reduce((s, m) => s + (m.cost || 0), 0);
    const sumProf = n.monthly.reduce((s, m) => s + m.profit, 0);
    const sumRet = n.monthly.reduce((s, m) => s + m.returns, 0);
    const overallMargin = sumRev > 0 ? (sumProf / sumRev) * 100 : 0;

    rows.push(
      excelRow([
        excelCell("Total", "String", "Totals"),
        excelCell(sumUnits, "Integer", "TotalsNum"),
        excelCell(sumRev, "Number", "TotalsMoney"),
        excelCell(sumCost, "Number", "TotalsMoney"),
        excelCell(sumProf, "Number", "TotalsMoney"),
        excelCell(overallMargin, "Percentage", "TotalsPercent"),
        excelCell(sumRet, "Integer", "TotalsNum"),
      ]),
    );
  }

  return excelSheet("Monthly Trends", [colW, ...rows]);
}

// 7. Sales Records Sheet
function excelSalesRecordsSheet(n) {
  const colW = excelColumnWidths([8, 26, 18, 18, 30, 22, 18, 30, 16, 16, 16, 20, 14], 18);
  const rows = [];
  rows.push(excelTitleRow("Sales & Activation Records", 13));
  rows.push(excelSubtitleRow(`${n.shopName}  ·  ${n.period}  ·  ${countText(n.activitySales.length, "sale record")}`, 13));
  rows.push(excelBlankRow(13));
  rows.push(excelHeaders([
    { label: "#", align: "center" },
    { label: "Product Name", align: "left" },
    { label: "Brand", align: "left" },
    { label: "Model", align: "left" },
    { label: "QR / Item Code", align: "center" },
    { label: "Customer Name", align: "left" },
    { label: "Customer Phone", align: "center" },
    { label: "Customer Address", align: "left" },
    { label: "Sale Price (BDT)", align: "right" },
    { label: "Cost (BDT)", align: "right" },
    { label: "Profit (BDT)", align: "right" },
    { label: "Event Date & Time", align: "center" },
    { label: "Status", align: "center" },
  ]));

  const netActivitySales = n.activitySales.filter((s) => {
    const status = String(s.status || (s.returnedAt ? "returned" : "sold")).toLowerCase();
    return status !== "returned" && status !== "voided";
  });

  if (!n.activitySales.length) {
    rows.push(excelRow([
      excelCell("—", "String", "StringCenter"),
      excelCell("No sales recorded in this period.", "String", "Muted"),
      excelCell("", "String"), excelCell("", "String"), excelCell("", "String"),
      excelCell("", "String"), excelCell("", "String"), excelCell("", "String"),
      excelCell("", "String"), excelCell("", "String"), excelCell("", "String"), excelCell("", "String"),
      excelCell("", "String"),
    ]));
  } else {
    n.activitySales.forEach((s, i) => {
      rows.push(
        excelRow([
          excelCell(i + 1, "Integer", "StringCenter"),
          excelCell(s.productName || "—", "String", "String"),
          excelCell(s.brandName || "—", "String", "String"),
          excelCell(s.productModel || "—", "String", "String"),
          excelCell(s.code || "—", "String", "StringCenter"),
          excelCell(s.customerName || "Walk-in", "String", "String"),
          excelCell(s.customerPhone || "—", "String", "StringCenter"),
          excelCell(s.customerAddress || "—", "String", "String"),
          excelCell(s.actualPrice, "Number", "Num"),
          excelCell(s.costPrice, "Number", "Num"),
          excelCell(s.profit, "Number", "Num"),
          excelDateCell(s.returnedAt || s.saleDate || s.soldAt || s.activatedAt, "datetime"),
          excelCell(saleStatusLabel(s.status || (s.returnedAt ? "returned" : "sold")), "String", "StringCenter"),
        ]),
      );
    });

    const sumRev = netActivitySales.reduce((s, row) => s + row.actualPrice, 0);
    const sumCost = netActivitySales.reduce((s, row) => s + row.costPrice, 0);
    const sumProf = netActivitySales.reduce((s, row) => s + row.profit, 0);

    rows.push(
      excelRow([
        excelCell(`Net Total (${countText(netActivitySales.length, "sale")} / ${countText(n.activitySales.length, "activity record")})`, "String", "Totals"),
        excelCell("—", "String", "Totals"),
        excelCell("—", "String", "Totals"),
        excelCell("—", "String", "Totals"),
        excelCell("—", "String", "Totals"),
        excelCell("—", "String", "Totals"),
        excelCell("—", "String", "Totals"),
        excelCell("—", "String", "Totals"),
        excelCell(sumRev, "Number", "TotalsMoney"),
        excelCell(sumCost, "Number", "TotalsMoney"),
        excelCell(sumProf, "Number", "TotalsMoney"),
        excelCell("—", "String", "TotalsCenter"),
        excelCell("Returned excluded", "String", "TotalsCenter"),
      ]),
    );
  }

  return excelSheet("Sales Records", [colW, ...rows]);
}

// 8. Customer Registry Sheet
function excelCustomerRegistrySheet(n) {
  const colW = excelColumnWidths([8, 26, 20, 35, 16], 18);
  const rows = [];
  rows.push(excelTitleRow("Registered Customer Phone Numbers", 5));
  rows.push(excelSubtitleRow(`${n.shopName}  ·  ${n.period}  ·  ${countText(n.phones.length, "registered customer")}`, 5));
  rows.push(excelBlankRow(5));
  rows.push(excelHeaders([
    { label: "#", align: "center" },
    { label: "Customer Name", align: "left" },
    { label: "Phone Number", align: "center" },
    { label: "Address", align: "left" },
    { label: "Total Purchases", align: "right" },
  ]));

  if (!n.phones.length) {
    rows.push(excelRow([
      excelCell("—", "String", "StringCenter"),
      excelCell("No customer phone numbers recorded in this period.", "String", "Muted"),
      excelCell("", "String"), excelCell("", "String"), excelCell("", "String"),
    ]));
  } else {
    n.phones.forEach((p) => {
      rows.push(
        excelRow([
          excelCell(p.index, "Integer", "StringCenter"),
          excelCell(p.name || "—", "String", "String"),
          excelCell(p.phone || "—", "String", "StringCenter"),
          excelCell(p.address || "—", "String", "String"),
          excelCell(p.purchases, "Integer", "Num2"),
        ]),
      );
    });

    const sumPurchases = n.phones.reduce((s, p) => s + p.purchases, 0);
    rows.push(
      excelRow([
        excelCell(`Total Registered: ${countText(n.phones.length, "customer")}`, "String", "Totals"),
        excelCell("—", "String", "Totals"),
        excelCell("—", "String", "Totals"),
        excelCell("—", "String", "Totals"),
        excelCell(sumPurchases, "Integer", "TotalsNum"),
      ]),
    );
  }

  return excelSheet("Customer Registry", [colW, ...rows]);
}

// 9. Customer Purchases Sheet
function excelCustomerPurchasesSheet(n) {
  const colW = excelColumnWidths([8, 26, 20, 35, 14, 18, 18, 18, 18, 26, 20], 18);
  const rows = [];
  rows.push(excelTitleRow("Customer Purchase Breakdown (ranked by value)", 11));
  rows.push(excelSubtitleRow(`${n.shopName}  ·  ${n.period}  ·  ${countText(n.customers.length, "customer")}`, 11));
  rows.push(excelBlankRow(11));
  rows.push(excelHeaders([
    { label: "Rank", align: "center" },
    { label: "Customer Name", align: "left" },
    { label: "Phone", align: "center" },
    { label: "Address", align: "left" },
    { label: "Purchases", align: "right" },
    { label: "Distinct Products", align: "right" },
    { label: "Total Spent (BDT)", align: "right" },
    { label: "Total Cost (BDT)", align: "right" },
    { label: "Total Profit (BDT)", align: "right" },
    { label: "Top Product", align: "left" },
    { label: "Top Model", align: "left" },
  ]));

  if (!n.customers.length) {
    rows.push(excelRow([
      excelCell("—", "String", "StringCenter"),
      excelCell("No customer purchase data recorded in this period.", "String", "Muted"),
      excelCell("", "String"), excelCell("", "String"), excelCell("", "String"),
      excelCell("", "String"), excelCell("", "String"), excelCell("", "String"),
      excelCell("", "String"), excelCell("", "String"), excelCell("", "String"),
    ]));
  } else {
    n.customers.forEach((c, i) => {
      rows.push(
        excelRow([
          excelCell(i + 1, "Integer", "StringCenter"),
          excelCell(c.name || "Unnamed customer", "String", "String"),
          excelCell(c.phone || "—", "String", "StringCenter"),
          excelCell(c.address || "—", "String", "String"),
          excelCell(c.purchases, "Integer", "Num2"),
          excelCell(c.distinctProducts, "Integer", "Num2"),
          excelCell(c.revenue, "Number", "Num"),
          excelCell(c.cost, "Number", "Num"),
          excelCell(c.profit, "Number", "Num"),
          excelCell(c.top.productName || "—", "String", "String"),
          excelCell(c.top.productModel || "—", "String", "String"),
        ]),
      );
    });

    const sumPurchases = n.customers.reduce((s, c) => s + c.purchases, 0);
    const sumRev = n.customers.reduce((s, c) => s + c.revenue, 0);
    const sumCost = n.customers.reduce((s, c) => s + c.cost, 0);
    const sumProf = n.customers.reduce((s, c) => s + c.profit, 0);

    rows.push(
      excelRow([
        excelCell(`Total (${countText(n.customers.length, "customer")})`, "String", "Totals"),
        excelCell("—", "String", "Totals"),
        excelCell("—", "String", "Totals"),
        excelCell("—", "String", "Totals"),
        excelCell(sumPurchases, "Integer", "TotalsNum"),
        excelCell("—", "String", "TotalsCenter"),
        excelCell(sumRev, "Number", "TotalsMoney"),
        excelCell(sumCost, "Number", "TotalsMoney"),
        excelCell(sumProf, "Number", "TotalsMoney"),
        excelCell("—", "String", "Totals"),
        excelCell("—", "String", "Totals"),
      ]),
    );
  }

  return excelSheet("Customer Purchases", [colW, ...rows]);
}

// 10. Customer Products Sheet
function excelCustomerProductsSheet(n) {
  const colW = excelColumnWidths([14, 26, 20, 32, 26, 18, 18, 28, 16, 18, 18, 18], 18);
  const rows = [];
  rows.push(excelTitleRow("Products Each Customer Bought", 12));
  rows.push(excelSubtitleRow(`${n.shopName}  ·  ${n.period}  ·  Itemized customer purchase records`, 12));
  rows.push(excelBlankRow(12));
  rows.push(excelHeaders([
    { label: "Customer Rank", align: "center" },
    { label: "Customer Name", align: "left" },
    { label: "Customer Phone", align: "center" },
    { label: "Customer Address", align: "left" },
    { label: "Product Name", align: "left" },
    { label: "Brand", align: "left" },
    { label: "Model", align: "left" },
    { label: "QR / Serial Code", align: "center" },
    { label: "Purchases (Qty)", align: "right" },
    { label: "Revenue (BDT)", align: "right" },
    { label: "Cost (BDT)", align: "right" },
    { label: "Profit (BDT)", align: "right" },
  ]));

  if (!n.customers.length) {
    rows.push(excelRow([
      excelCell("—", "String", "StringCenter"),
      excelCell("No customer purchase data recorded in this period.", "String", "Muted"),
      excelCell("", "String"), excelCell("", "String"), excelCell("", "String"),
      excelCell("", "String"), excelCell("", "String"), excelCell("", "String"),
      excelCell("", "String"), excelCell("", "String"), excelCell("", "String"), excelCell("", "String"),
    ]));
  } else {
    let sumQty = 0;
    let sumRev = 0;
    let sumCost = 0;
    let sumProf = 0;

    n.customers.forEach((c, i) => {
      const details = c.details.length
        ? c.details
        : [{ productName: "—", brandName: "—", productModel: "—", code: "—", purchases: c.purchases, revenue: c.revenue, cost: c.cost, profit: c.profit }];

      details.forEach((d) => {
        sumQty += d.purchases;
        sumRev += d.revenue;
        sumCost += d.cost;
        sumProf += d.profit;

        rows.push(
          excelRow([
            excelCell(i + 1, "Integer", "StringCenter"),
            excelCell(c.name || "Unnamed customer", "String", "String"),
            excelCell(c.phone || "—", "String", "StringCenter"),
            excelCell(c.address || "—", "String", "String"),
            excelCell(d.productName || "—", "String", "String"),
            excelCell(d.brandName || "—", "String", "String"),
            excelCell(d.productModel || "—", "String", "String"),
            excelCell(d.code || "—", "String", "StringCenter"),
            excelCell(d.purchases, "Integer", "Num2"),
            excelCell(d.revenue, "Number", "Num"),
            excelCell(d.cost, "Number", "Num"),
            excelCell(d.profit, "Number", "Num"),
          ]),
        );
      });
    });

    rows.push(
      excelRow([
        excelCell("Total Purchases", "String", "Totals"),
        excelCell("—", "String", "Totals"),
        excelCell("—", "String", "Totals"),
        excelCell("—", "String", "Totals"),
        excelCell("—", "String", "Totals"),
        excelCell("—", "String", "Totals"),
        excelCell("—", "String", "Totals"),
        excelCell("—", "String", "Totals"),
        excelCell(sumQty, "Integer", "TotalsNum"),
        excelCell(sumRev, "Number", "TotalsMoney"),
        excelCell(sumCost, "Number", "TotalsMoney"),
        excelCell(sumProf, "Number", "TotalsMoney"),
      ]),
    );
  }

  return excelSheet("Customer Products", [colW, ...rows]);
}

function excelAnalyticsSheets(n) {
  return [
    excelProductSalesSheet(n),
    excelBestSellersSheet(n),
    excelReturnedProductsSheet(n),
    excelWarrantyTrackingSheet(n),
    excelMonthlyTrendsSheet(n),
    excelSalesRecordsSheet(n),
  ];
}

function excelCustomerSheets(n) {
  return [
    excelCustomerRegistrySheet(n),
    excelCustomerPurchasesSheet(n),
    excelCustomerProductsSheet(n),
  ];
}

function xlsxStylesXml() {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    '  <numFmts count="6">',
    '    <numFmt numFmtId="164" formatCode="#,##0.00"/>',
    '    <numFmt numFmtId="165" formatCode="#,##0"/>',
    '    <numFmt numFmtId="166" formatCode="0.0%"/>',
    '    <numFmt numFmtId="167" formatCode="dd mmm yyyy"/>',
    '    <numFmt numFmtId="168" formatCode="dd mmm yyyy, h:mm AM/PM"/>',
    '    <numFmt numFmtId="169" formatCode="\u09F3#,##0"/>',
    '  </numFmts>',
    '  <fonts count="12">',
    '    <font><sz val="11"/><name val="Nirmala UI"/><family val="2"/></font>',
    '    <font><b/><sz val="16"/><color rgb="FF0F172A"/><name val="Nirmala UI"/><family val="2"/></font>',
    '    <font><b/><sz val="12.5"/><color rgb="FFFFFFFF"/><name val="Nirmala UI"/><family val="2"/></font>',
    '    <font><b/><sz val="10.5"/><color rgb="FFFFFFFF"/><name val="Nirmala UI"/><family val="2"/></font>',
    '    <font><sz val="10.5"/><color rgb="FF0F172A"/><name val="Nirmala UI"/><family val="2"/></font>',
    '    <font><sz val="9.5"/><color rgb="FF64748B"/><name val="Nirmala UI"/><family val="2"/></font>',
    '    <font><b/><sz val="10.5"/><color rgb="FF096B6D"/><name val="Nirmala UI"/><family val="2"/></font>',
    '    <font><b/><sz val="12"/><color rgb="FF0F172A"/><name val="Nirmala UI"/><family val="2"/></font>',
    '    <font><b/><sz val="18"/><color rgb="FFFFFFFF"/><name val="Nirmala UI"/><family val="2"/></font>',
    '    <font><b/><sz val="9"/><color rgb="FFFFFFFF"/><name val="Nirmala UI"/><family val="2"/></font>',
    '    <font><b/><sz val="14"/><color rgb="FF0F8B8D"/><name val="Nirmala UI"/><family val="2"/></font>',
    '    <font><sz val="10"/><color rgb="FFFFFFFF"/><name val="Nirmala UI"/><family val="2"/></font>',
    '  </fonts>',
    '  <fills count="7">',
    '    <fill><patternFill patternType="none"/></fill>',
    '    <fill><patternFill patternType="gray125"/></fill>',
    '    <fill><patternFill patternType="solid"><fgColor rgb="FF14264F"/><bgColor indexed="64"/></patternFill></fill>',
    '    <fill><patternFill patternType="solid"><fgColor rgb="FFE6F7F7"/><bgColor indexed="64"/></patternFill></fill>',
    '    <fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/><bgColor indexed="64"/></patternFill></fill>',
    '    <fill><patternFill patternType="solid"><fgColor rgb="FF0B1736"/><bgColor indexed="64"/></patternFill></fill>',
    '    <fill><patternFill patternType="solid"><fgColor rgb="FF0F8B8D"/><bgColor indexed="64"/></patternFill></fill>',
    '  </fills>',
    '  <borders count="4">',
    '    <border><left/><right/><top/><bottom/><diagonal/></border>',
    '    <border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right><top style="thin"><color rgb="FFCBD5E1"/></top><bottom style="thin"><color rgb="FFCBD5E1"/></bottom><diagonal/></border>',
    '    <border><left style="thin"><color rgb="FF14264F"/></left><right style="thin"><color rgb="FF14264F"/></right><top style="thin"><color rgb="FF14264F"/></top><bottom style="medium"><color rgb="FF0B1736"/></bottom><diagonal/></border>',
    '    <border><left style="thin"><color rgb="FF0F8B8D"/></left><right style="thin"><color rgb="FF0F8B8D"/></right><top style="thin"><color rgb="FF0F8B8D"/></top><bottom style="double"><color rgb="FF096B6D"/></bottom><diagonal/></border>',
  '  </borders>',
    '  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>',
    '  <cellXfs count="28">',
    '    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
    '    <xf numFmtId="0" fontId="8" fillId="5" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>',
    '    <xf numFmtId="0" fontId="2" fillId="6" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>',
    '    <xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>',
    '    <xf numFmtId="0" fontId="3" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>',
    '    <xf numFmtId="0" fontId="3" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1"/></xf>',
    '    <xf numFmtId="0" fontId="3" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>',
    '    <xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>',
    '    <xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>',
    '    <xf numFmtId="169" fontId="4" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>',
    '    <xf numFmtId="165" fontId="4" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>',
    '    <xf numFmtId="164" fontId="4" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>',
    '    <xf numFmtId="166" fontId="4" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>',
    '    <xf numFmtId="167" fontId="4" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>',
    '    <xf numFmtId="168" fontId="4" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>',
    '    <xf numFmtId="0" fontId="6" fillId="3" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>',
    '    <xf numFmtId="165" fontId="6" fillId="3" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>',
    '    <xf numFmtId="166" fontId="6" fillId="3" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>',
    '    <xf numFmtId="0" fontId="6" fillId="3" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>',
    '    <xf numFmtId="0" fontId="5" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>',
    '    <xf numFmtId="0" fontId="7" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>',
    '    <xf numFmtId="0" fontId="9" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>',
    '    <xf numFmtId="165" fontId="10" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>',
    '    <xf numFmtId="169" fontId="10" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>',
    '    <xf numFmtId="166" fontId="10" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>',
    '    <xf numFmtId="0" fontId="10" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>',
    '    <xf numFmtId="169" fontId="6" fillId="3" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>',
    '    <xf numFmtId="0" fontId="11" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>',
    '  </cellXfs>',
    '  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>',
    '</styleSheet>',
  ].join("\n");
}

function shortSheetName(name) {
  const cleaned = String(name || "Sheet").replace(/[\\/*?:[\]]/g, "").slice(0, 31);
  return cleaned || "Sheet";
}

function range(count, fn) {
  const out = [];
  for (let i = 0; i < count; i += 1) out.push(fn(i));
  return out;
}

function xlsxPackageXml(n, sheets) {
  const nowIso = new Date().toISOString();
  const sheetCount = sheets.length;

  const contentTypes = [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`,
    `  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`,
    `  <Default Extension="xml" ContentType="application/xml"/>`,
    `  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`,
    range(sheetCount, (i) => `  <Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n"),
    `  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`,
    `  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>`,
    `  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>`,
    `</Types>`,
  ].join("\n");

  const rootRels = [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`,
    `  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>`,
    `  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>`,
    `  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>`,
    `</Relationships>`,
  ].join("\n");

  const sheetsXml = sheets
    .map((s, i) => `  <sheet name="${excelEscape(shortSheetName(s.name))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join("\n");
  const printTitles = sheets
    .map((sheet, index) => sheet.headerRow ? `  <definedName name="_xlnm.Print_Titles" localSheetId="${index}">'${shortSheetName(sheet.name).replace(/'/g, "''")}'!$${sheet.headerRow}:$${sheet.headerRow}</definedName>` : "")
    .filter(Boolean);
  const workbookXml = [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`,
    `  <sheets>`,
    sheetsXml,
    `  </sheets>`,
    printTitles.length ? `  <definedNames>\n${printTitles.join("\n")}\n  </definedNames>` : "",
    `  <calcPr calcId="191029"/>`,
    `</workbook>`,
  ].join("\n");

  const workbookRels = [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`,
    `  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
    range(sheetCount, (i) => `  <Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("\n"),
    `</Relationships>`,
  ].join("\n");

  const coreXml = [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`,
    `  <dc:title>WarQ Sales &amp; Warranty Report</dc:title>`,
    `  <dc:creator>WarQ</dc:creator>`,
    `  <dc:subject>${excelEscape(n.period)}</dc:subject>`,
    `  <cp:keywords>WarQ, Report, Warranty, Sales</cp:keywords>`,
    `  <dcterms:created xsi:type="dcterms:W3CDTF">${nowIso}</dcterms:created>`,
    `  <dcterms:modified xsi:type="dcterms:W3CDTF">${nowIso}</dcterms:modified>`,
    `</cp:coreProperties>`,
  ].join("\n");

  const appXml = [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">`,
    `  <Application>WarQ Smart Warranty System</Application>`,
    `  <DocSecurity>0</DocSecurity>`,
    `  <ScaleCrop>false</ScaleCrop>`,
    `  <Company>WarQ</Company>`,
    `  <LinksUpToDate>false</LinksUpToDate>`,
    `  <SharedDoc>false</SharedDoc>`,
    `  <HyperlinksChanged>false</HyperlinksChanged>`,
    `  <AppVersion>16.0300</AppVersion>`,
    `</Properties>`,
  ].join("\n");

  return { contentTypes, rootRels, workbookXml, workbookRels, coreXml, appXml };
}

async function excelWorkbook(n, sheets) {
  const pkg = xlsxPackageXml(n, sheets);
  const zip = new JSZip();
  zip.file("[Content_Types].xml", pkg.contentTypes);
  zip.file("_rels/.rels", pkg.rootRels);
  zip.file("xl/workbook.xml", pkg.workbookXml);
  zip.file("xl/_rels/workbook.xml.rels", pkg.workbookRels);
  zip.file("xl/styles.xml", xlsxStylesXml());
  sheets.forEach((s, i) => {
    zip.file(`xl/worksheets/sheet${i + 1}.xml`, worksheetXml(s.name, s.widths, s.rows, s.headerRow, s.filterEnd));
  });
  zip.file("docProps/core.xml", pkg.coreXml);
  zip.file("docProps/app.xml", pkg.appXml);

  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  return blob;
}

function excelEndSheet() {
  return excelSheet("End", [
    [30, 15, 15],
    excelRow([excelCell("End of report · WarQ Smart Warranty System", "String", "Muted")], 30),
  ]);
}

async function excelFullReport(report) {
  const n = normalizeReport(report);
  const sheets = [
    excelDashboardSheet(n),
    excelSummarySheet(n),
    ...excelAnalyticsSheets(n),
    ...excelCustomerSheets(n),
  ];
  return excelWorkbook(n, sheets);
}

async function excelAnalyticsOnly(report) {
  const n = normalizeReport(report);
  const sheets = [
    excelSummarySheet(n),
    ...excelAnalyticsSheets(n),
  ];
  return excelWorkbook(n, sheets);
}

async function excelCustomerOnly(report) {
  const n = normalizeReport(report);
  const sheets = [...excelCustomerSheets(n)];
  return excelWorkbook(n, sheets);
}

/* ==========================================================================
   DOCX — OOXML via JSZip, professional two-part layout
   ========================================================================== */

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// The installed Noto family covers Bengali reliably; the serif display face is
// used only for report titles so operational rows remain compact and legible.
const DOCX_FONT = "Noto Sans";
const DOCX_DISPLAY_FONT = "Georgia";
const DOCX_NAVY = "13263D";
const DOCX_TEAL = "0E8F73";
const DOCX_INK = "203047";
const DOCX_MUTED = "65778B";
const DOCX_PALE = "E5EEF7";
const DOCX_CARD = "F4F8F9";
const DOCX_LINE = "C6D2D9";

function docxRunProperties(options = {}) {
  const font = options.font || DOCX_FONT;
  const properties = [
    `<w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:eastAsia="${font}" w:cs="${font}"/>`,
    '<w:lang w:val="en-US" w:eastAsia="bn-BD" w:bidi="bn-BD"/>',
  ];
  if (options.bold) properties.push("<w:b/>");
  if (options.size) properties.push(`<w:sz w:val="${options.size}"/><w:szCs w:val="${options.size}"/>`);
  if (options.color) properties.push(`<w:color w:val="${options.color}"/>`);
  if (options.italic) properties.push("<w:i/>");
  return properties.join("");
}

function docxPara(text, options = {}) {
  const pPr = [`<w:spacing w:before="${options.before || 0}" w:after="${options.after || 60}"/>`];
  if (options.keepNext) pPr.push("<w:keepNext/>");
  if (options.keepLines) pPr.push("<w:keepLines/>");
  if (options.pageBreakBefore) pPr.push("<w:pageBreakBefore/>");
  if (options.align) pPr.push(`<w:jc w:val="${options.align}"/>`);
  return `      <w:p><w:pPr>${pPr.join("")}</w:pPr><w:r><w:rPr>${docxRunProperties(options)}</w:rPr><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;
}

function docxHeading1(text) {
  return docxPara(text, { bold: true, font: DOCX_DISPLAY_FONT, size: 48, color: DOCX_NAVY, before: 120, after: 80, keepNext: true });
}

function docxHeading2(text) {
  return docxPara(text, { bold: true, size: 28, color: DOCX_NAVY, before: 200, after: 80, keepNext: true });
}

function docxCell(text, width, bold = false, align = "l", options = {}) {
  const jc = align === "r" ? '<w:jc w:val="right"/>' : "";
  const fill = options.fill || (bold ? DOCX_TEAL : "FFFFFF");
  const color = options.color || (bold ? "FFFFFF" : DOCX_INK);
  const size = options.size || (bold ? 17 : 16);
  const shd = `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>`;
  const runProps = docxRunProperties({ bold, size, color });
  const body = xmlEscape(text).replace(/\n/g, '</w:t><w:br/><w:t xml:space="preserve">');
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:vAlign w:val="center"/>${shd}</w:tcPr><w:p><w:pPr><w:spacing w:after="0"/>${jc}</w:pPr><w:r><w:rPr>${runProps}</w:rPr><w:t xml:space="preserve">${body}</w:t></w:r></w:p></w:tc>`;
}

const DOCX_MAX_TABLE_WIDTH = 14100;

function fitDocxWidths(widths, maxWidth = DOCX_MAX_TABLE_WIDTH) {
  const sum = widths.reduce((acc, w) => acc + w, 0);
  if (sum <= maxWidth) return widths;
  const scale = maxWidth / sum;
  const fitted = widths.map((w) => Math.round(w * scale));
  const last = fitted.reduce((acc, w) => acc + w, 0);
  fitted[fitted.length - 1] += maxWidth - last;
  return fitted;
}

function docxTable(headers, rows, widths, options = {}) {
  const fitted = fitDocxWidths(widths, options.maxWidth || DOCX_MAX_TABLE_WIDTH);
  const sumW = fitted.reduce((sum, w) => sum + w, 0);
  const grid = `<w:tblGrid>${fitted.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>`;
  const head = `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${headers
    .map((h, i) => docxCell(h, fitted[i], true, options.headerAlign?.[i] || "l", {
      fill: options.headerFill || DOCX_TEAL,
      color: options.headerColor || "FFFFFF",
      size: options.headerSize || 16,
    }))
    .join("")}</w:tr>`;
  const body = rows
    .map(
      (cells, rowIndex) =>
        `<w:tr><w:trPr><w:cantSplit/></w:trPr>${cells.map((c, i) => docxCell(String(c ?? "—"), fitted[i], false, options.align?.[i] === "r" ? "r" : "l", {
          fill: options.banded && rowIndex % 2 === 1 ? (options.bandFill || DOCX_CARD) : (options.bodyFill || "FFFFFF"),
          color: options.bodyColor || DOCX_INK,
          size: options.bodySize || 16,
        })).join("")}</w:tr>`,
    )
    .join("");
  return [
    `    <w:tbl>`,
    `      <w:tblPr><w:tblW w:w="${sumW}" w:type="dxa"/><w:tblInd w:w="0" w:type="dxa"/><w:jc w:val="left"/><w:tblBorders>`,
    `        <w:top w:val="single" w:sz="6" w:color="${options.borderColor || DOCX_TEAL}"/>`,
    `        <w:left w:val="single" w:sz="4" w:color="${options.gridColor || DOCX_LINE}"/>`,
    `        <w:bottom w:val="single" w:sz="6" w:color="${options.borderColor || DOCX_TEAL}"/>`,
    `        <w:right w:val="single" w:sz="4" w:color="${options.gridColor || DOCX_LINE}"/>`,
    `        <w:insideH w:val="single" w:sz="4" w:color="${options.gridColor || DOCX_LINE}"/>`,
    `        <w:insideV w:val="single" w:sz="4" w:color="${options.gridColor || DOCX_LINE}"/>`,
    `      </w:tblBorders><w:tblLayout w:type="fixed"/><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/><w:tblCellMar><w:left w:w="120" w:type="dxa"/><w:right w:w="120" w:type="dxa"/><w:top w:w="90" w:type="dxa"/><w:bottom w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr>`,
    grid,
    head,
    body,
    "    </w:tbl>",
  ].join("\n");
}

function docxPageBreak() {
  return '      <w:p><w:r><w:br w:type="page"/></w:r></w:p>';
}

function docxSectionProperties({ landscape = false } = {}) {
const pageSize = landscape
    ? '<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>'
    : '<w:pgSz w:w="11906" w:h="16838"/>';
  return `<w:sectPr><w:type w:val="nextPage"/>${pageSize}<w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/><w:headerReference w:type="default" r:id="rId2"/><w:footerReference w:type="default" r:id="rId3"/></w:sectPr>`;
}

function docxSectionBreak(options = {}) {
  return `      <w:p><w:pPr>${docxSectionProperties(options)}</w:pPr></w:p>`;
}

function docxExecutiveSummary(n) {
  const metrics = keyBusinessMetrics(n);
  const rows = Array.from({ length: Math.ceil(metrics.length / 2) }, (_, index) => {
    const left = metrics[index * 2];
    const right = metrics[index * 2 + 1];
    return [
      left.label,
      displayMetricValue(left, { currency: true }),
      right?.label || "",
      right ? displayMetricValue(right, { currency: true }) : "",
    ];
  });
  return [
    docxPara("WARQ  /  MANAGEMENT REPORT", { bold: true, size: 19, color: "4DB49F", before: 620, after: 210 }),
    docxPara("Sales & Warranty Report", { bold: true, font: DOCX_DISPLAY_FONT, size: 60, color: "E4EAF8", after: 120, keepNext: true }),
    docxPara(n.shopName, { bold: true, size: 34, color: "4DB49F", after: 80 }),
    docxPara(n.period, { bold: true, size: 22, color: "9AAABD", after: 50 }),
    docxPara(`Report date  |  ${dateTimeText(n.generatedAt)}`, { size: 18, color: "B4C0D0", after: 440 }),
    docxHeading2("Executive Summary"),
    docxTable(["Metric", "Value", "Metric", "Value"], rows, [3000, 1600, 3000, 1600], {
      align: ["l", "r", "l", "r"],
      maxWidth: 9200,
    }),
  ].join("\n");
}

function docxCover(n) {
  const metrics = keyBusinessMetrics(n);
  const byLabel = Object.fromEntries(metrics.map((metric) => [metric.label, metric]));
  const primaryCards = ["Net Units Sold", "Net Revenue", "Net Profit", "Returns Recorded"].map((label) => byLabel[label]);
  const warrantyCards = ["Unique Products Sold", "Active Warranties", "Expired Warranties", "No-Warranty / Unlinked"].map((label) => byLabel[label]);
  const cardTable = (cards) => docxTable(
    cards.map((metric) => metric.label),
    [cards.map((metric) => displayMetricValue(metric, { currency: true }))],
    [2250, 2250, 2250, 2250],
    {
      align: ["r", "r", "r", "r"],
      headerFill: DOCX_PALE,
      headerColor: DOCX_MUTED,
      bodyFill: DOCX_CARD,
      bodyColor: DOCX_NAVY,
      headerSize: 15,
      bodySize: 28,
      borderColor: DOCX_TEAL,
    },
  );

  return [
    docxPara("WARQ  /  MANAGEMENT REPORT", { bold: true, size: 18, color: DOCX_TEAL, before: 420, after: 150 }),
    docxPara("Sales & Warranty Report", { bold: true, font: DOCX_DISPLAY_FONT, size: 60, color: DOCX_NAVY, after: 90, keepNext: true }),
    docxPara(n.shopName, { bold: true, size: 34, color: DOCX_TEAL, after: 40 }),
    docxPara(n.period, { bold: true, size: 22, color: DOCX_MUTED, after: 170 }),
    docxTable(["REPORT DATE", ""], [[dateTimeText(n.generatedAt), ""]], [2200, 6800], {
      headerFill: DOCX_TEAL,
      headerColor: "FFFFFF",
      bodyFill: DOCX_CARD,
      bodyColor: DOCX_INK,
      headerSize: 16,
      bodySize: 17,
      borderColor: DOCX_TEAL,
    }),
    docxPara("Management snapshot", { bold: true, size: 26, color: DOCX_NAVY, before: 170, after: 60, keepNext: true }),
    cardTable(primaryCards),
    docxPara("", { after: 30 }),
    cardTable(warrantyCards),
    docxPara("", { after: 30 }),
    docxTable(["REPORT SCOPE", ""], [["Sales performance  |  Product profitability  |  Warranty tracking  |  Monthly trend  |  Customer purchase details", ""]], [2200, 6800], {
      headerFill: DOCX_TEAL,
      headerColor: "FFFFFF",
      bodyFill: DOCX_PALE,
      bodyColor: DOCX_INK,
      headerSize: 16,
      bodySize: 16,
      borderColor: DOCX_TEAL,
    }),
    docxPara("Prepared from WarQ report data. Business figures, product names, customer fields, QR codes and transaction values are preserved.", {
      size: 15, color: DOCX_MUTED, before: 80, after: 0,
    }),
  ].join("\n");
}

function docxSectionIntro(number, title, description) {
  return [
    docxPara(`${number}  |  ${title.toUpperCase()}`, { bold: true, size: 18, color: DOCX_TEAL, before: 30, after: 30, keepNext: true }),
    docxHeading1(title),
    docxPara(description, { size: 19, color: DOCX_MUTED, after: 120, keepNext: true }),
  ].join("\n");
}

function docxExecutivePerformance(n) {
  const metrics = keyBusinessMetrics(n);
  const metricRows = Array.from({ length: Math.ceil(metrics.length / 2) }, (_, index) => {
    const left = metrics[index * 2];
    const right = metrics[index * 2 + 1];
    return [
      left.label,
      displayMetricValue(left, { currency: true }),
      right?.label || "",
      right ? displayMetricValue(right, { currency: true }) : "",
    ];
  });
  const soldProducts = n.products.filter((product) => product.units || product.returns);
  const strongest = soldProducts.reduce((top, product) => (!top || product.revenue > top.revenue ? product : top), null);
  const readout = [
    ["Sales volume", `${n.totals.units} net units`, `${n.totals.grossUnits} gross units including returns; ${n.totals.returns} returns recorded; ${n.totals.returnRate}% period return rate`],
    ["Financial result", `BDT ${moneyValue(n.totals.profit)} net profit`, `BDT ${moneyValue(n.totals.revenue)} revenue and BDT ${moneyValue(n.totals.cost)} net cost`],
    ["Product mix", `${n.totals.uniqueProductsSold} unique products sold`, strongest ? `Highest reported product revenue: ${strongest.productName || "—"} — BDT ${moneyValue(strongest.revenue)}` : "No product sales recorded in this period"],
    ["Warranty register", `${n.warrantyDetails.length} tracked records`, `${n.warrantyTotals.expired} expired; ${n.warrantyTotals.noWarranty} no-warranty / unlinked; ${n.warrantyTotals.active} active; ${n.warrantyTotals.voided} voided`],
    ["Customer coverage", `${n.phones.length} customers with phone numbers`, `${n.customers.length} purchase-breakdown entries are present in the source report`],
  ];
  const productRows = soldProducts.length
    ? soldProducts.map((product) => [
        product.productName || "—",
        product.brandName || "—",
        product.units,
        `BDT ${moneyValue(product.revenue)}`,
        `BDT ${moneyValue(product.profit)}`,
        product.returns,
      ])
    : [["No sales recorded in this period", "", "", "", "", ""]];

  return [
    docxSectionIntro("01", "Executive Performance", `Management summary, operational indicators and product-level results for ${n.period}.`),
    docxHeading2("Executive metric ledger"),
    docxTable(["Metric", "Value", "Metric", "Value"], metricRows, [3600, 1900, 3600, 1900], {
      align: ["l", "r", "l", "r"], banded: true, headerAlign: ["l", "r", "l", "r"],
    }),
    docxHeading2("Management readout"),
    docxTable(["Area", "Current position", "Supporting detail"], readout, [2500, 3400, 5900], { banded: true }),
    docxPara(`Figures in this section reflect the ${n.period} WarQ report.`, { size: 15, color: DOCX_MUTED, before: 70, after: 10 }),
    docxHeading2("Product performance snapshot"),
    docxTable(["Product Name", "Brand", "Units", "Revenue", "Net Profit", "Returns"], productRows, [4000, 2100, 1200, 2200, 2200, 1400], {
      align: ["l", "l", "r", "r", "r", "r"], banded: true, headerAlign: ["l", "l", "r", "r", "r", "r"],
    }),
  ].join("\n");
}

function docxProductPerformance(n) {
  const products = n.products.filter((product) => product.units || product.returns);
  const productRows = products.length
    ? products.map((product) => [
        product.productName || "—", product.brandName || "—", product.units,
        `BDT ${moneyValue(product.revenue)}`, `BDT ${moneyValue(product.profit)}`,
        product.returns, `${product.returnRate}%`,
      ])
    : [["No sales recorded in this period", "", "", "", "", "", ""]];
  const bestRows = n.bestSellers.length
    ? n.bestSellers.map((product) => [product.productName || "—", product.brandName || "—", product.model || "—", product.units, `BDT ${moneyValue(product.revenue)}`, `BDT ${moneyValue(product.profit)}`])
    : [["No best sellers recorded in this period", "", "", "", "", ""]];
  const returnedRows = n.returnRows.length
    ? n.returnRows.map((product) => [product.productName || "—", product.returns, `${product.returnRate}%`])
    : [["No returns recorded in this period", "", ""]];
  const monthlyRows = n.monthly.length
    ? n.monthly.map((month) => [month.label || "—", month.units, `BDT ${moneyValue(month.revenue)}`, `BDT ${moneyValue(month.profit)}`, month.returns])
    : [["No monthly activity recorded in this period", "", "", "", ""]];

  return [
    docxSectionIntro("02", "Product Performance", `Product sales, profitability, best-seller and return analysis for ${n.period}.`),
    docxHeading2("Product-wise sales & profit"),
    docxTable(["Product Name", "Brand", "Units", "Revenue", "Net Profit", "Returns", "Ret. Rate"], productRows, [4100, 2000, 1200, 2100, 2100, 1200, 1400], {
      align: ["l", "l", "r", "r", "r", "r", "r"], banded: true, headerAlign: ["l", "l", "r", "r", "r", "r", "r"],
    }),
    docxHeading2("Best selling products"),
    docxTable(["Product Name", "Brand", "Model", "Units", "Revenue", "Profit"], bestRows, [3800, 2100, 2200, 1300, 2300, 2300], {
      align: ["l", "l", "l", "r", "r", "r"], banded: true, headerAlign: ["l", "l", "l", "r", "r", "r"],
    }),
    docxHeading2("Returned products"),
    docxTable(["Product Name", "Return Count", "Return Rate"], returnedRows, [6500, 3000, 3000], { align: ["l", "r", "r"], banded: true, headerAlign: ["l", "r", "r"] }),
    docxHeading2("Monthly trends"),
    docxTable(["Month", "Units", "Revenue", "Net Profit", "Returns"], monthlyRows, [3600, 1900, 2800, 2800, 1800], {
      align: ["l", "r", "r", "r", "r"], banded: true, headerAlign: ["l", "r", "r", "r", "r"],
    }),
  ].join("\n");
}

function docxWarrantyTracking(n) {
  const total = n.warrantyTotals.active + n.warrantyTotals.expired + n.warrantyTotals.voided + n.warrantyTotals.noWarranty + n.warrantyTotals.pending;
  const distribution = [
    ["Active", n.warrantyTotals.active, "Registered & active warranties"],
    ["Expired", n.warrantyTotals.expired, "Period-expired warranties"],
    ["Voided", n.warrantyTotals.voided, "Voided due to return / replacement"],
    ["No warranty / unlinked", n.warrantyTotals.noWarranty, "Unregistered / OTC sold items"],
    ["Pending activation", n.warrantyTotals.pending, "Awaiting customer activation"],
  ].map(([status, count, detail]) => [status, count, detail, `${total ? ((count / total) * 100).toFixed(1) : "0.0"}%`]);
  const warrantyRows = n.warrantyDetails.length
    ? n.warrantyDetails.map((warranty) => [
        warranty.productName || "—", warranty.code || "—", dateOnly(warranty.activatedAt), dateOnly(warranty.warrantyExpiresAt), warrantyStatusLabel(warranty.status),
      ])
    : [["No activated warranties in this period", "", "", "", ""]];
  return [
    docxSectionIntro("03", "Warranty Tracking", `A complete view of the warranty register and status distribution for ${n.period}.`),
    docxHeading2("Warranty distribution breakdown"),
    docxTable(["Warranty status", "Count", "System category", "Share of total"], distribution, [2800, 1600, 6000, 2500], {
      align: ["l", "r", "l", "r"], banded: true, headerAlign: ["l", "r", "l", "r"],
    }),
    docxHeading2("Warranty Tracking List"),
    docxTable(["Product Name", "QR Code", "Activation", "Expiration", "Status"], warrantyRows, [3700, 3600, 2300, 2300, 2000], {
      align: ["l", "l", "r", "r", "l"], banded: true, headerAlign: ["l", "l", "r", "r", "l"], bodySize: 15,
    }),
  ].join("\n");
}

function docxSalesRecords(n) {
  const rows = n.activitySales.length
    ? n.activitySales.map((sale) => [
        sale.productName || "—", sale.productModel || "—", sale.customerName || "Walk-in", sale.customerPhone || "—",
        `BDT ${moneyValue(sale.actualPrice)}`, `BDT ${moneyValue(sale.costPrice)}`, `BDT ${moneyValue(sale.profit)}`, `${dateTimeText(sale.returnedAt || sale.saleDate)} (${saleStatusLabel(sale.status || (sale.returnedAt ? "returned" : "sold"))})`,
      ])
    : [["No sales recorded in this period", "", "", "", "", "", "", ""]];
  return [
    docxSectionIntro("04", "Sales & Activation Records", `Transaction-level sale and customer activation details for ${n.period}.`),
    docxTable(["Product Name", "Model", "Customer", "Phone", "Sale Price", "Cost", "Profit", "Event Date / Status"], rows, [3000, 1800, 2100, 1900, 1700, 1700, 1700, 2200], {
      align: ["l", "l", "l", "l", "r", "r", "r", "r"], banded: true,
      headerAlign: ["l", "l", "l", "l", "r", "r", "r", "r"], bodySize: 14,
    }),
  ].join("\n");
}

function docxCustomerBlock(n, { heading = true } = {}) {
  const blocks = [];
  if (heading) blocks.push(docxHeading1("Customer Purchase Details"));
  blocks.push(docxPara(n.period, { size: 18, color: DOCX_MUTED, after: 120 }));
  blocks.push(docxPara(`Shop: ${n.shopName}`, { size: 18, color: DOCX_MUTED, after: 160 }));

  blocks.push(docxHeading2("Registered Customer Phone Numbers"));
  {
    const widths = [800, 2400, 2200, 3000, 1400];
    const headers = ["#", "Customer Name", "Phone Number", "Address", "Purchases"];
    const rows = n.phones.length
      ? n.phones.map((p) => [p.index, p.name || "—", p.phone, p.address || "—", p.purchases])
      : [["—", "No customer phone numbers recorded", "", "", ""]];
    blocks.push(docxTable(headers, rows, widths, { align: ["l", "l", "l", "l", "l"], maxWidth: 10000 }));
    blocks.push(docxPara(`Total customers with phone numbers: ${n.phones.length}`, { bold: true, size: 18, before: 200 }));
  }

  blocks.push(docxHeading2("Customer Purchase Breakdown (ranked by value)"));
  {
    const widths = [700, 2000, 1700, 2400, 1100, 1600, 1600];
    const headers = ["Rank", "Customer Name", "Phone", "Address", "Purchases", "Total Spent", "Total Profit"];
    const rows = n.customers.length
      ? n.customers.map((c, i) => [
          i + 1,
          c.name || "Unnamed customer",
          c.phone || "—",
          c.address || "—",
          c.purchases,
          `BDT ${moneyValue(c.revenue)}`,
          `BDT ${moneyValue(c.profit)}`,
        ])
      : [["—", "No customer purchase data", "", "", "", "", ""]];
    blocks.push(docxTable(headers, rows, widths, { align: ["l", "l", "l", "l", "r", "r", "r"], maxWidth: 10000 }));
  }

  blocks.push(docxHeading2("Products Each Customer Bought"));
  {
    const widths = [600, 1700, 1500, 2300, 1700, 1100, 1100];
    const headers = ["Rank", "Customer Name", "Phone", "Product", "Model", "Qty", "Revenue"];
    const rows = n.customers.length
      ? n.customers.flatMap((c, i) => {
          const details = c.details.length
            ? c.details
            : [{ productName: "—", productModel: "—", purchases: c.purchases, revenue: c.revenue }];
          return details.map((d, di) => [
            di === 0 ? i + 1 : "",
            di === 0 ? (c.name || "Unnamed customer") : "",
            di === 0 ? (c.phone || "—") : "",
            d.productName || "—",
            d.productModel || "—",
            d.purchases,
            `BDT ${moneyValue(d.revenue)}`,
          ]);
        })
      : [["—", "No customer purchase data", "", "", "", "", ""]];
    blocks.push(docxTable(headers, rows, widths, { align: ["l", "l", "l", "l", "l", "r", "r"], maxWidth: 10000 }));
  }

  return blocks.join("\n");
}

function docxAnalyticsBlock(n, { pageBreakBefore = false, includeStats = true } = {}) {
  const blocks = [];
  if (pageBreakBefore) blocks.push(docxPageBreak());

  // Key business statistics
  if (includeStats) {
    blocks.push(docxHeading2("Key Business Statistics"));
    const widths = [2800, 1600, 2800, 1600];
    const headers = ["Metric", "Value", "Metric", "Value"];
    const metrics = keyBusinessMetrics(n);
    const stats = Array.from({ length: Math.ceil(metrics.length / 2) }, (_, index) => {
      const left = metrics[index * 2];
      const right = metrics[index * 2 + 1];
      return [
        left.label,
        displayMetricValue(left, { currency: true }),
        right?.label || "",
        right ? displayMetricValue(right, { currency: true }) : "",
      ];
    });
    blocks.push(docxTable(headers, stats, widths, { align: ["l", "r", "l", "r"] }));
  }

  // Product-wise sales
  blocks.push(docxHeading2("Product-wise Sales & Profit"));
  {
    const widths = [3200, 1200, 1100, 1800, 1800, 1100, 900];
    const headers = ["Product Name", "Brand", "Units", "Revenue", "Net Profit", "Returns", "Ret. Rate"];
    const rows = n.products.filter((p) => p.units || p.returns).map((p) => [
      p.productName || "—",
      p.brandName || "—",
      p.units,
      `BDT ${moneyValue(p.revenue)}`,
      `BDT ${moneyValue(p.profit)}`,
      p.returns,
      `${p.returnRate}%`,
    ]);
    blocks.push(
      docxTable(headers, rows.length ? rows : [["No sales recorded in this period", "", "", "", "", "", ""]], widths, {
        align: ["l", "l", "r", "r", "r", "r", "r"],
      }),
    );
  }

  // Best sellers
  blocks.push(docxHeading2("Best Selling Products"));
  {
    const widths = [3200, 1600, 1600, 1200, 1800, 1800];
    const headers = ["Product Name", "Brand", "Model", "Units", "Revenue", "Profit"];
    const rows = n.bestSellers.length
      ? n.bestSellers.map((p) => [p.productName || "—", p.brandName || "—", p.model || "—", p.units, `BDT ${moneyValue(p.revenue)}`, `BDT ${moneyValue(p.profit)}`])
      : [["No best sellers in this period", "", "", "", "", ""]];
    blocks.push(docxTable(headers, rows, widths, { align: ["l", "l", "l", "r", "r", "r"] }));
  }

  // Returned products
  blocks.push(docxHeading2("Returned Products"));
  {
    const widths = [3800, 1400, 1400];
    const headers = ["Product Name", "Return Count", "Return Rate"];
    const rows = n.returnRows.length
      ? n.returnRows.map((p) => [p.productName || "—", p.returns, `${p.returnRate}%`])
      : [["No returns recorded in this period", "", ""]];
    blocks.push(docxTable(headers, rows, widths, { align: ["l", "r", "r"] }));
  }

  // Warranty tracking
  blocks.push(docxHeading2("Warranty Tracking List"));
  {
    const widths = [3000, 2000, 2200, 2200, 1600];
    const headers = ["Product Name", "QR Code", "Activation", "Expiration", "Status"];
    const rows = n.warrantyDetails.length
      ? n.warrantyDetails.map((w) => [
          w.productName || "—",
          w.code || "—",
          dateOnly(w.activatedAt),
          dateOnly(w.warrantyExpiresAt),
          warrantyStatusLabel(w.status),
        ])
      : [["No activated warranties in this period", "", "", "", ""]];
    blocks.push(docxTable(headers, rows, widths, { align: ["l", "l", "l", "l", "l"] }));
  }

  // Monthly trends
  if (n.monthly.length) {
    blocks.push(docxHeading2("Monthly Trends"));
    const widths = [2600, 1400, 1800, 1800, 1400];
    const headers = ["Month", "Units", "Revenue", "Net Profit", "Returns"];
    const rows = n.monthly.map((m) => [
      m.label || "—",
      m.units,
      `BDT ${moneyValue(m.revenue)}`,
      `BDT ${moneyValue(m.profit)}`,
      m.returns,
    ]);
    blocks.push(docxTable(headers, rows, widths, { align: ["l", "r", "r", "r", "r"] }));
  }

  // Sales activity
  blocks.push(docxHeading2("Sales & Activation Records"));
  {
    const widths = [2600, 1400, 1800, 1600, 1600, 1600, 1600, 1800];
    const headers = ["Product Name", "Model", "Customer", "Phone", "Sale Price", "Cost", "Profit", "Event Date / Status"];
    const rows = n.activitySales.length
      ? n.activitySales.map((s) => [
          s.productName || "—",
          s.productModel || "—",
          s.customerName || "Walk-in",
          s.customerPhone || "—",
          `BDT ${moneyValue(s.actualPrice)}`,
          `BDT ${moneyValue(s.costPrice)}`,
          `BDT ${moneyValue(s.profit)}`,
          `${dateTimeText(s.returnedAt || s.saleDate)} (${saleStatusLabel(s.status || (s.returnedAt ? "returned" : "sold"))})`,
        ])
      : [["No sales recorded in this period", "", "", "", "", "", "", ""]];
    blocks.push(docxTable(headers, rows, widths, { align: ["l", "l", "l", "l", "r", "r", "r", "l"] }));
  }

  return blocks.join("\n");
}

function docxPackageXml(n, documentXml) {
  const nowIso = new Date().toISOString();
  const zip = new JSZip();
  zip.file("docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>WarQ Sales &amp; Warranty Report</dc:title><dc:creator>WarQ</dc:creator><dc:subject>${xmlEscape(n.period)}</dc:subject><dcterms:created xsi:type="dcterms:W3CDTF">${nowIso}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${nowIso}</dcterms:modified></cp:coreProperties>`);
  zip.file("docProps/app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>WarQ Smart Warranty System</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop><Company>WarQ</Company><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>16.0300</AppVersion></Properties>`);
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
  zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>`);
  zip.file("word/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${DOCX_FONT}" w:hAnsi="${DOCX_FONT}" w:eastAsia="${DOCX_FONT}" w:cs="${DOCX_FONT}"/><w:lang w:val="en-US" w:eastAsia="bn-BD" w:bidi="bn-BD"/><w:color w:val="${DOCX_INK}"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="${DOCX_FONT}" w:hAnsi="${DOCX_FONT}" w:eastAsia="${DOCX_FONT}" w:cs="${DOCX_FONT}"/><w:lang w:val="en-US" w:eastAsia="bn-BD" w:bidi="bn-BD"/><w:color w:val="${DOCX_INK}"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style></w:styles>`);
  zip.file("word/header1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="left"/><w:spacing w:after="0"/></w:pPr><w:r><w:rPr>${docxRunProperties({ bold: true, size: 16, color: DOCX_TEAL })}</w:rPr><w:t>WARQ</w:t></w:r><w:r><w:rPr>${docxRunProperties({ bold: true, size: 16, color: DOCX_MUTED })}</w:rPr><w:t>  SALES &amp; WARRANTY REPORT</w:t></w:r></w:p></w:hdr>`);
  zip.file("word/footer1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="0"/></w:pPr><w:r><w:rPr>${docxRunProperties({ size: 16, color: DOCX_MUTED })}</w:rPr><w:t>${xmlEscape(n.period)}  |  Page </w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr>${docxRunProperties({ size: 16, color: DOCX_MUTED })}</w:rPr><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r><w:r><w:rPr>${docxRunProperties({ size: 16, color: DOCX_MUTED })}</w:rPr><w:t> of </w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> NUMPAGES </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr>${docxRunProperties({ size: 16, color: DOCX_MUTED })}</w:rPr><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`);
  zip.file("word/document.xml", documentXml);

  return zip;
}

async function docxExport(report) {
  const n = normalizeReport(report);
  const documentXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    "  <w:body>",
    docxCover(n),
    docxSectionBreak({ landscape: false }),
    docxExecutivePerformance(n),
    docxSectionBreak({ landscape: true }),
    docxProductPerformance(n),
    docxSectionBreak({ landscape: true }),
    docxWarrantyTracking(n),
    docxSectionBreak({ landscape: true }),
    docxSalesRecords(n),
    docxSectionBreak({ landscape: true }),
    docxSectionIntro("05", "Customer Purchase Details", `Registered customer details and itemized purchase records for ${n.period}.`),
    docxCustomerBlock(n, { heading: false }),
    docxSectionProperties({ landscape: false }),
    "  </w:body>",
    "</w:document>",
  ].join("\n");

  const zip = docxPackageXml(n, documentXml);
  const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  return blob;
}

async function docxAnalyticsOnly(report) {
  const n = normalizeReport(report);
  const documentXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    "  <w:body>",
    docxHeading1("WarQ Full Analytics Report"),
    docxPara(n.shopName, { size: 22, color: DOCX_NAVY, bold: true, after: 60 }),
    docxPara(n.period, { size: 18, color: DOCX_MUTED, after: 40 }),
    docxPara(`Report generated on ${dateTimeText(n.generatedAt)}`, { size: 16, color: DOCX_MUTED, after: 200 }),
    docxAnalyticsBlock(n, { pageBreakBefore: false }),
    docxSectionProperties({ landscape: true }),
    "  </w:body>",
    "</w:document>",
  ].join("\n");

  const zip = docxPackageXml(n, documentXml);
  const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  return blob;
}

async function docxCustomerOnly(report) {
  const n = normalizeReport(report);
  const documentXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    "  <w:body>",
    docxHeading1("WarQ Customer Purchase Details"),
    docxPara(n.shopName, { size: 22, color: DOCX_NAVY, bold: true, after: 60 }),
    docxPara(n.period, { size: 18, color: DOCX_MUTED, after: 40 }),
    docxPara(`Report generated on ${dateTimeText(n.generatedAt)}`, { size: 16, color: DOCX_MUTED, after: 200 }),
    docxCustomerBlock(n, { heading: true }),
    docxSectionProperties({ landscape: true }),
    "  </w:body>",
    "</w:document>",
  ].join("\n");

  const zip = docxPackageXml(n, documentXml);
  const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  return blob;
}

/* ==========================================================================
   Public entry points
   ========================================================================== */

function withLabel(report) {
  return {
    ...report,
    label: String(report?.label || report?.period || "Complete history (All Time)"),
    period: String(report?.label || report?.period || "Complete history (All Time)"),
  };
}

async function buildBlob({ scope, format, report }) {
  const named = withLabel(report);
  if (format === "excel") {
    if (scope === "analytics") return excelAnalyticsOnly(named);
    if (scope === "customers") return excelCustomerOnly(named);
    return excelFullReport(named);
  }
  if (format === "docx") {
    if (scope === "analytics") return docxAnalyticsOnly(named);
    if (scope === "customers") return docxCustomerOnly(named);
    return docxExport(named);
  }
  if (format === "csv") {
    return csvExport(named, { scope });
  }
  throw new Error(`Unsupported format: ${format}`);
}

export async function buildProfessionalExportBlob({ format = "excel", report = {} }) {
  const named = withLabel(report);
  if (format === "pdf") {
    const { buildPdfReport } = await import("./demo/pdf.js");
    return buildPdfReport(professionalExcelPayload(named));
  }
  if (format === "excel" || format === "docx" || format === "csv") {
    return buildBlob({ scope: "complete", format, report: named });
  }
  throw new Error(`Unsupported export format: ${format}`);
}

export async function exportProfessionalCompleteReport({ format = "excel", report = {} }) {
  const base = `${safeFileName(report.shopName)}_Complete_Report_${dateStamp()}_${uniqueExportId()}`;
  const ext = format === "excel" ? "xlsx" : format === "docx" ? "docx" : format === "pdf" ? "pdf" : format === "csv" ? "csv" : null;
  const fileName = (format === "excel" || format === "docx" || format === "pdf") ? `${base}_Professional.${ext}` : `${base}.${ext}`;
  try {
    if (!ext) {
      alert("Unsupported export format.");
      return;
    }
    await saveGeneratedExport(fileName, async () => buildProfessionalExportBlob({ format, report }));
  } catch (err) {
    console.error("Complete report export failed:", err);
    alert(`Could not generate ${format.toUpperCase()} export: ${err?.message || "unknown error"}`);
  }
}
