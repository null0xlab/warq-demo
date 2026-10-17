function parseDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value);
  // Date inputs are calendar dates, not UTC instants. Parse them in local time
  // so a selected day never shifts when timezone offset is applied.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    const localDate = new Date(year, month - 1, day);
    return Number.isNaN(localDate.getTime()) ? null : localDate;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function round(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

export function startOfLocalDay(value) {
  const date = parseDate(value);
  if (!date) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

export function endOfLocalDay(value) {
  const date = parseDate(value);
  if (!date) return null;
  date.setHours(23, 59, 59, 999);
  return date;
}

export function dateInputValue(value) {
  const date = parseDate(value);
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function monthRange(year, monthIndex) {
  const start = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
  return { type: "month", year, month: monthIndex, start: start.toISOString(), end: end.toISOString() };
}

export function yearRange(year) {
  const start = new Date(year, 0, 1, 0, 0, 0, 0);
  const end = new Date(year, 11, 31, 23, 59, 59, 999);
  return { type: "year", year, start: start.toISOString(), end: end.toISOString() };
}

export function allTimeRange() {
  return { type: "all", start: null, end: null };
}

export function customRange(startDate, endDate) {
  let start = startOfLocalDay(startDate);
  let end = endOfLocalDay(endDate);
  if (!start || !end) return allTimeRange();
  if (end.getTime() < start.getTime()) {
    const temp = start;
    start = end;
    end = temp;
  }
  return { type: "custom", start: start.toISOString(), end: end.toISOString() };
}

export function defaultRange() {
  const now = new Date();
  return monthRange(now.getFullYear(), now.getMonth());
}

export function shiftMonth(range, delta) {
  const base = range?.type === "month"
    ? new Date(range.year, range.month, 1)
    : new Date();
  base.setMonth(base.getMonth() + delta);
  return monthRange(base.getFullYear(), base.getMonth());
}

export function rangeLabel(range) {
  if (!range || range.type === "all" || (!range.start && !range.end)) return "Complete history (All Time)";
  if (range.type === "month") {
    return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(range.year, range.month, 1));
  }
  if (range.type === "year") return `Year ${range.year}`;
  const start = parseDate(range.start);
  const end = parseDate(range.end);
  const format = (date) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
  if (start && end) return `${format(start)} – ${format(end)}`;
  return "Custom range";
}

export function inRange(value, range) {
  if (!range || range.type === "all" || (!range.start && !range.end)) return true;
  const date = parseDate(value);
  if (!date) return false;
  const time = date.getTime();
  const start = parseDate(range.start)?.getTime();
  const end = parseDate(range.end)?.getTime();
  if (Number.isFinite(start) && time < start) return false;
  if (Number.isFinite(end) && time > end) return false;
  return true;
}

export function saleEventDate(sale) {
  return sale?.saleDate || sale?.soldAt || sale?.activatedAt || sale?.activationDate || sale?.warrantyStartsAt || sale?.createdAt || null;
}

export function activationDate(record) {
  return record?.activatedAt || record?.activationDate || record?.warrantyStartsAt || saleEventDate(record);
}

export function isReturned(record) {
  return record?.status === "returned" || Boolean(record?.returnedAt);
}

export function warrantyDurationOf(record) {
  const duration = record?.warrantyDuration;
  if (duration && typeof duration === 'object') {
    const fields = ['months', 'days', 'hours', 'minutes', 'seconds'];
    if (fields.some((field) => Number(duration[field] || 0) > 0)) return duration;
  }
  if (Number(record?.warrantyMonths || 0) > 0) return { months: Number(record.warrantyMonths) };
  return null;
}

export function warrantyStatusOf(record) {
  const duration = warrantyDurationOf(record);
  if (isReturned(record)) return "voided";
  if (!duration) return "no_warranty";
  if (record.status !== "activated" && !record.activatedAt && !record.activationDate) return "pending_activation";
  if (!record.warrantyExpiresAt) {
    const act = activationDate(record);
    if (!act) return "pending_activation";
    const end = new Date(act);
    if (duration.months) end.setMonth(end.getMonth() + Number(duration.months));
    if (duration.days) end.setDate(end.getDate() + Number(duration.days));
    if (duration.hours) end.setHours(end.getHours() + Number(duration.hours));
    if (duration.minutes) end.setMinutes(end.getMinutes() + Number(duration.minutes));
    if (duration.seconds) end.setSeconds(end.getSeconds() + Number(duration.seconds));
    return end.getTime() > Date.now() ? "active" : "expired";
  }
  return new Date(record.warrantyExpiresAt).getTime() > Date.now() ? "active" : "expired";
}

export function productKey(item) {
  return `${item?.requestId || ""}:${item?.productId || item?.productName || "unknown"}`;
}

/**
 * Folder-scoped product identity.
 *
 * QR codes added to an existing folder are generated under a NEW request id,
 * so keying products by requestId split one real-world product into several
 * catalog entries. Keying by the folder (groupId, with the legacy computed
 * fallback) keeps every QR of the same product merged into a single product.
 * Must stay in sync with the server's productKeyOf() in getDashboard.
 */
export function qrGroupId(qr) {
  return String(
    qr?.groupId ||
      `${qr?.requestId}_${String(qr?.productId || qr?.productName || "").replace(/[^A-Za-z0-9_-]/g, "_")}`,
  );
}

export function qrProductKey(qr) {
  return `${qrGroupId(qr)}:${qr?.productId || qr?.productName || ""}`;
}

export function productLabel(item) {
  return item?.productName || item?.productModel || "Unnamed product";
}

export function revenueOf(sale) {
  return Number(sale?.actualPrice ?? sale?.defaultPrice ?? 0);
}

export function costOf(sale) {
  return Number(sale?.costPrice ?? 0);
}

export function profitOf(sale) {
  return round(revenueOf(sale) - costOf(sale));
}

function emptyProduct(item) {
  return {
    key: productKey(item),
    id: productKey(item),
    requestId: item?.requestId || null,
    productId: item?.productId || null,
    productName: productLabel(item),
    productModel: item?.productModel || "",
    brandName: item?.brandName || "",
    shopName: item?.shopName || "",
    defaultPrice: item?.defaultPrice ?? null,
    costPrice: item?.costPrice ?? null,
    warrantyDuration: warrantyDurationOf(item),
    units: 0,
    sold: 0,
    grossUnits: 0,
    revenue: 0,
    cost: 0,
    profit: 0,
    returns: 0,
    returnRate: 0,
    activeWarranties: 0,
    expiredWarranties: 0,
    voidedWarranties: 0,
    noWarranty: 0,
  };
}

function monthKeyFrom(value) {
  const date = parseDate(value);
  if (!date) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabelFromKey(key) {
  const [year, month] = String(key).split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

function finalizeProducts(map, cohortByProduct = null) {
  const rows = [...map.values()].map((item) => {
    const closed = Number(item.units || 0) + Number(item.returns || 0);
    item.returnRate = closed ? round((Number(item.returns || 0) / closed) * 100) : 0;
    if (cohortByProduct) {
      const cohort = cohortByProduct.get(item.key);
      if (cohort?.sales) {
        item.returnRate = round((cohort.returned / cohort.sales) * 100);
      }
    }
    item.sold = item.units;
    item.revenue = round(item.revenue);
    item.cost = round(item.cost || 0);
    item.profit = round(item.profit);
    return item;
  });
  rows.sort((a, b) => b.units - a.units || b.revenue - a.revenue || b.profit - a.profit || a.productName.localeCompare(b.productName));
  return rows;
}

function topBy(rows, field) {
  if (!rows.length) return [];
  let max = 0;
  for (const row of rows) {
    const value = Number(row[field] || 0);
    if (value > max) max = value;
  }
  if (max <= 0) return [];
  return rows.filter((row) => Number(row[field] || 0) === max);
}

/**
 * Customer Purchase Details.
 *
 * Scans (sales) carry the customer info collected on the scanner/activation
 * screens (customerName / customerPhone / customerAddress). Every activated or
 * returned sale that resolves to a product is grouped per customer (identified
 * by name and/or phone) so the report can show how many times a customer bought
 * each product and how much revenue + profit they generated.
 */
export function buildCustomerPurchaseRows(netSales = []) {
  const customerMap = new Map();

  const keyOf = (row) => {
    const name = String(row?.customerName || "").trim();
    const phone = String(row?.customerPhone || "");
    const address = String(row?.customerAddress || "").trim();
    if (!name && !phone && !address) return "";
    const part = phone || name;
    const norm = String(part).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (norm) return `p:${norm}`;
    return `n:${String(name).toLowerCase()}`;
  };

  netSales.forEach((sale) => {
    const key = keyOf(sale);
    if (!key) return;
    const productName = productLabel(sale);
    const productModel = sale?.productModel || "";
    const revenue = revenueOf(sale);
    const profit = profitOf(sale);
    const name = String(sale?.customerName || "").trim();
    const phone = String(sale?.customerPhone || "").trim();
    const address = String(sale?.customerAddress || "").trim();

    const customer = customerMap.get(key) || {
      key,
      name,
      phone,
      address,
      purchases: 0,
      revenue: 0,
      cost: 0,
      profit: 0,
      products: new Map(),
    };
    if (name && !customer.name) customer.name = name;
    if (phone && !customer.phone) customer.phone = phone;
    if (address && !customer.address) customer.address = address;
    customer.purchases += 1;
    customer.revenue = round(customer.revenue + revenue);
    customer.cost = round(customer.cost + costOf(sale));
    customer.profit = round(customer.profit + profit);

    const productMeta = `${productName || ""}::${productModel || ""}`;
    const metaKey = `${sale?.productId || ""}::${productMeta}`;
    const product = customer.products.get(metaKey) || {
      productName,
      productModel,
      brandName: String(sale?.brandName || ""),
      codes: new Set(),
      purchases: 0,
      revenue: 0,
      cost: 0,
      profit: 0,
    };
    if (!product.brandName && sale?.brandName) product.brandName = String(sale.brandName);
    const code = String(sale?.code || sale?.qrId || sale?.requestId || "").trim();
    if (code) product.codes.add(code);
    product.purchases += 1;
    product.revenue = round(product.revenue + revenue);
    product.cost = round(product.cost + costOf(sale));
    product.profit = round(product.profit + profit);
    customer.products.set(metaKey, product);
    customerMap.set(key, customer);
  });

  const rows = [...customerMap.values()].map((customer) => ({
    key: customer.key,
    name: customer.name,
    phone: customer.phone,
    address: customer.address,
    purchases: customer.purchases,
    revenue: round(customer.revenue),
    cost: round(customer.cost),
    profit: round(customer.profit),
    productDetails: [...customer.products.values()].map((p) => ({
      productName: p.productName,
      productModel: p.productModel,
      brandName: p.brandName,
      code: [...p.codes].join(" | "),
      purchases: p.purchases,
      revenue: round(p.revenue),
      cost: round(p.cost),
      profit: round(p.profit),
    })),
  }));

  rows.sort(
    (a, b) =>
      b.purchases - a.purchases ||
      b.revenue - a.revenue ||
      b.profit - a.profit ||
      String(a.name || a.phone).localeCompare(String(b.name || b.phone)),
  );

  return rows;
}

export function buildReport(sales = [], qrs = [], range = defaultRange()) {
  const safeSales = Array.isArray(sales) ? sales : [];
  const safeQrs = Array.isArray(qrs) ? qrs : [];
  // Sales resolve to their QR's folder-scoped product so codes added to the
  // same folder later report under one product instead of split request ids.
  const keyByQrId = new Map(safeQrs.map((qr) => [qr.id || qr.code, qrProductKey(qr)]));
  const saleKey = (sale) => (sale?.qrId ? keyByQrId.get(sale.qrId) : null) || productKey(sale);

  // 1. Sales filtered by selected period
  const soldInRange = safeSales.filter((sale) => inRange(saleEventDate(sale), range));
  const netSales = soldInRange.filter((sale) => !isReturned(sale));

  // 1b. Customer Purchase Details (grouped by customer from net sales)
  const customerPurchases = buildCustomerPurchaseRows(netSales);

  // 2. Returns filtered by selected period
  const returnedSales = safeSales.filter((sale) => isReturned(sale) && inRange(sale.returnedAt || saleEventDate(sale), range));

  // 3. Cohort tracking for return rates
  const cohortByProduct = new Map();
  soldInRange.forEach((sale) => {
    const key = saleKey(sale);
    const cohort = cohortByProduct.get(key) || { sales: 0, returned: 0 };
    cohort.sales += 1;
    if (isReturned(sale)) cohort.returned += 1;
    cohortByProduct.set(key, cohort);
  });

  // 4. Product-wise sales aggregation
  const salesMap = new Map();
  netSales.forEach((sale) => {
    const key = saleKey(sale);
    const item = salesMap.get(key) || emptyProduct(sale);
    item.units += 1;
    item.grossUnits += 1;
    item.revenue += revenueOf(sale);
    item.cost += costOf(sale);
    item.profit += profitOf(sale);
    salesMap.set(key, item);
  });

  // 5. Product-wise returns aggregation
  const returnMap = new Map();
  returnedSales.forEach((sale) => {
    const key = saleKey(sale);
    const item = returnMap.get(key) || emptyProduct(sale);
    item.returns += 1;
    returnMap.set(key, item);

    // Also update sales map returns
    const sold = salesMap.get(key) || emptyProduct(sale);
    sold.returns += 1;
    salesMap.set(key, sold);
  });

  const products = finalizeProducts(salesMap, cohortByProduct);
  const returnRows = finalizeProducts(returnMap, cohortByProduct).sort(
    (a, b) => b.returns - a.returns || b.returnRate - a.returnRate || a.productName.localeCompare(b.productName)
  );

  // 6. Totals calculation
  const totalRevenue = round(netSales.reduce((sum, sale) => sum + revenueOf(sale), 0));
  const totalCost = round(netSales.reduce((sum, sale) => sum + costOf(sale), 0));
  const totalProfit = round(netSales.reduce((sum, sale) => sum + profitOf(sale), 0));
  const cohortReturns = soldInRange.filter(isReturned).length;
  const returnRate = soldInRange.length ? round((cohortReturns / soldInRange.length) * 100) : (returnedSales.length ? 100 : 0);

  const totals = {
    units: netSales.length,
    grossUnits: soldInRange.length,
    revenue: totalRevenue,
    cost: totalCost,
    profit: totalProfit,
    returns: returnedSales.length,
    returnRate,
    returnRateBase: soldInRange.length,
    uniqueProductsSold: products.filter((item) => item.units > 0).length,
  };

  // 7. Warranties in range
  const warrantySource = safeQrs.filter((qr) => {
    const isAct = qr.status === "activated" || qr.status === "returned" || qr.activatedAt || qr.activationDate;
    if (!isAct) return false;
    return inRange(activationDate(qr), range);
  });

  const warrantyDetails = warrantySource
    .map((qr) => {
      const status = warrantyStatusOf(qr);
      return {
        id: qr.id || qr.code,
        code: qr.code,
        serial: qr.serial,
        productName: productLabel(qr),
        activatedAt: activationDate(qr),
        warrantyExpiresAt: qr.warrantyExpiresAt || null,
        returnedAt: qr.returnedAt || null,
        status,
        warrantyDuration: warrantyDurationOf(qr),
      };
    })
    .sort((a, b) => String(b.activatedAt || "").localeCompare(String(a.activatedAt || "")));

  const warrantyTotals = {
    active: warrantyDetails.filter((row) => row.status === "active").length,
    expired: warrantyDetails.filter((row) => row.status === "expired").length,
    voided: warrantyDetails.filter((row) => row.status === "voided").length,
    noWarranty: warrantyDetails.filter((row) => row.status === "no_warranty").length,
    pending: warrantyDetails.filter((row) => row.status === "pending_activation").length,
  };
  warrantyTotals.total = warrantyTotals.active + warrantyTotals.expired + warrantyTotals.voided;

  // 8. Month-by-month breakdown
  const monthMap = new Map();
  const touchMonth = (key) => {
    if (!key) return null;
    if (!monthMap.has(key)) {
      monthMap.set(key, {
        key,
        label: monthLabelFromKey(key),
        units: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
        returns: 0,
      });
    }
    return monthMap.get(key);
  };

  netSales.forEach((sale) => {
    const bucket = touchMonth(monthKeyFrom(saleEventDate(sale)));
    if (!bucket) return;
    bucket.units += 1;
    bucket.revenue = round(bucket.revenue + revenueOf(sale));
    bucket.cost = round(bucket.cost + costOf(sale));
    bucket.profit = round(bucket.profit + profitOf(sale));
  });

  returnedSales.forEach((sale) => {
    const bucket = touchMonth(monthKeyFrom(sale.returnedAt || saleEventDate(sale)));
    if (!bucket) return;
    bucket.returns += 1;
  });

  const monthly = [...monthMap.values()].sort((a, b) => b.key.localeCompare(a.key));

  // 9. Activity Feed / Sales in Range
  const activityMap = new Map();
  [...netSales, ...returnedSales].forEach((sale, index) => {
    const key = sale.id || sale.qrId || sale.code || `activity-${index}`;
    activityMap.set(key, sale);
  });
  const activitySales = [...activityMap.values()].sort((a, b) => {
    const left = new Date(a.returnedAt || saleEventDate(a) || 0).getTime();
    const right = new Date(b.returnedAt || saleEventDate(b) || 0).getTime();
    return right - left;
  });

  return {
    range,
    label: rangeLabel(range),
    generatedAt: new Date().toISOString(),
    totals,
    products,
    returnRows,
    bestSellers: topBy(products.filter((item) => item.units > 0), "units"),
    mostReturned: topBy(returnRows, "returns"),
    highestReturnRate: topBy(returnRows.filter((item) => item.returns > 0), "returnRate"),
    warrantyTotals,
    warrantyDetails,
    monthly,
    customerPurchases,
    soldInRange,
    netSales,
    returnedSales,
    activitySales,
  };
}
