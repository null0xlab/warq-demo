import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";
import { BASE_PATH } from "./config.js";

const pageWidth = 841.89;
const pageHeight = 595.28;
const margin = 32;
const usableWidth = pageWidth - margin * 2;
const navy = rgb(0.055, 0.12, 0.22);
const teal = rgb(0.08, 0.5, 0.44);
const muted = rgb(0.35, 0.41, 0.49);
const rule = rgb(0.83, 0.87, 0.91);
const light = rgb(0.95, 0.97, 0.98);
const BENGALI_RE = /[\u0980-\u09FF]/;

let fontBytesPromise = null;

async function loadFontBytes() {
  if (!fontBytesPromise) {
    const load = async (name) => {
      const response = await fetch(`${BASE_PATH}fonts/${name}.ttf`);
      if (!response.ok) throw new Error(`Could not load report font ${name}.ttf.`);
      return new Uint8Array(await response.arrayBuffer());
    };
    fontBytesPromise = Promise.all([
      load("NotoSans-Regular"),
      load("NotoSans-Bold"),
      load("NotoSansBengali-Regular"),
      load("NotoSansBengali-Bold"),
    ]).catch((error) => {
      fontBytesPromise = null;
      throw error;
    });
  }
  return fontBytesPromise;
}

const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const text = (value, fallback = "—") => (value === null || value === undefined || value === "" ? fallback : String(value));
const rows = (value) => (Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : []);
const money = (value) => `BDT ${new Intl.NumberFormat("en-BD", { maximumFractionDigits: 2 }).format(number(value))}`;
const pct = (value) => `${number(value).toFixed(1)}%`;

function dateText(value, withTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-BD", withTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" }).format(date);
}

function saleStatus(value, returnedAt) {
  const status = String(value || (returnedAt ? "returned" : "sold")).trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (status === "returned" || status === "voided") return "Returned";
  if (status === "sold" || status === "activated") return "Sold";
  return status ? status.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase()) : "Sold";
}

function warrantyStatus(value) {
  const status = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return ({
    active: "Active",
    expired: "Expired",
    voided: "Voided",
    no_warranty: "No warranty",
    pending_activation: "Pending activation",
  })[status] || text(value);
}

function fitWidths(widths) {
  const total = widths.reduce((sum, value) => sum + value, 0);
  return total <= usableWidth ? widths : widths.map((value) => (value * usableWidth) / total);
}

function scriptRuns(value) {
  const source = text(value);
  if (!source) return [{ text: "", bengali: false }];
  const runs = [];
  let current = "";
  let bengali = BENGALI_RE.test(source[0]);
  for (const char of source) {
    const next = BENGALI_RE.test(char);
    if (char === " " || next === bengali) {
      current += char;
      continue;
    }
    if (current) runs.push({ text: current, bengali });
    current = char;
    bengali = next;
  }
  if (current) runs.push({ text: current, bengali });
  return runs.length ? runs : [{ text: source, bengali: false }];
}

function pickFont(fonts, bold, bengali) {
  if (bengali) return bold ? fonts.bnBold : fonts.bnRegular;
  return bold ? fonts.latinBold : fonts.latinRegular;
}

function widthOf(value, fonts, size, bold = false) {
  return scriptRuns(value).reduce((sum, run) => sum + pickFont(fonts, bold, run.bengali).widthOfTextAtSize(run.text, size), 0);
}

function wrap(value, fonts, size, width, bold = false) {
  const source = text(value);
  const tokens = source.split(/(\s+)/).filter((token) => token.length);
  if (!tokens.length) return [""];
  const output = [];
  let line = "";
  const push = () => {
    if (line) output.push(line);
    line = "";
  };
  for (const token of tokens) {
    if (/^\s+$/.test(token)) {
      if (line) line += token;
      continue;
    }
    let remaining = token;
    while (remaining) {
      const candidate = line ? `${line}${remaining}` : remaining;
      if (widthOf(candidate, fonts, size, bold) <= width) {
        line = candidate;
        remaining = "";
        break;
      }
      if (line) {
        push();
        continue;
      }
      let end = remaining.length - 1;
      while (end > 1 && widthOf(remaining.slice(0, end), fonts, size, bold) > width) end -= 1;
      output.push(remaining.slice(0, end));
      remaining = remaining.slice(end);
    }
  }
  push();
  return output.length ? output : [""];
}

