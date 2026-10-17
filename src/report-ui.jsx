import React, { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BadgeCheck,
  Calendar,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock,
  FileSpreadsheet,
  FileText,
  Printer,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  TrendingUp,
  X,
} from "lucide-react";
import {
  allTimeRange,
  buildReport,
  customRange,
  dateInputValue,
  defaultRange,
  monthRange,
  rangeLabel,
  shiftMonth,
  yearRange,
} from "./report-analytics";
import {
  exportProfessionalCompleteReport,
} from "./report-exports";

const money = (value) =>
  new Intl.NumberFormat("en-BD", { maximumFractionDigits: 2 }).format(Number(value || 0));

const dateTime = (value) =>
  value
    ? new Intl.DateTimeFormat("en-BD", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : "—";

const WARRANTY_LABELS = {
  active: "Active",
  expired: "Expired",
  voided: "Voided",
  no_warranty: "No warranty",
  pending_activation: "Pending",
};

const WARRANTY_PILL = {
  active: "success",
  expired: "danger",
  voided: "warning",
  no_warranty: "neutral",
  pending_activation: "warning",
};

const WARRANTY_COLORS = ["#22c55e", "#f97316", "#ef4444", "#64748b"];

function names(list, fallback = "None") {
  if (!list?.length) return fallback;
  return list.map((item) => item.productName).join(", ");
}

function statusPill(status) {
  return (
    <span className={`pill ${WARRANTY_PILL[status] || "neutral"}`}>
      {WARRANTY_LABELS[status] || status}
    </span>
  );
}

export function PeriodToolbar({
  range,
  onChange,
  onOpenReport,
  printAction,
  onExportExcel,
  onExportDocx,
  onExportCsv,
  variant = "toolbar",
}) {
  const current = range || defaultRange();
  const now = new Date();
  const years = [];
  for (let year = now.getFullYear(); year >= now.getFullYear() - 8; year -= 1) years.push(year);
  const customStart = dateInputValue(current.start);
  const customEnd = dateInputValue(current.end);

  // The dashboard is intentionally a navigation surface. Downloads belong to
  // the full report, where the user can review the selected reporting period.
  const hasExportGroups = variant === "report" && Boolean(onExportExcel || onExportDocx || onExportCsv || printAction);

  return (
    <article className="panel period-toolbar no-print">
      <div className="period-toolbar-top">
        <div className="period-toolbar-title">
          <span className="period-calendar-icon">
            <Calendar size={18} />
          </span>
          <div>
            <p>ANALYTICS &amp; REPORTING PERIOD</p>
            <h2>{rangeLabel(current)}</h2>
          </div>
        </div>
        <div className="period-toolbar-actions">
          {variant !== "report" && printAction ? (
            <button type="button" className="primary-button period-print-btn" onClick={printAction}>
              <Printer size={15} /> Print / Download PDF
            </button>
          ) : onOpenReport && variant !== "report" ? (
            <button type="button" className="primary-button period-print-btn" onClick={() => onOpenReport()}>
              <FileText size={15} /> View Full Report
            </button>
          ) : null}
        </div>
      </div>

      {hasExportGroups ? (
        <div className="report-export-groups">
          <div className="report-export-group">
            <span className="report-export-group-label">Download report</span>
            <div className="report-export-group-actions">
              {printAction ? (
                <button type="button" className="secondary-button period-export-btn" onClick={printAction} title="Open the print dialog to print or save as PDF">
                  <Printer size={15} /> Print / Download PDF
                </button>
              ) : null}
              {onExportExcel ? (
                <button type="button" className="secondary-button period-export-btn" onClick={onExportExcel} title="Download the complete report as an Excel workbook">
                  <FileSpreadsheet size={15} /> Excel
                </button>
              ) : null}
              {onExportDocx ? (
                <button type="button" className="secondary-button period-export-btn" onClick={onExportDocx} title="Download the complete report as a Word document">
                  <FileText size={15} /> DOCX
                </button>
              ) : null}
              {onExportCsv ? (
                <button type="button" className="secondary-button period-export-btn" onClick={onExportCsv} title="Download the report data as CSV">
                  <FileSpreadsheet size={15} /> CSV
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="period-preset-row" role="tablist" aria-label="Report period">
        {[
          ["month", "This Month"],
          ["year", "Full Year"],
          ["all", "All Time"],
          ["custom", "Custom Range"],
        ].map(([type, label]) => (
          <button
            key={type}
            type="button"
            role="tab"
            aria-selected={current.type === type}
            className={`period-chip ${current.type === type ? "active" : ""}`}
            onClick={() => {
              if (type === "month") onChange(monthRange(now.getFullYear(), now.getMonth()));
              else if (type === "year") onChange(yearRange(now.getFullYear()));
              else if (type === "all") onChange(allTimeRange());
              else {
                const start = new Date(now.getFullYear(), now.getMonth(), 1);
                onChange(customRange(start, now));
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {current.type === "month" && (
        <div className="period-controls">
          <button
            type="button"
            className="period-nav-btn"
            onClick={() => onChange(shiftMonth(current, -1))}
            aria-label="Previous month"
            title="Previous month"
          >
            <ChevronLeft size={18} />
          </button>
          <label>
            Month
            <select
              value={current.month}
              onChange={(event) => onChange(monthRange(current.year, Number(event.target.value)))}
            >
              {Array.from({ length: 12 }, (_, index) => (
                <option key={index} value={index}>
                  {new Intl.DateTimeFormat("en-US", { month: "long" }).format(new Date(2000, index, 1))}
                </option>
              ))}
            </select>
          </label>
          <label>
            Year
            <select
              value={current.year}
              onChange={(event) => onChange(monthRange(Number(event.target.value), current.month))}
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="period-nav-btn"
            onClick={() => onChange(shiftMonth(current, 1))}
            aria-label="Next month"
            title="Next month"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}
      {current.type === "year" && (
        <div className="period-controls">
          <label>
            Year
            <select value={current.year} onChange={(event) => onChange(yearRange(Number(event.target.value)))}>
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {current.type === "custom" && (
        <div className="period-controls">
          <label>
            Start Date
            <input
              type="date"
              value={customStart}
              onChange={(event) => {
                const s = event.target.value;
                onChange(customRange(s, customEnd || s));
              }}
            />
          </label>
          <label>
            End Date
            <input
              type="date"
              value={customEnd}
              onChange={(event) => {
                const e = event.target.value;
                onChange(customRange(customStart || e, e));
              }}
            />
          </label>
        </div>
      )}
    </article>
  );
}

export function MiniStat({ label, value, note, Icon, tone = "green" }) {
  return (
    <article className={`analytics-stat ${tone}`}>
      <div className="analytics-stat-header">
        <span>{label}</span>
        {Icon ? (
          <span className="analytics-stat-icon">
            <Icon size={16} />
          </span>
        ) : null}
      </div>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
    </article>
  );
}

const CHART_METRICS = [
  ["units", "Units sold"],
  ["profit", "Profit"],
  ["revenue", "Revenue"],
  ["returns", "Returns"],
];

const CHART_COLORS = { units: "#10b981", profit: "#8b5cf6", revenue: "#3b82f6", returns: "#f97316" };

const CHART_LIMITS = [8, 12, 20, 30];

function useDebouncedValue(value, delay = 200) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function truncateLabel(value, max = 14) {
  const text = String(value || "").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function PerformanceChart({ rows, rangeLabel: periodLabel }) {
  const [query, setQuery] = useState("");
  const [metric, setMetric] = useState("units");
  const [limit, setLimit] = useState(8);
  const debouncedQuery = useDebouncedValue(query, 220);

  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= 640,
  );
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(max-width: 640px)");
    const handler = (e) => setIsMobile(e.matches);
    setIsMobile(mql.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  // Stable bar values for color mapping (kept in state so re-renders reuse colors
  // instead of recomputing; recharts keys off data identity).
  const data = useMemo(() => {
    const needle = debouncedQuery.trim().toLowerCase();
    const source = needle
      ? rows.filter((row) =>
          `${row.productName} ${row.brandName || ""}`.toLowerCase().includes(needle),
        )
      : rows;
    // Rank by the active metric so the chart always shows the most relevant
    // slice of the catalog (top performers), then cap to the selected page size
    // so thousands of products never render at once.
    const ranked = [...source].sort(
      (a, b) =>
        Number(b[metric] || 0) - Number(a[metric] || 0) ||
        Number(b.units || 0) - Number(a.units || 0) ||
        a.productName.localeCompare(b.productName),
    );
    const effectiveLimit = isMobile ? Math.min(limit, 5) : limit;
    return ranked.slice(0, effectiveLimit).map((row) => ({
      ...row,
      shortName: truncateLabel(row.productName, isMobile ? 8 : 14),
    }));
  }, [rows, debouncedQuery, metric, limit, isMobile]);

  return (
    <article className="panel analytics-panel analytics-performance-panel">
      <div className="panel-heading">
        <div>
          <p>PRODUCT PERFORMANCE CHART</p>
          <h2>Units, Profit &amp; Returns by Product ({periodLabel})</h2>
        </div>
      </div>
      {rows.length > 8 ? (
        <div className="data-toolbar data-toolbar-compact">
          <label className="data-search" aria-label="Search products in chart">
            <Search size={16} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search products or brands…"
            />
            {query ? (
              <button
                type="button"
                className="data-search-clear"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                title="Clear search"
              >
                <X size={14} />
              </button>
            ) : null}
          </label>
          <label className="data-toolbar-select">
            <span>Rank by</span>
            <select value={metric} onChange={(event) => setMetric(event.target.value)}>
              {CHART_METRICS.map(([id, text]) => (
                <option key={id} value={id}>
                  {text}
                </option>
              ))}
            </select>
          </label>
          <label className="data-toolbar-select">
            <span>Show top</span>
            <select value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
              {CHART_LIMITS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
      {rows.length ? (
        <div
          className="analytics-chart-container"
          style={{
            width: "100%",
            height: isMobile ? 240 : 270,
            minWidth: 0,
            overflow: "hidden",
            position: "relative",
          }}
        >
          <ResponsiveContainer
            width="99%"
            height="100%"
            debounce={100}
            minWidth={0}
            minHeight={0}
          >
            <BarChart
              data={data}
              margin={{
                top: 10,
                right: isMobile ? 8 : 12,
                left: isMobile ? -16 : 0,
                bottom: isMobile ? 18 : 4,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
              <XAxis
                dataKey="shortName"
                tick={{ fontSize: isMobile ? 9.5 : 11, fill: "#64748b" }}
                interval={isMobile && data.length > 3 ? "preserveStartEnd" : 0}
                height={isMobile ? 36 : 42}
                angle={isMobile ? -25 : data.length > 12 ? -20 : 0}
                textAnchor={isMobile || data.length > 12 ? "end" : "middle"}
                tickFormatter={(value) => (data.length > (isMobile ? 4 : 8) ? truncateLabel(value, isMobile ? 8 : 10) : value)}
              />
              <YAxis
                tick={{ fontSize: isMobile ? 9.5 : 11, fill: "#64748b" }}
                width={isMobile ? 38 : 50}
              />
              <Tooltip
                formatter={(value, name) => (name === "Units sold" || name === "Returns" ? value : `BDT ${money(value)}`)}
                labelFormatter={(label, payload) => payload?.[0]?.payload?.productName || label}
              />
              {[
                ...CHART_METRICS.filter(([id]) => id !== "revenue"),
                ...(metric === "revenue" ? [["revenue", "Revenue"]] : []),
              ].map(([id, text]) => (
                <Bar
                  key={id}
                  dataKey={id}
                  name={text}
                  fill={CHART_COLORS[id]}
                  radius={[6, 6, 0, 0]}
                  isAnimationActive={!isMobile}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="analytics-empty-state">
          <p>No sales recorded in this period.</p>
        </div>
      )}
      {rows.length > 8 ? (
        <p className="analytics-footnote">
          Showing top {data.length} of {rows.length} products with sales in this period
          {debouncedQuery ? ` (filtered by “${debouncedQuery.trim()}”)` : ""}.
        </p>
      ) : null}
    </article>
  );
}

export function DataTable({ columns, rows, empty, rowClassName, pageSize }) {
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [rows]);
  const total = rows?.length || 0;
  const pageCount = pageSize ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * (pageSize || 0);
  const visible = pageSize ? rows.slice(start, start + pageSize) : rows;
  if (!total) {
    return (
      <div className="analytics-empty-state">
        <p>{empty}</p>
      </div>
    );
  }
  return (
    <>
      <div className="analytics-table-wrap">
        <table className="analytics-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={column.align === "right" ? "num" : undefined}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, index) => (
              <tr key={row.key || row.code || row.id || index} className={rowClassName?.(row, index) || undefined}>
                {columns.map((column) => (
                  <td key={column.key} className={column.align === "right" ? "num" : undefined}>
                    {column.render ? column.render(row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pageSize && pageCount > 1 ? (
        <nav className="analytics-table-pager" aria-label="Table pagination">
          <span>
            Showing {start + 1}–{Math.min(total, start + pageSize)} of {total}
          </span>
          <div>
            <button type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} aria-label="Previous page">
              <ChevronLeft size={14} />
            </button>
            <strong>
              {safePage} / {pageCount}
            </strong>
            <button type="button" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)} aria-label="Next page">
              <ChevronRight size={14} />
            </button>
          </div>
        </nav>
      ) : null}
    </>
  );
}

function Highlight({ children }) {
  return <span className="analytics-highlight">{children}</span>;
}

const CUSTOMER_PAGE_SIZE = 10;

function CustomerPurchaseSection({ customers = [], reportLabel }) {
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [customers]);

  const total = customers.length;
  const pageCount = Math.max(1, Math.ceil(total / CUSTOMER_PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * CUSTOMER_PAGE_SIZE;
  const visible = customers.slice(start, start + CUSTOMER_PAGE_SIZE);

  if (!total) {
    return (
      <article className="panel analytics-panel customer-purchase-panel">
        <div className="panel-heading">
          <div>
            <p>CUSTOMER PURCHASE DETAILS</p>
            <h2>Customers who bought products in {reportLabel}</h2>
          </div>
        </div>
        <div className="analytics-empty-state">
          <p>No customer names or phone numbers were recorded for sales in this period. Customer details appear here when they are captured during QR scan / sale activation.</p>
        </div>
      </article>
    );
  }

  return (
    <article className="panel analytics-panel customer-purchase-panel">
      <div className="panel-heading">
        <div>
          <p>CUSTOMER PURCHASE DETAILS</p>
          <h2>Customer purchase breakdown for {reportLabel}</h2>
          <span className="panel-heading-count">
            {total} customer{total === 1 ? "" : "s"} · ranked by purchases, spend &amp; profit
          </span>
        </div>
      </div>

      <div className="analytics-table-wrap customer-purchase-table-wrap">
        <table className="analytics-table customer-purchase-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Product</th>
              <th className="num">Purchases</th>
              <th className="num">Total Spent</th>
              <th className="num">Total Profit</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((customer, index) => {
              const top = (customer.productDetails || [])[0] || {};
              const extraCount = Math.max(0, (customer.productDetails || []).length - 1);
              const rankClass = index === 0 && page === 1 ? " customer-rank-1" : "";
              return (
                <tr key={customer.key} className={`customer-purchase-row${rankClass}`}>
                  <td>
                    <span className="customer-cell">
                      <span className="customer-avatar">{String(customer.name || customer.phone || "?").slice(0, 1).toUpperCase()}</span>
                      <span className="customer-cell-main">
                        <strong>
                          {index === 0 && page === 1 ? (
                            <span className="customer-rank-badge" title="Top customer">#1 </span>
                          ) : null}
                          {customer.name || "Unnamed customer"}
                        </strong>
                        {customer.phone ? (
                          <a className="customer-phone-link" href={`tel:${customer.phone}`} title={`Call ${customer.phone}`}>
                            {customer.phone}
                          </a>
                        ) : null}
                        {customer.address ? <small className="customer-address">{customer.address}</small> : null}
                      </span>
                    </span>
                  </td>
                  <td>
                    <span className="product-cell">
                      <strong>{top.productName || (customer.productDetails?.length ? `${customer.productDetails.length} products` : "—")}</strong>
                      {top.productModel ? <small className="product-brand-sub">Model: {top.productModel}</small> : null}
                      {extraCount > 0 ? <small className="product-brand-sub">+{extraCount} more product{extraCount === 1 ? "" : "s"}</small> : null}
                    </span>
                  </td>
                  <td className="num">
                    <strong>{customer.purchases}</strong>
                    <small className="analytics-table-sub">time{customer.purchases === 1 ? "" : "s"}</small>
                  </td>
                  <td className="num">BDT {money(customer.revenue)}</td>
                  <td className="num">BDT {money(customer.profit)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pageCount > 1 ? (
        <nav className="analytics-table-pager customer-purchase-pager" aria-label="Customer list pagination">
          <span>
            Showing {start + 1}–{Math.min(total, start + CUSTOMER_PAGE_SIZE)} of {total} customers · {CUSTOMER_PAGE_SIZE} per page
          </span>
          <div>
            <button type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} aria-label="Previous page">
              <ChevronLeft size={14} />
            </button>
            <strong>
              {safePage} / {pageCount}
            </strong>
            <button type="button" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)} aria-label="Next page">
              <ChevronRight size={14} />
            </button>
          </div>
        </nav>
      ) : null}

      <p className="analytics-footnote">
        All-time totals shown when using “All Time”. Customers are ranked by highest number of purchases, then by total amount spent and profit generated.
      </p>
    </article>
  );
}

export function AnalyticsPanels({ report, compact = false }) {
  const productRows = (report.products || []).filter((item) => item.units || item.returns);
  const bestKeys = new Set((report.bestSellers || []).map((item) => item.key));
  const warrantyPie = [
    { name: "Active", value: report.warrantyTotals.active },
    { name: "Expired", value: report.warrantyTotals.expired },
    { name: "Voided (Returns)", value: report.warrantyTotals.voided },
    { name: "No warranty", value: report.warrantyTotals.noWarranty },
  ];
  const showMonthly = report.monthly?.length > 1;

  const keyStatCards = (
    <div className="analytics-stat-grid">
      <MiniStat
        label="Net Units Sold"
        value={report.totals.units}
        note="Gross sales minus returns"
        Icon={ShoppingBag}
        tone="green"
      />
      <MiniStat
        label="Net Revenue"
        value={`BDT ${money(report.totals.revenue)}`}
        note="Total realized sales"
        Icon={TrendingUp}
        tone="blue"
      />
      <MiniStat
        label="Net Profit"
        value={`BDT ${money(report.totals.profit)}`}
        note="Revenue minus product costs"
        Icon={CircleDollarSign}
        tone="purple"
      />
      <MiniStat
        label="Active Warranties"
        value={report.warrantyTotals.active}
        note="Currently valid coverage"
        Icon={BadgeCheck}
        tone="green"
      />
    </div>
  );

  const extraStatCards = (
    <div className="analytics-stat-grid">
      <MiniStat
        label="Returns Recorded"
        value={report.totals.returns}
        note={`${report.totals.returnRate}% period return rate`}
        Icon={RotateCcw}
        tone="orange"
      />
      <MiniStat
        label="Best Selling Product"
        value={names(report.bestSellers, "No sales yet")}
        note={report.bestSellers?.[0]?.units ? `${report.bestSellers[0].units} units sold` : ""}
        Icon={BadgeCheck}
        tone="green"
      />
      <MiniStat
        label="Most Returned Product"
        value={names(report.mostReturned, "No returns")}
        note={report.mostReturned?.[0]?.returns ? `${report.mostReturned[0].returns} returned` : ""}
        Icon={RotateCcw}
        tone="orange"
      />
      <MiniStat
        label="Expired Warranties"
        value={report.warrantyTotals.expired}
        note="Past warranty period"
        Icon={Clock}
        tone="orange"
      />
      <MiniStat
        label="Voided Warranties"
        value={report.warrantyTotals.voided}
        note="Cancelled due to returns"
        Icon={ShieldAlert}
        tone="red"
      />
    </div>
  );

  const performanceChart = (
    <PerformanceChart rows={productRows} rangeLabel={report.label} />
  );

  const productTable = (
    <article className="panel analytics-panel">
      <div className="panel-heading">
        <div>
          <p>PRODUCT-WISE SALES &amp; PROFIT</p>
          <h2>Sales breakdown for {report.label}</h2>
        </div>
      </div>
      <DataTable
        empty="No sales recorded in this period."
        rowClassName={(row) => (bestKeys.has(row.key) ? "is-best" : "")}
        pageSize={10}
        columns={[
          {
            key: "productName",
            label: "Product Name",
            render: (row) => (
              <span className="product-cell">
                <strong>{row.productName}</strong>
                {row.brandName ? <small className="product-brand-sub">{row.brandName}</small> : null}
                {bestKeys.has(row.key) ? <span className="pill success">Best seller</span> : null}
              </span>
            ),
          },
          { key: "units", label: "Units Sold", align: "right" },
          { key: "revenue", label: "Total Revenue", align: "right", render: (row) => `BDT ${money(row.revenue)}` },
          { key: "profit", label: "Net Profit", align: "right", render: (row) => `BDT ${money(row.profit)}` },
          { key: "returns", label: "Returns", align: "right" },
          { key: "returnRate", label: "Return Rate", align: "right", render: (row) => `${row.returnRate}%` },
        ]}
        rows={productRows}
      />
      <p className="analytics-footnote">
        Total units sold: <Highlight>{report.totals.units}</Highlight> · Total Revenue:{" "}
        <Highlight>BDT {money(report.totals.revenue)}</Highlight> · Total Profit:{" "}
        <Highlight>BDT {money(report.totals.profit)}</Highlight>
      </p>
    </article>
  );

  if (compact) {
    return (
      <div className="analytics-panels">
        {keyStatCards}
        {performanceChart}
        {productTable}
      </div>
    );
  }

  return (
    <div className="analytics-panels">
      {/* Key Metric Summary Cards */}
      {keyStatCards}
      {extraStatCards}

      {/* Product-wise Sales Table */}
      {productTable}

      {/* Customer Purchase Details */}
      <CustomerPurchaseSection
        customers={report.customerPurchases || []}
        reportLabel={report.label}
      />

      {/* Performance Bar Chart */}
      {performanceChart}

      {/* Returns Table */}
      <article className="panel analytics-panel">
        <div className="panel-heading">
          <div>
            <p>RETURNS &amp; REFUNDS</p>
            <h2>Returned products in {report.label}</h2>
          </div>
        </div>
        <DataTable
          empty="No returns recorded in this period."
          columns={[
            {
              key: "productName",
              label: "Product",
              render: (row) => (
                <span className="product-cell">
                  <strong>{row.productName}</strong>
                  {row.brandName ? <small className="product-brand-sub">{row.brandName}</small> : null}
                </span>
              ),
            },
            { key: "returns", label: "Return Count", align: "right" },
            { key: "returnRate", label: "Return Rate", align: "right", render: (row) => `${row.returnRate}%` },
          ]}
          rows={report.returnRows}
        />
        <p className="analytics-footnote">
          Total returns in period: <Highlight>{report.totals.returns}</Highlight> · Period Return Rate:{" "}
          <Highlight>{report.totals.returnRate}%</Highlight>
        </p>
      </article>

      {/* Warranty Analytics Grid */}
      <div className="chart-grid dashboard-chart-grid">
        <article className="panel warranty-chart analytics-panel">
          <div className="panel-heading">
            <div>
              <p>WARRANTY DISTRIBUTION</p>
              <h2>Warranty status breakdown</h2>
            </div>
          </div>
          {warrantyPie.some((item) => item.value > 0) ? (
            <>
              <div
                className="analytics-chart-container"
                style={{ width: "100%", height: 190, minWidth: 0, overflow: "hidden", position: "relative" }}
              >
                <ResponsiveContainer width="99%" height="100%" debounce={100} minWidth={0} minHeight={0}>
                  <PieChart>
                    <Pie
                      data={warrantyPie}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={52}
                      outerRadius={78}
                      paddingAngle={2}
                      isAnimationActive={false}
                    >
                      {warrantyPie.map((_, index) => (
                        <Cell key={index} fill={WARRANTY_COLORS[index]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="legend">
                {warrantyPie.map((item, index) => (
                  <span key={item.name}>
                    <i style={{ background: WARRANTY_COLORS[index] }} />
                    {item.name} <b>{item.value}</b>
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div className="analytics-empty-state">
              <p>No warranty activations in this period.</p>
            </div>
          )}
        </article>

        <article className="panel analytics-panel">
          <div className="panel-heading">
            <div>
              <p>WARRANTY SUMMARY</p>
              <h2>Current status of period activations</h2>
            </div>
          </div>
          <ul className="warranty-total-list">
            <li className="active"><BadgeCheck size={16} /> Active Warranties <b>{report.warrantyTotals.active}</b></li>
            <li className="expired"><Clock size={16} /> Expired Warranties <b>{report.warrantyTotals.expired}</b></li>
            <li className="voided"><RotateCcw size={16} /> Voided (Returns) <b>{report.warrantyTotals.voided}</b></li>
            <li className="none"><ShieldCheck size={16} /> No Warranty / Unlinked <b>{report.warrantyTotals.noWarranty}</b></li>
          </ul>
        </article>
      </div>

      {/* Detailed Warranty Records Table */}
      <article className="panel analytics-panel">
        <div className="panel-heading">
          <div>
            <p>WARRANTY TRACKING LIST</p>
            <h2>Activations, expiration dates &amp; current status</h2>
          </div>
        </div>
        <DataTable
          empty="No activated warranties in this period."
          pageSize={12}
          columns={[
            { key: "productName", label: "Product Name" },
            { key: "code", label: "QR Code", render: (row) => <code className="qr-code-chip">{row.code}</code> },
            { key: "activatedAt", label: "Activation Date", render: (row) => dateTime(row.activatedAt) },
            { key: "warrantyExpiresAt", label: "Expiration Date", render: (row) => dateTime(row.warrantyExpiresAt) },
            { key: "status", label: "Warranty Status", render: (row) => statusPill(row.status) },
          ]}
          rows={report.warrantyDetails}
        />
      </article>

      {/* Month-by-Month Table when multi-month is selected */}
      {showMonthly ? (
        <article className="panel analytics-panel">
          <div className="panel-heading">
            <div>
              <p>MONTHLY TRENDS</p>
              <h2>Sales, profit &amp; returns by month</h2>
            </div>
          </div>
          <DataTable
            empty="No monthly activity."
            columns={[
              { key: "label", label: "Month" },
              { key: "units", label: "Net Units Sold", align: "right" },
              { key: "revenue", label: "Net Revenue", align: "right", render: (row) => `BDT ${money(row.revenue)}` },
              { key: "profit", label: "Net Profit", align: "right", render: (row) => `BDT ${money(row.profit)}` },
              { key: "returns", label: "Returns", align: "right" },
            ]}
            rows={report.monthly}
          />
        </article>
      ) : null}
    </div>
  );
}

export function ReportPage({ data, range, onChangeRange, onBack }) {
  const report = useMemo(
    () => buildReport(data?.sales || [], data?.qrs || [], range || defaultRange()),
    [data?.sales, data?.qrs, range],
  );
  const shopName = data?.user?.shopName || data?.user?.name || "WarQ Merchant";

  const fullReportExport = useMemo(() => {
    const generatedAt = new Date().toISOString();
    return {
      ...report,
      shopName,
      generatedAt: report.generatedAt || generatedAt,
    };
  }, [report, shopName]);

  // Open the browser print dialog so the user can print or save as PDF.
  // Do not auto-download a generated PDF file.
  const printReport = () => {
    window.print();
  };

  const handleExportCompleteExcel = () =>
    exportProfessionalCompleteReport({ format: "excel", report: fullReportExport });
  const handleExportCompleteDocx = () =>
    exportProfessionalCompleteReport({ format: "docx", report: fullReportExport });
  const handleExportCompleteCsv = () =>
    exportProfessionalCompleteReport({ format: "csv", report: fullReportExport });

  return (
    <section className="page report-page">
      <div className="page-title row-title no-print">
        <div>
          <span className="eyebrow">FULL BUSINESS REPORT</span>
          <h1>{report.label}</h1>
          <p>Complete sales, profit, returns, and warranty breakdown.</p>
        </div>
        <div className="period-toolbar-actions">
          <button type="button" className="secondary-button" onClick={onBack}>
            Back to Dashboard
          </button>
        </div>
      </div>

      <PeriodToolbar
        range={range}
        onChange={onChangeRange}
        variant="report"
        printAction={printReport}
        onExportCsv={handleExportCompleteCsv}
        onExportExcel={handleExportCompleteExcel}
        onExportDocx={handleExportCompleteDocx}
      />

      {/* Official Report Letterhead for Print/PDF */}
      <article className="panel report-letterhead">
        <div className="report-letterhead-copy">
          <span className="brand-mark">
            <FileText size={22} />
          </span>
          <div>
            <p className="letterhead-sub">WARQ SALES &amp; WARRANTY REPORT</p>
            <h2 className="letterhead-shop-name">{shopName}</h2>
            <p className="letterhead-meta">
              Period: <b>{report.label}</b> · Report Generated on {dateTime(report.generatedAt)}
            </p>
          </div>
        </div>
        <div className="report-letterhead-badge">
          <span className="pill success">Verified Report</span>
        </div>
      </article>

      <AnalyticsPanels report={report} />
    </section>
  );
}