function drawMixed(page, value, { x, y, size, fonts, bold = false, color = navy, align = "left", maxWidth = null }) {
  const source = text(value);
  const totalWidth = widthOf(source, fonts, size, bold);
  let cursor = align === "right" && maxWidth != null ? x + maxWidth - totalWidth : x;
  for (const run of scriptRuns(source)) {
    const font = pickFont(fonts, bold, run.bengali);
    page.drawText(run.text, { x: cursor, y, size, font, color });
    cursor += font.widthOfTextAtSize(run.text, size);
  }
  return totalWidth;
}

export async function buildPdfReport(report = {}) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fontBytes = await loadFontBytes();
  const [latinRegular, latinBold, bnRegular, bnBold] = await Promise.all([
    pdf.embedFont(fontBytes[0], { subset: true }),
    pdf.embedFont(fontBytes[1], { subset: true }),
    pdf.embedFont(fontBytes[2], { subset: true }),
    pdf.embedFont(fontBytes[3], { subset: true }),
  ]);
  const fonts = { latinRegular, latinBold, bnRegular, bnBold };

  const shopName = text(report.shopName, "WarQ Merchant");
  const period = text(report.label || report.period, "Complete history (All Time)");
  const generatedAt = report.generatedAt || new Date().toISOString();
  const totals = report.totals || {};
  const warranties = report.warrantyTotals || {};
  const products = rows(report.products);
  const sales = rows(report.activitySales);
  const customers = rows(report.customerPurchases);
  const warrantiesList = rows(report.warrantyDetails);
  const pageTitles = [];

  let page;
  let y;
  const footer = (current, total) => {
    current.drawLine({ start: { x: margin, y: 23 }, end: { x: pageWidth - margin, y: 23 }, thickness: 0.5, color: rule });
    drawMixed(current, `${period}  |  Generated ${dateText(generatedAt, true)}`, {
      x: margin, y: 11, size: 6.7, fonts, color: muted,
    });
    const pageText = `Page ${total}`;
    drawMixed(current, pageText, {
      x: pageWidth - margin - widthOf(pageText, fonts, 6.7), y: 11, size: 6.7, fonts, color: muted,
    });
  };
  const startPage = (section, continued = false) => {
    page = pdf.addPage([pageWidth, pageHeight]);
    pageTitles.push(section);
    page.drawRectangle({ x: 0, y: pageHeight - 46, width: pageWidth, height: 46, color: navy });
    drawMixed(page, "WARQ  /  SALES & WARRANTY REPORT", {
      x: margin, y: pageHeight - 21, size: 8, fonts, bold: true, color: rgb(0.85, 0.93, 0.93),
    });
    const title = continued ? `${section} (continued)` : section;
    drawMixed(page, title, {
      x: margin, y: pageHeight - 39, size: 13, fonts, bold: true, color: rgb(1, 1, 1),
    });
    y = pageHeight - 66;
  };
  const drawTable = (section, headers, data, widths, options = {}) => {
    const fitted = fitWidths(widths);
    const size = options.size || 6.5;
    const headerHeight = 16;
    const rowPadding = 3.5;
    const start = () => {
      startPage(section, pageTitles.includes(section));
      let x = margin;
      headers.forEach((header, index) => {
        page.drawRectangle({ x, y: y - headerHeight, width: fitted[index], height: headerHeight, color: teal });
        drawMixed(page, header, {
          x: x + 3, y: y - 10.5, size: 6.1, fonts, bold: true, color: rgb(1, 1, 1),
        });
        x += fitted[index];
      });
      y -= headerHeight;
    };
    start();
    const displayRows = data.length
      ? data
      : [Array(headers.length).fill("").map((_, index) => (index === 0 ? "No records for this reporting period." : ""))];
    displayRows.forEach((record, rowIndex) => {
      const cells = headers.map((_, index) => wrap(record[index], fonts, size, fitted[index] - 6));
      const rowHeight = Math.max(14, ...cells.map((lines) => lines.length * (size + 1.5) + rowPadding * 2));
      if (y - rowHeight < 34) start();
      if (rowIndex % 2) {
        page.drawRectangle({
          x: margin,
          y: y - rowHeight,
          width: fitted.reduce((sum, value) => sum + value, 0),
          height: rowHeight,
          color: light,
        });
      }
      let x = margin;
      cells.forEach((lines, index) => {
        let cellY = y - rowPadding - size;
        lines.forEach((line) => {
          const right = options.right?.includes(index);
          drawMixed(page, line, {
            x: right ? x : x + 3,
            y: cellY,
            size,
            fonts,
            color: navy,
            align: right ? "right" : "left",
            maxWidth: right ? fitted[index] - 3 : null,
          });
          cellY -= size + 1.5;
        });
        x += fitted[index];
      });
      page.drawLine({
        start: { x: margin, y: y - rowHeight },
        end: { x: margin + fitted.reduce((sum, value) => sum + value, 0), y: y - rowHeight },
        thickness: 0.35,
        color: rule,
      });
      y -= rowHeight;
    });
    y -= 12;
  };

  startPage("Executive Summary");
  drawMixed(page, "Sales & Warranty Report", {
    x: margin, y: y - 11, size: 24, fonts, bold: true, color: navy,
  });
  y -= 43;
  drawMixed(page, shopName, { x: margin, y, size: 14, fonts, bold: true, color: teal });
  y -= 17;
  drawMixed(page, period, { x: margin, y, size: 9, fonts, color: muted });
  y -= 31;

  const summary = [
    ["Net units sold", text(totals.units, "0"), "Net revenue", money(totals.revenue)],
    ["Net cost", money(totals.cost), "Net profit", money(totals.profit)],
    ["Gross units incl. returns", text(totals.grossUnits ?? totals.units, "0"), "Returns recorded", text(totals.returns, "0")],
    ["Return rate", pct(totals.returnRate), "Unique products sold", text(totals.uniqueProductsSold, "0")],
    ["Active warranties", text(warranties.active, "0"), "Expired warranties", text(warranties.expired, "0")],
    ["Voided warranties", text(warranties.voided, "0"), "No warranty / unlinked", text(warranties.noWarranty, "0")],
    ["Pending activation", text(warranties.pending, "0"), "Customer purchase records", text(customers.length, "0")],
  ];
  drawTable("Executive Summary", ["Metric", "Value", "Metric", "Value"], summary, [210, 160, 210, 160], { right: [1, 3], size: 7.2 });

  drawTable(
    "Product Performance",
    ["Product", "Brand", "Model", "Net Units", "Gross", "Revenue", "Cost", "Net Profit", "Returns", "Return Rate"],
    products.map((item) => [
      text(item.productName), text(item.brandName), text(item.productModel), text(item.units, "0"),
      text(item.grossUnits ?? item.units, "0"), money(item.revenue), money(item.cost), money(item.profit),
      text(item.returns, "0"), pct(item.returnRate),
    ]),
    [105, 65, 62, 46, 42, 72, 68, 72, 45, 52],
    { right: [3, 4, 5, 6, 7, 8, 9] },
  );

  drawTable(
    "Best Selling Products",
    ["Product", "Brand", "Model", "Units", "Revenue", "Net Profit"],
    rows(report.bestSellers).map((item) => [
      text(item.productName), text(item.brandName), text(item.productModel),
      text(item.units, "0"), money(item.revenue), money(item.profit),
    ]),
    [220, 130, 120, 70, 120, 120],
    { right: [3, 4, 5], size: 7 },
  );
  drawTable(
    "Returned Products",
    ["Product", "Brand", "Returns", "Return Rate"],
    rows(report.returnRows).map((item) => [
      text(item.productName), text(item.brandName), text(item.returns, "0"), pct(item.returnRate),
    ]),
    [300, 200, 110, 110],
    { right: [2, 3], size: 7 },
  );
  drawTable(
    "Warranty Register",
    ["Product", "QR / Item Code", "Activation", "Expiration", "Status"],
    warrantiesList.map((item) => [
      text(item.productName), text(item.code), dateText(item.activatedAt),
      dateText(item.warrantyExpiresAt), warrantyStatus(item.status),
    ]),
    [240, 180, 115, 115, 110],
    { size: 6.8 },
  );
  drawTable(
    "Monthly Trends",
    ["Month", "Net Units", "Revenue", "Cost", "Net Profit", "Returns"],
    rows(report.monthly).map((item) => [
      text(item.label), text(item.units, "0"), money(item.revenue), money(item.cost),
      money(item.profit), text(item.returns, "0"),
    ]),
    [240, 100, 125, 125, 125, 80],
    { right: [1, 2, 3, 4, 5], size: 7 },
  );
  drawTable(
    "Sales & Activation Records",
    ["Product", "Brand", "Model", "QR / Code", "Customer", "Price", "Cost", "Profit", "Event Date", "Status"],
    sales.map((item) => [
      text(item.productName), text(item.brandName), text(item.productModel), text(item.code || item.qrId),
      text(item.customerName, "Walk-in"), money(item.actualPrice ?? item.defaultPrice), money(item.costPrice),
      money(item.profit), dateText(item.returnedAt || item.saleDate || item.soldAt || item.activatedAt, true),
      saleStatus(item.status, item.returnedAt),
    ]),
    [92, 55, 54, 75, 74, 55, 55, 55, 110, 60],
    { right: [5, 6, 7], size: 5.9 },
  );
  const netCount = sales.filter((item) => saleStatus(item.status, item.returnedAt) !== "Returned").length;
  drawTable("Sales Register Reconciliation", ["Measure", "Value"], [
    ["Activity records shown above", String(sales.length)],
    ["Completed sales included in net financial totals", String(netCount)],
    ["Net revenue (dashboard total)", money(totals.revenue)],
    ["Net cost (dashboard total)", money(totals.cost)],
    ["Net profit (dashboard total)", money(totals.profit)],
    ["Control note", "Returned records remain in the activity register for auditability and are excluded from net totals."],
  ], [270, 490], { size: 7 });
  drawTable(
    "Customer Purchase Details",
    ["Customer", "Phone", "Address", "Purchases", "Revenue", "Cost", "Net Profit"],
    customers.map((item) => [
      text(item.name), text(item.phone), text(item.address), text(item.purchases, "0"),
      money(item.revenue), money(item.cost), money(item.profit),
    ]),
    [140, 100, 170, 70, 100, 100, 100],
    { right: [3, 4, 5, 6], size: 6.5 },
  );
  const customerProducts = customers.flatMap((customer) => rows(customer.productDetails).map((detail) => [
    text(customer.name), text(customer.phone), text(detail.productName), text(detail.brandName),
    text(detail.productModel), text(detail.code), text(detail.purchases, "0"),
    money(detail.revenue), money(detail.cost), money(detail.profit),
  ]));
  drawTable(
    "Products Each Customer Bought",
    ["Customer", "Phone", "Product", "Brand", "Model", "QR / Code", "Qty", "Revenue", "Cost", "Net Profit"],
    customerProducts,
    [93, 78, 92, 60, 55, 80, 38, 67, 67, 67],
    { right: [6, 7, 8, 9], size: 5.9 },
  );

  pdf.setTitle(`WarQ Complete Report - ${shopName}`);
  pdf.setAuthor("WarQ");
  pdf.setSubject(`Sales and warranty report: ${period}`);
  pdf.setProducer("WarQ Report Export");
  const pages = pdf.getPages();
  pages.forEach((item, index) => footer(item, index + 1));
  const bytes = await pdf.save();
  return new Blob([bytes], { type: "application/pdf" });
}

export default buildPdfReport;
