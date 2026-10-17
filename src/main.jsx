import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import QRCode from "qrcode";
import JSZip from "jszip";
import { Html5Qrcode } from "html5-qrcode";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertCircle,
  AlertTriangle,
  BadgeCheck,
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Clock,
  Copy,
  Crown,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  HelpCircle,
  Info,
  KeyRound,
  LoaderCircle,
  LogOut,
  Mail,
  MapPin,
  MessageCircle,
  PackagePlus,
  Phone,
  Plus,
  Printer,
  QrCode,
  RefreshCcw,
  RotateCcw,
  ScanLine,
  Search,
  Send,
  ShieldCheck,
  ShoppingBag,
  Store,
  Timer,
  Trash2,
  TrendingUp,
  UserRound,
  Users,
  WalletCards,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import {
  adminAuth,
  auth,
  onAuthStateChanged,
  registerWithEmail,
  reloadUser,
  signInAdminWithToken,
  signInWithEmail,
  signOutAdmin,
  signOutUser,
  sendClientPasswordResetEmail,
  sendClientVerificationEmail,
  applyEmailVerificationCode,
} from "./firebase";
import { adminApi, api } from "./api";
import {
  BD_DISTRICTS,
  getUpazilasForDistrict,
  isValidBdPhoneNumber,
  formatBdPhoneNumber,
} from "./bd-locations";
import "./styles.css";
import "./improvements.css";
import "./responsive.css";
import "./ui-polish.css";
import {
  AdminAnnouncementComposer,
  AdminProfileView,
  AdminSentNotificationsList,
  GlobalBusyOverlay,
  HeaderMenu,
  LoadingButton,
  LocationPicker,
  PaymentProviderPicker,
  PaymentBrandLogo,
} from "./ui-enhancements";
import { bindRealtimeSync } from "./realtime";
import { buildReport, defaultRange, qrProductKey } from "./report-analytics";
import { AnalyticsPanels, PeriodToolbar, ReportPage } from "./report-ui";
import { AdminSupportPanel, ChatBoard } from "./chat-board";
import {
  remainingSecondsUntil,
  serverNow,
  splitCountdownParts,
  useWallClockNow,
} from "./wall-clock";
import { PublicCustomerWarranty } from "./public-warranty";
import CustomerPortal from "./customer-portal";
import SandboxCheckout from "./sandbox-checkout";
import AiPreviewModule from "./ai-preview";
import { mountDemoUi } from "./demo/demo-ui.jsx";
import { registerQrRecords, qrScanUrl } from "./demo/qr-payload.js";
import { ensureSeeded } from "./demo/seed.js";
import { BASE_PATH } from "./demo/config.js";

const PLANS = [
  { id: "monthly", name: "1 Month", price: 50, badge: null, desc: "Flexible starter access for quick needs", save: null },
  { id: "halfYearly", name: "6 Months", price: 200, badge: "Most Popular", desc: "Best balance of flexibility & savings", save: "Save 33%" },
  { id: "yearly", name: "1 Year", price: 350, badge: "Best Value", desc: "Full year of uninterrupted warranty management", save: "Save 42%" },
];
const colors = ["#22c55e", "#f59e0b", "#465e80", "#7c5ce0"];
const money = (value) =>
  new Intl.NumberFormat("en-BD", { maximumFractionDigits: 2 }).format(
    Number(value || 0),
  );
const dateTime = (value) =>
  value
    ? new Intl.DateTimeFormat("en-BD", {
        dateStyle: "medium",
        timeStyle: "medium",
      }).format(new Date(value))
    : "—";

const dateTimeWithDay = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  try {
    const formatted = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }).format(d);
    const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(d);
    return `${weekday}, ${formatted}`;
  } catch {
    return dateTime(value);
  }
};

const dateWithDay = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  try {
    const formatted = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(d);
    const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(d);
    return `${formatted} (${weekday})`;
  } catch {
    return date(value);
  }
};

const timeWithAmPm = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }).format(d);
  } catch {
    return "—";
  }
};

const date = (value) =>
  value
    ? new Intl.DateTimeFormat("en-BD", { dateStyle: "medium" }).format(
        new Date(value),
      )
    : "—";

function formatDurationObject(duration) {
  if (!duration) return "No duration";
  const parts = [];
  if (duration.months) parts.push(`${duration.months} Month${duration.months === 1 ? "" : "s"}`);
  if (duration.days) parts.push(`${duration.days} Day${duration.days === 1 ? "" : "s"}`);
  if (duration.hours) parts.push(`${duration.hours} Hour${duration.hours === 1 ? "" : "s"}`);
  if (duration.minutes) parts.push(`${duration.minutes} Minute${duration.minutes === 1 ? "" : "s"}`);
  if (duration.seconds) parts.push(`${duration.seconds} Second${duration.seconds === 1 ? "" : "s"}`);
  return parts.join(" ") || "0 Seconds";
}

const activeAccess = (user) =>
  Boolean(
    !user?.disabled &&
      !user?.banned &&
      (user?.unlimitedAccess ||
        (user?.subscriptionEndsAt &&
          new Date(user.subscriptionEndsAt).getTime() > Date.now())),
  );

const profileComplete = (user) =>
  Boolean(
    user?.name?.trim() &&
      user?.shopName?.trim() &&
      user?.mobile?.trim() &&
      isValidBdPhoneNumber(user.mobile) &&
      user?.shopAddress?.trim() &&
      user?.deliveryAddress?.trim() &&
      user?.district?.trim() &&
      user?.upazila?.trim(),
  );

const WARQ_CONNECTION_HELP =
  typeof import.meta.env.VITE_CONNECTION_HELP === "string" && import.meta.env.VITE_CONNECTION_HELP.trim()
    ? import.meta.env.VITE_CONNECTION_HELP.trim()
    : "Could not connect to the WarQ server. Please make sure it is running, then try again (locally: Start-WarQ.bat or npm run dev).";

const errorText = (error) =>
  ({
    "server/connection-failed": WARQ_CONNECTION_HELP,
    "server/not-configured":
      "The trusted WarQ server is not configured yet. Set server/.env and restart it.",
    "server/timeout":
      "The WarQ server did not respond. Check that it is running.",
    "resource-exhausted":
      error?.message ||
      "WarQ is temporarily busy. Please wait a moment and try again.",
    unauthenticated: "Please sign in again.",
    "permission-denied": error?.message || "You do not have permission to perform this action.",
    "failed-precondition": error?.message,
    "auth/invalid-credential": "Invalid email or password.",
    "auth/email-already-in-use": "An account already uses this email address.",
    "auth/weak-password": "Use a password with at least 8 characters.",
  })[error?.code] ||
  (error?.message === "Failed to fetch"
    ? WARQ_CONNECTION_HELP
    : error?.message) ||
  "Please try again.";

function SessionBootError({ message, busy, onRetry, onLogout }) {
  return (
    <main className="loading-screen">
      <section className="panel session-error">
        <div className="brand-mark">
          <AlertCircle />
        </div>
        <h1>Could not open your WarQ workspace</h1>
        <p>{message || "WarQ could not finish signing you in. Please try again."}</p>
        <div className="session-error-actions">
          <button className="primary-button" onClick={onRetry} disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={16} /> : <RefreshCcw size={16} />}
            Retry
          </button>
          <button className="secondary-button" onClick={onLogout} disabled={busy}>
            Sign out
          </button>
        </div>
      </section>
    </main>
  );
}

function scanCode() {
  const pathMatch = window.location.pathname.match(/\/scan\/([^/?#]+)/i);
  if (pathMatch) return decodeURIComponent(pathMatch[1]);
  const match = window.location.hash.match(/^#\/scan\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}
function scannedWarqCode(value) {
  const raw = String(value || "").trim();
  const pathMatch = raw.match(/\/scan\/([^/?#]+)/i);
  if (pathMatch) return decodeURIComponent(pathMatch[1]);
  const hashMatch = raw.match(/#\/scan\/([^/?#]+)/);
  if (hashMatch) return decodeURIComponent(hashMatch[1]);
  return /^WQ-[A-Z0-9-]+$/i.test(raw) ? raw.toUpperCase() : "";
}
/** Path-based URL so Google Lens / camera / third-party scanners open the public page. */
function qrUrl(code) {
  return qrScanUrl(code);
}

const APP_VIEWS = new Set([
  "dashboard",
  "subscription",
  "requests",
  "qrs",
  "sales",
  "report",
  "profile",
  "scanner",
  "chat",
  "notifications",
]);

function parseAppRoute(hash = window.location.hash) {
  const pathScan = window.location.pathname.match(/\/scan\/([^/?#]+)/i);
  if (pathScan) {
    return {
      view: "dashboard",
      product: false,
      scan: decodeURIComponent(pathScan[1]),
      admin: false,
      sandbox: "",
    };
  }
  if (!hash || hash === "#" || hash === "#/") {
    return { view: "dashboard", product: false, scan: "", admin: false, sandbox: "" };
  }
  if (hash === "#/admin" || hash.startsWith("#/admin/")) {
    return { view: "dashboard", product: false, scan: "", admin: true, sandbox: "" };
  }
  const sandboxMatch = hash.match(/^#\/sandbox\/([^/?#]+)/);
  if (sandboxMatch) {
    return {
      view: "subscription",
      product: false,
      scan: "",
      admin: false,
      sandbox: decodeURIComponent(sandboxMatch[1]),
    };
  }
  const scanMatch = hash.match(/^#\/scan\/([^/?#]+)/);
  if (scanMatch) {
    return {
      view: "dashboard",
      product: false,
      scan: decodeURIComponent(scanMatch[1]),
      admin: false,
      sandbox: "",
    };
  }
  const appMatch = hash.match(/^#\/app\/([a-z]+)(\/product)?/);
  if (appMatch && APP_VIEWS.has(appMatch[1])) {
    return {
      view: appMatch[1],
      product: Boolean(appMatch[2]),
      scan: "",
      admin: false,
      sandbox: "",
    };
  }
  return { view: "dashboard", product: false, scan: "", admin: false, sandbox: "" };
}

function appHash(view, withProduct = false) {
  const safe = APP_VIEWS.has(view) ? view : "dashboard";
  return withProduct ? `#/app/${safe}/product` : `#/app/${safe}`;
}

function pushAppRoute(view, withProduct = false) {
  const next = appHash(view, withProduct);
  if (window.location.hash === next) return;
  window.history.pushState(
    { warq: true, view, product: withProduct },
    "",
    next,
  );
}

function replaceAppRoute(view, withProduct = false) {
  const next = appHash(view, withProduct);
  window.history.replaceState(
    { warq: true, view, product: withProduct },
    "",
    next,
  );
}

function warrantyText(duration) {
  if (!duration) return "No Warranty";
  const labels = [
    ["months", "Month"],
    ["days", "Day"],
    ["hours", "Hour"],
    ["minutes", "Minute"],
    ["seconds", "Second"],
  ];
  const parts = labels
    .filter(([key]) => duration[key])
    .map(
      ([key, label]) =>
        `${duration[key]} ${label}${duration[key] === 1 ? "" : "s"}`,
    );
  return parts.length ? `${parts.join(" ")} Warranty` : "No Warranty";
}

function remaining(end, nowMs = serverNow()) {
  const seconds = remainingSecondsUntil(end, nowMs);
  if (seconds <= 0) return "00:00:00";
  const { days, hours, minutes, seconds: secs } = splitCountdownParts(seconds);

  if (days > 0) return `${days}d ${hours}h ${minutes}m ${secs}s`;
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  return `${String(minutes).padStart(2, "0")}m ${String(secs).padStart(2, "0")}s`;
}

function LiveAccessCountdown({ endsAt, onExpire, compact = false }) {
  // Timestamp-based: remaining = endsAt - wall clock (offline time still elapses).
  const nowTime = useWallClockNow();
  const expireNotifiedRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const diffSec = endsAt ? remainingSecondsUntil(endsAt, nowTime) : 0;

  useEffect(() => {
    expireNotifiedRef.current = false;
  }, [endsAt]);

  useEffect(() => {
    if (!endsAt) return;
    if (diffSec <= 0 && !expireNotifiedRef.current) {
      expireNotifiedRef.current = true;
      onExpireRef.current?.();
    }
  }, [endsAt, diffSec]);

  if (!endsAt) return <span className="pill neutral">No expiration</span>;

  if (diffSec <= 0) {
    return (
      <span className="live-countdown-badge expired">
        <Clock size={compact ? 12 : 14} /> Expired (00:00:00)
      </span>
    );
  }

  const { days, hours, minutes, seconds: secs } = splitCountdownParts(diffSec);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (days > 0 || hours > 0) parts.push(`${String(hours).padStart(2, "0")}h`);
  parts.push(`${String(minutes).padStart(2, "0")}m`);
  parts.push(`${String(secs).padStart(2, "0")}s`);

  return (
    <span className={`live-countdown-badge active ${diffSec < 300 ? "urgent" : ""}`}>
      <Clock size={compact ? 12 : 14} className="spin-slow" />
      <strong>{parts.join(" ")}</strong> Remaining
    </span>
  );
}

function LiveWarrantyTimer({ expiresAt, duration, status, compact = false }) {
  // Timestamp-based against qr.warrantyExpiresAt — downtime never extends coverage.
  const nowTime = useWallClockNow();

  if (status === "returned") return <span className="pill danger"><RotateCcw size={compact ? 11 : 13} /> Warranty Voided</span>;
  if (!duration) return <span className="pill neutral">No Warranty</span>;
  const isActivated = status === "activated";
  if (!isActivated) return <span className="pill warning"><Clock size={compact ? 11 : 13} /> Awaiting Activation</span>;
  if (!expiresAt) return <span className="pill neutral">No Expiry Date</span>;

  const diffSec = remainingSecondsUntil(expiresAt, nowTime);

  if (diffSec <= 0) {
    return <span className="pill danger"><AlertTriangle size={compact ? 11 : 13} /> Warranty Expired</span>;
  }

  const { days, hours, minutes, seconds: secs } = splitCountdownParts(diffSec);

  let timeString = "";
  if (days > 0) {
    timeString = `${days}d ${hours}h ${minutes}m ${secs}s`;
  } else if (hours > 0) {
    timeString = `${hours}h ${minutes}m ${secs}s`;
  } else {
    timeString = `${String(minutes).padStart(2, "0")}m ${String(secs).padStart(2, "0")}s`;
  }

  return (
    <span className={`pill success live-warranty-badge ${diffSec < 60 ? "urgent" : ""}`}>
      <Clock size={compact ? 11 : 13} className="spin-slow" /> <strong>{timeString}</strong> Remaining
    </span>
  );
}

function LiveWarrantyCountdownBlock({ expiresAt, duration, status, isActivated }) {
  // Absolute expiry timestamp vs wall clock — refresh/offline cannot add time.
  const nowTime = useWallClockNow();

  if (status === "returned") {
    return (
      <div className="countdown-display-card expired">
        <div className="countdown-card-header">
          <RotateCcw size={18} />
          <span>Warranty Voided</span>
        </div>
        <p className="countdown-subtext">This product was returned, so its warranty is no longer valid.</p>
      </div>
    );
  }

  if (!duration) {
    return (
      <div className="countdown-display-card neutral">
        <div className="countdown-card-header">
          <Info size={18} />
          <span>No Warranty Coverage</span>
        </div>
        <p className="countdown-subtext">This product does not have active warranty coverage.</p>
      </div>
    );
  }

  const activated = isActivated || status === "activated";
  if (!activated) {
    return (
      <div className="countdown-display-card pending">
        <div className="countdown-card-header">
          <Clock size={18} />
          <span>Warranty Awaiting Activation</span>
        </div>
        <p className="countdown-subtext">Coverage duration: {warrantyText(duration)}. Warranty starts immediately upon activation.</p>
      </div>
    );
  }

  const diffSec = remainingSecondsUntil(expiresAt, nowTime);
  const isExpired = diffSec <= 0;
  const { days, hours, minutes, seconds } = splitCountdownParts(diffSec);

  return (
    <div className={`countdown-display-card ${isExpired ? "expired" : "active"}`}>
      <div className="countdown-card-header">
        {isExpired ? <AlertTriangle size={20} /> : <Timer size={20} className="spin-slow" />}
        <span>{isExpired ? "Warranty Period Expired" : "Live Remaining Warranty Countdown"}</span>
      </div>

      <div className="countdown-digits-grid">
        <div className="countdown-box">
          <span className="digit-value">{String(days).padStart(2, "0")}</span>
          <span className="digit-label">Days</span>
        </div>
        <div className="countdown-separator">:</div>
        <div className="countdown-box">
          <span className="digit-value">{String(hours).padStart(2, "0")}</span>
          <span className="digit-label">Hours</span>
        </div>
        <div className="countdown-separator">:</div>
        <div className="countdown-box">
          <span className="digit-value">{String(minutes).padStart(2, "0")}</span>
          <span className="digit-label">Minutes</span>
        </div>
        <div className="countdown-separator">:</div>
        <div className="countdown-box">
          <span className="digit-value">{String(seconds).padStart(2, "0")}</span>
          <span className="digit-label">Seconds</span>
        </div>
      </div>

      <p className="countdown-subtext">
        {isExpired
          ? (expiresAt ? `Warranty coverage expired on ${dateTimeWithDay(expiresAt)}` : "Warranty coverage has expired.")
          : (expiresAt ? `Valid until ${dateTimeWithDay(expiresAt)}` : "Active warranty coverage.")}
      </p>
    </div>
  );
}

function Lifetime({ qr, compact = false }) {
  const status = qr?.status || (qr?.activatedAt ? "activated" : "pending_activation");
  return (
    <LiveWarrantyTimer
      expiresAt={qr?.warrantyExpiresAt}
      duration={qr?.warrantyDuration}
      status={status}
      compact={compact}
    />
  );
}
function Loading() {
  return (
    <main className="loading-screen">
      <div className="brand-mark">
        <QrCode />
      </div>
      <LoaderCircle className="spin" />
      <p>Opening WarQ securely…</p>
    </main>
  );
}
function Header({
  user,
  onLogout,
  onProfile,
  onNotifications,
  unreadCount = 0,
  admin = false,
  view = "dashboard",
  navigate,
  onScan,
}) {
  return (
    <header className="app-header">
      <div
        className="brand compact"
        onClick={() => navigate?.("dashboard")}
        role={navigate ? "button" : undefined}
        tabIndex={navigate ? 0 : undefined}
        style={navigate ? { cursor: "pointer" } : undefined}
        title="WarQ Home"
      >
        <span className="brand-mark">
          <QrCode size={21} />
        </span>
        <span>
          War<span>Q</span>
        </span>
      </div>

      {!admin && navigate && (
        <nav className="header-nav" aria-label="Main navigation">
          {[
            ["dashboard", ShoppingBag, "Dashboard"],
            ["requests", PackagePlus, "Requests"],
            ["qrs", QrCode, "QR Folders"],
            ["sales", CircleDollarSign, "Sales"],
            ["report", TrendingUp, "Analytics"],
            ["chat", MessageCircle, "Chat"],
          ].map(([id, Icon, label]) => (
            <button
              key={id}
              type="button"
              className={`header-nav-link ${view === id ? "active" : ""}`}
              onClick={() => navigate(id)}
            >
              <Icon size={15} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}

      <div className="header-actions">
        {!admin && onScan && (
          <button
            type="button"
            className="header-scan-button"
            onClick={onScan}
            title="Scan QR code with camera"
          >
            <ScanLine size={15} />
            <span>Scan QR</span>
          </button>
        )}
        {!admin && onNotifications && (
          <button
            type="button"
            className={`header-bell-button ${view === "notifications" ? "active" : ""}`}
            onClick={onNotifications}
            title={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"}
            aria-label="View notifications"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="header-bell-badge">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>
        )}
        {admin && (
          <span className="admin-tag">
            <ShieldCheck size={14} /> Admin
          </span>
        )}
        <HeaderMenu
          user={user}
          admin={admin}
          onProfile={onProfile}
          onNotifications={onNotifications}
          unreadCount={unreadCount}
          onLogout={onLogout}
        />
      </div>
    </header>
  );
}
function Card({ label, value, Icon, color = "green", note }) {
  return (
    <article className={`stat-card ${color}`}>
      <div className="stat-icon">
        <Icon size={19} />
      </div>
      <p>{label}</p>
      <h3>{value}</h3>
      {note && <small>{note}</small>}
    </article>
  );
}
function Empty({ Icon = QrCode, title, text, actionLabel, onAction }) {
  return (
    <div className="empty">
      <span>
        <Icon size={25} />
      </span>
      <strong>{title}</strong>
      <p>{text}</p>
      {actionLabel && onAction && (
        <button type="button" className="secondary-button empty-action-btn" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/* ---- Shared data-browsing primitives (search / filter / pagination) ---- */

const CATALOG_PAGE_SIZE = 12;
const SALES_PAGE_SIZE = 8;
const FOLDER_PAGE_SIZE = 8;
const FOLDER_QR_PAGE_SIZE = 12;

function useDebouncedValue(value, delay = 220) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function usePagedList(items, pageSize) {
  const [page, setPage] = useState(1);
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  useEffect(() => {
    setPage(1);
  }, [items]);
  const start = (safePage - 1) * pageSize;
  return {
    page: safePage,
    pageCount,
    total,
    setPage,
    slice: items.slice(start, start + pageSize),
    start,
  };
}

function DataSearchInput({ value, onChange, placeholder, label }) {
  return (
    <label className="data-search" aria-label={label || "Search"}>
      <Search size={16} />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder || "Search…"}
      />
      {value ? (
        <button
          type="button"
          className="data-search-clear"
          onClick={() => onChange("")}
          aria-label="Clear search"
          title="Clear search"
        >
          <X size={14} />
        </button>
      ) : null}
    </label>
  );
}

function DataToolbarSelect({ value, onChange, options = [], label = "Sort", className = "" }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const normalizedOptions = useMemo(() => {
    return options.map((opt) => {
      if (Array.isArray(opt)) {
        return { id: opt[0], text: opt[1] };
      }
      if (opt && typeof opt === "object") {
        return { id: opt.id ?? opt.value, text: opt.text ?? opt.label ?? opt.name };
      }
      return { id: opt, text: String(opt) };
    });
  }, [options]);

  const selectedOption =
    normalizedOptions.find((opt) => String(opt.id) === String(value)) || normalizedOptions[0];
  const selectedText = selectedOption ? selectedOption.text : String(value || "");

  useEffect(() => {
    if (!open) return;
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleSelect = (optionId) => {
    onChange?.(optionId);
    setOpen(false);
  };

  return (
    <div
      className={`data-toolbar-select-wrap ${open ? "is-open" : ""} ${className}`.trim()}
      ref={containerRef}
    >
      <button
        type="button"
        className={`data-toolbar-select-btn ${open ? "is-open" : ""}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${selectedText}`}
      >
        <span className="data-toolbar-select-left">
          {label ? <span className="data-toolbar-select-label">{label}</span> : null}
          <span className="data-toolbar-select-value" title={selectedText}>
            {selectedText}
          </span>
        </span>
        <ChevronDown
          size={15}
          className={`data-toolbar-select-chevron ${open ? "is-open" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="data-toolbar-dropdown" role="listbox" tabIndex={-1}>
          {normalizedOptions.map((opt) => {
            const isSelected = String(opt.id) === String(value);
            return (
              <button
                key={opt.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`data-toolbar-dropdown-item ${isSelected ? "is-selected" : ""}`}
                onClick={() => handleSelect(opt.id)}
              >
                <span className="data-toolbar-dropdown-text">{opt.text}</span>
                {isSelected ? (
                  <Check size={14} className="data-toolbar-dropdown-check" aria-hidden="true" />
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Pagination({ page, pageCount, total, pageSize, start, onPage, itemLabel = "items" }) {
  if (pageCount <= 1) {
    return total ? (
      <nav className="pagination-bar" aria-label="Pagination">
        <p className="pagination-summary">
          Showing all {total} {itemLabel}
        </p>
      </nav>
    ) : null;
  }
  const from = total === 0 ? 0 : start + 1;
  const to = Math.min(total, start + pageSize);
  const marks = [];
  for (let p = 1; p <= pageCount; p += 1) {
    if (p === 1 || p === pageCount || Math.abs(p - page) <= 1) marks.push(p);
  }
  const items = [];
  let previous = 0;
  for (const p of marks) {
    if (p - previous > 1) items.push("gap");
    items.push(p);
    previous = p;
  }
  return (
    <nav className="pagination-bar" aria-label="Pagination">
      <p className="pagination-summary">
        Showing {from}–{to} of {total} {itemLabel}
      </p>
      <div className="pagination-controls">
        <button
          type="button"
          className="pagination-btn"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={15} />
        </button>
        {items.map((item, index) =>
          item === "gap" ? (
            <span key={`gap-${index}`} className="pagination-gap">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              className={`pagination-btn pagination-page${item === page ? " active" : ""}`}
              aria-current={item === page ? "page" : undefined}
              onClick={() => onPage(item)}
            >
              {item}
            </button>
          ),
        )}
        <button
          type="button"
          className="pagination-btn"
          disabled={page >= pageCount}
          onClick={() => onPage(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </nav>
  );
}
/* Password field with an inline visibility toggle (eye icon).
   Keeps the native label + input markup so existing validation,
   autocomplete, and form submission behavior stay untouched. */
function PasswordInput({ value, onChange, id, ...props }) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="password-field">
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={onChange}
        id={id}
        {...props}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible((prev) => !prev)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        tabIndex={0}
      >
        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </span>
  );
}
function Landing({ onLogin, onRegister, onForgot, busy, message, scan }) {
  const [mode, setMode] = useState("login"),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [localError, setLocalError] = useState("");
  const register = mode === "register";
  const submit = (event) => {
    event.preventDefault();
    if (busy) return;
    setLocalError("");
    if (register && password.length < 8)
      return setLocalError("Use a password with at least 8 characters.");
    if (register && password !== confirm)
      return setLocalError("Passwords do not match.");
    (register ? onRegister : onLogin)({ email, password });
  };
  return (
    <main className="landing">
      <section className="landing-copy">
        <div className="brand">
          <span className="brand-mark">
            <QrCode size={25} />
          </span>
          <span>
            War<span>Q</span>
          </span>
        </div>
        <span className="eyebrow">
          <ShieldCheck size={14} /> DIGITAL WARRANTY, SIMPLIFIED
        </span>
        <h1>
          {scan ? (
            "Activate your product warranty."
          ) : (
            <>
              Every warranty.
              <br />
              <i>Always in hand.</i>
            </>
          )}
        </h1>
        <p>
          {scan
            ? "Sign in with the WarQ account that generated this QR code to view or activate it."
            : "WarQ turns every product sticker into a secure digital warranty record."}
        </p>
        <form className="auth-form" onSubmit={submit}>
          <div className="auth-mode">
            <button
              type="button"
              className={!register ? "active" : ""}
              onClick={() => setMode("login")}
            >
              Sign in
            </button>
            <button
              type="button"
              className={register ? "active" : ""}
              onClick={() => setMode("register")}
            >
              Create account
            </button>
          </div>
          <label>
            Email
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <PasswordInput
              required
              autoComplete={register ? "new-password" : "current-password"}
              minLength={register ? 8 : 1}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {register && (
            <label>
              Confirm password
              <PasswordInput
                required
                autoComplete="new-password"
                minLength="8"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
          )}
          <LoadingButton
            type="submit"
            className="primary-button auth-submit"
            busy={busy}
            keepLabel
          >
            {busy ? null : <KeyRound size={18} />}
            <span className="auth-submit-label">
              {register ? "Sign Up" : "Sign In"}
            </span>
          </LoadingButton>
          <div className="auth-links">
            <button
              type="button"
              className="text-button"
              onClick={() =>
                email
                  ? onForgot(email)
                  : setLocalError("Enter your email first.")
              }
            >
              Forgot password?
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setMode(register ? "login" : "register")}
            >
              {register ? "Already registered?" : "New to WarQ?"}
            </button>
          </div>
        </form>
        {(message || localError) && (
          <p
            className={
              typeof message === "object"
                ? message.type === "success"
                  ? "form-notice"
                  : "form-error"
                : String(message || localError).toLowerCase().includes("sent") ||
                  String(message || localError).toLowerCase().includes("success") ||
                  String(message || localError).toLowerCase().includes("verified")
                ? "form-notice"
                : "form-error"
            }
          >
            {typeof message === "object" ? message.message : message || localError}
          </p>
        )}
        <small className="auth-verify-hint">
          New accounts must verify email before they can activate a QR code.
        </small>
      </section>
      <section className="landing-visual">
        <div className="hero-card">
          <div className="fake-qr">
            <QrCode size={70} />
          </div>
          <h3>Smart Warranty Card</h3>
          <p>Scan to verify instantly</p>
        </div>
      </section>
    </main>
  );
}
function Verify({ user, busy, message, onResend, onCheck, onLogout }) {
  return (
    <main className="loading-screen">
      <section className="panel session-error">
        <div className="brand-mark">
          <ShieldCheck />
        </div>
        <h1>Verify your email</h1>
        <p>
          We sent a verification link to <strong>{user.email}</strong>.
        </p>
        <p style={{ fontSize: '13px', margin: '4px 0 16px', color: '#64748b' }}>
          Please check your inbox. If you do not see the email, please check your <strong>Spam</strong> or <strong>Junk</strong> folder.
        </p>
        <div className="session-error-actions">
          <button className="primary-button" onClick={onCheck} disabled={busy}>
            <CheckCircle2 /> I verified my email
          </button>
          <button
            className="secondary-button"
            onClick={onResend}
            disabled={busy}
          >
            Resend email
          </button>
          <button className="text-button" onClick={onLogout}>
            Sign out
          </button>
        </div>
        {message && (
          <p
            className={
              typeof message === "object"
                ? message.type === "success"
                  ? "form-notice"
                  : "form-error"
                : String(message).toLowerCase().includes("sent") ||
                  String(message).toLowerCase().includes("success") ||
                  String(message).toLowerCase().includes("verified")
                ? "form-notice"
                : "form-error"
            }
          >
            {typeof message === "object" ? message.message : message}
          </p>
        )}
      </section>
    </main>
  );
}
function UserAccessBadge({ user, detailed = false }) {
  if (user?.disabled) {
    return (
      <span className="access-badge danger">
        <XCircle size={14} />
        <span>{detailed ? "Account Disabled" : "Disabled"}</span>
      </span>
    );
  }
  if (user?.unlimitedAccess) {
    return (
      <span className="access-badge success">
        <Crown size={14} />
        <span>{detailed ? "Lifetime Unlimited Access" : "Unlimited"}</span>
      </span>
    );
  }
  if (user?.subscriptionEndsAt && new Date(user.subscriptionEndsAt).getTime() > Date.now()) {
    return (
      <span className="access-badge success">
        <CheckCircle2 size={14} />
        <span>{detailed ? `Active until ${dateTime(user.subscriptionEndsAt)}` : "Active"}</span>
      </span>
    );
  }
  return (
    <span className="access-badge warning">
      <XCircle size={14} />
      <span>{detailed ? "No Active Access" : "Inactive"}</span>
    </span>
  );
}

function UserAccessStatusCard({ user, onSubscribe, onRequestAccess, accessRequest, busy }) {
  const isUnlimited = Boolean(user?.unlimitedAccess);
  const [liveExpired, setLiveExpired] = useState(false);
  const endsAt = user?.subscriptionEndsAt;

  const handleExpire = useCallback(() => {
    setLiveExpired(true);
  }, []);

  useEffect(() => {
    setLiveExpired(false);
  }, [endsAt, user?.subscriptionStatus]);

  const isActive = activeAccess(user) && !liveExpired;
  const isExpired = !isUnlimited && endsAt && (new Date(endsAt).getTime() <= Date.now() || liveExpired);

  let planTitle = "No Active Plan / Expired";
  if (isUnlimited) planTitle = "Unlimited Access";
  else if (user?.subscriptionPlanName) planTitle = user.subscriptionPlanName;
  else if (user?.subscriptionStatus === "active") planTitle = "Active Subscription";
  else if (user?.subscriptionStatus === "admin_granted") planTitle = "Admin Granted Free Access";

  return (
    <article className={`panel user-access-card ${isActive ? "active-access" : "expired-access"}`}>
      <div className="user-access-header">
        <div className="access-title-wrap">
          <span className={`access-icon-badge ${isActive ? "active" : "inactive"}`}>
            {isUnlimited || isActive ? <Crown size={22} /> : <AlertTriangle size={22} />}
          </span>
          <div>
            <span className="eyebrow">YOUR WARQ SUBSCRIPTION &amp; ACCESS</span>
            <h2>{planTitle}</h2>
          </div>
        </div>
        <div className="access-status-indicator">
          {isActive ? (
            <span className="access-badge-live">
              <span className="pulse-dot"></span> Active Access
            </span>
          ) : isExpired ? (
            <span className="access-badge-expired">
              <AlertCircle size={14} /> Access Expired
            </span>
          ) : (
            <span className="access-badge-inactive">No Active Access</span>
          )}
        </div>
      </div>

      <div className="access-details-grid">
        <div className="access-detail-item">
          <span>Current Subscription Plan</span>
          <strong>{planTitle}</strong>
        </div>

        <div className="access-detail-item">
          <span>Free Access Granted</span>
          <strong>
            {user?.grantedFreeAccessDuration
              ? formatDurationObject(user.grantedFreeAccessDuration)
              : user?.accessDuration
                ? formatDurationObject(user.accessDuration)
                : "None (Paid / Inactive)"}
          </strong>
        </div>

        <div className="access-detail-item">
          <span>Access Granted Date &amp; Time</span>
          <strong>{user?.accessStartAt ? dateTimeWithDay(user.accessStartAt) : "—"}</strong>
        </div>

        <div className="access-detail-item">
          <span>Subscription Purchase Date</span>
          <strong>{user?.subscriptionPurchasedAt ? dateTimeWithDay(user.subscriptionPurchasedAt) : "—"}</strong>
        </div>

        <div className="access-detail-item">
          <span>Subscription Expiration</span>
          <strong>
            {isUnlimited
              ? "Unlimited (Never Expires)"
              : user?.subscriptionEndsAt
                ? dateTimeWithDay(user.subscriptionEndsAt)
                : "Not Subscribed"}
          </strong>
        </div>

        <div className="access-detail-item countdown-item">
          <span>Remaining Access Time</span>
          <div className="countdown-value-wrap">
            {isUnlimited ? (
              <span className="pill success">Lifetime Unlimited</span>
            ) : endsAt ? (
              <LiveAccessCountdown
                endsAt={endsAt}
                onExpire={handleExpire}
              />
            ) : (
              <span className="pill neutral">00:00:00</span>
            )}
          </div>
        </div>
      </div>

      {!isActive && (
        <div className="access-action-footer">
          <div className="access-notice">
            <p>
              Your access period has expired. You can no longer generate, access, or share QR codes until you purchase a subscription or receive an administrator grant.
            </p>
          </div>
          <div className="access-buttons">
            {onSubscribe && (
              <button type="button" className="primary-button" onClick={onSubscribe}>
                <Crown size={16} /> Choose a Subscription Plan
              </button>
            )}
            {onRequestAccess && (
              <button
                type="button"
                className="secondary-button"
                disabled={busy || accessRequest?.status === "pending"}
                onClick={onRequestAccess}
              >
                {accessRequest?.status === "pending" ? "Free Access Request Pending" : "Request Free Access"}
              </button>
            )}
          </div>
          {onRequestAccess && (
            <div className={`access-request-note${accessRequest?.status ? ` is-${accessRequest.status}` : ""}`}>
              <Info size={15} />
              <p>
                You can send a request to the admin for free access. If the admin approves your request, you will be able to use the service. If your request is rejected, you will not be able to access the service.
                {accessRequest?.status === "pending" && " Your current request is awaiting admin review."}
                {accessRequest?.status === "rejected" && " Your previous request was rejected — you can send a new one."}
              </p>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function Subscription({ user, accessRequest, onPay, onRequestAccess, busy }) {
  const [plan, setPlan] = useState("halfYearly");
  const [provider, setProvider] = useState("bkash");
  const selectedPlan = PLANS.find((p) => p.id === plan) || PLANS[1];

  return (
    <section className="page subscription-page">
      <div className="subscription-hero">
        <span className="eyebrow">
          <Crown size={15} /> WARQ ACCESS & SUBSCRIPTION
        </span>
        <h1>
          Run your warranties
          <br />
          <i>without paperwork.</i>
        </h1>
        <p>
          Subscribe to generate, download, print, activate, and manage smart QR warranty codes.
        </p>
      </div>

      <UserAccessStatusCard
        user={user}
        accessRequest={accessRequest}
        onRequestAccess={onRequestAccess}
        busy={busy}
      />

      <div className="pricing-grid">
        {PLANS.map((item) => {
          const isSelected = plan === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`price-card${isSelected ? " selected" : ""}${item.badge ? " has-plan-badge" : ""}`}
              onClick={() => setPlan(item.id)}
            >
              {item.badge ? (
                <span
                  className={`popular-badge${item.id === "yearly" ? " best-value" : ""}`}
                >
                  {item.badge}
                </span>
              ) : null}
              <div className="price-card-header">
                <span className="plan-name">{item.name}</span>
                {item.save && <span className="save-badge">{item.save}</span>}
              </div>
              <div className="price-amount">
                <span className="currency">BDT</span>
                <h2>{item.price}</h2>
              </div>
              <p className="plan-desc">{item.desc || "Full access to all QR & warranty tools"}</p>
              <div className="plan-check">
                <div className={`custom-radio ${isSelected ? "checked" : ""}`}>
                  {isSelected && <CheckCircle2 size={15} />}
                </div>
                <span>{isSelected ? "Selected Plan" : "Select Plan"}</span>
              </div>
            </button>
          );
        })}
      </div>

      <article className="panel payment-panel">
        <div className="payment-panel-header">
          <div>
            <h2>Payment Method</h2>
            <p>Select your payment wallet for instant account activation</p>
          </div>
          <span className="secure-badge">
            <ShieldCheck size={15} /> 256-bit Secure
          </span>
        </div>

        <PaymentProviderPicker provider={provider} onChange={setProvider} showGuide />

        <div className="order-summary-box">
          <div className="summary-row">
            <span>Selected Subscription</span>
            <strong>{selectedPlan.name} Access</strong>
          </div>
          <div className="summary-row">
            <span>Payment Method</span>
            <strong className="summary-provider-tag summary-provider-logo">
              <PaymentBrandLogo provider={provider} compact />
            </strong>
          </div>
          <div className="summary-divider"></div>
          <div className="summary-row total-row">
            <span>Total Payable Amount</span>
            <strong className="total-amount">BDT {selectedPlan.price}</strong>
          </div>
        </div>

        <LoadingButton
          className="primary-button payment-submit-button full"
          busy={busy}
          loadingText="Processing payment…"
          onClick={() => onPay({ packageId: plan, provider })}
        >
          <WalletCards size={18} />
          <span>Pay BDT {selectedPlan.price} with {provider === "bkash" ? "bKash" : "Nagad"}</span>
        </LoadingButton>

        <div className="payment-security-footer">
          <div className="security-item">
            <Zap size={13} />
            <span>Instant Auto-Activation</span>
          </div>
          <div className="security-dot">·</div>
          <div className="security-item">
            <ShieldCheck size={13} />
            <span>Official Gateway</span>
          </div>
          <div className="security-dot">·</div>
          <div className="security-item">
            <BadgeCheck size={13} />
            <span>Encrypted &amp; Safe</span>
          </div>
        </div>
      </article>
    </section>
  );
}

function Dashboard({ data, navigate, onOpenProduct, reportRange, onReportRangeChange, onOpenReport, onReturnSale }) {
  const { stats = {}, products = [], sales = [], qrs = [], accessRequests = [] } = data;
  const currentRange = reportRange || defaultRange();
  const periodReport = useMemo(
    () => buildReport(sales, qrs, currentRange),
    [sales, qrs, currentRange],
  );

  const userHasAccess = activeAccess(data.user);
  const displaySales = periodReport.activitySales.length ? periodReport.activitySales.slice(0, 5) : sales.slice(0, 5);

  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogSort, setCatalogSort] = useState("revenue");
  const debouncedCatalogQuery = useDebouncedValue(catalogQuery);
  const catalogFiltered = useMemo(() => {
    const q = debouncedCatalogQuery.trim().toLowerCase();
    let list = products;
    if (q) {
      list = list.filter((product) =>
        [product.productName, product.brandName, product.productModel]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q)),
      );
    }
    const revenueOf = (item) => Number(item.revenue || 0);
    const soldOf = (item) => Number(item.sold || 0);
    const stockOf = (item) =>
      Math.max(0, (Number(item.quantity) || 0) - (Number(item.sold) || 0));
    const sorted = [...list];
    if (catalogSort === "sold")
      sorted.sort((a, b) => soldOf(b) - soldOf(a) || revenueOf(b) - revenueOf(a));
    else if (catalogSort === "name")
      sorted.sort((a, b) => String(a.productName || "").localeCompare(String(b.productName || "")));
    else if (catalogSort === "nameDesc")
      sorted.sort((a, b) => String(b.productName || "").localeCompare(String(a.productName || "")));
    else if (catalogSort === "stock")
      sorted.sort((a, b) => stockOf(b) - stockOf(a) || revenueOf(b) - revenueOf(a));
    else if (catalogSort === "returns")
      sorted.sort((a, b) => Number(b.returned || 0) - Number(a.returned || 0) || revenueOf(b) - revenueOf(a));
    else sorted.sort((a, b) => revenueOf(b) - revenueOf(a));
    return sorted;
  }, [products, debouncedCatalogQuery, catalogSort]);
  const catalog = usePagedList(catalogFiltered, CATALOG_PAGE_SIZE);

  return (
    <section className="page dashboard-page">
      {/* 1. Greeting & User Header */}
      <div className="greeting">
        <div>
          <span className="eyebrow">BUSINESS OVERVIEW &amp; ANALYTICS</span>
          <h1>Hello, {data.user?.name?.split(" ")[0] || data.user?.shopName || "there"}</h1>
          {userHasAccess ? (
            <p>
              {data.user?.unlimitedAccess
                ? "Unlimited QR generation and tracking is active"
                : `Active subscription ends ${dateTime(data.user?.subscriptionEndsAt)}`}
            </p>
          ) : null}
        </div>
        <div className="greeting-actions">
          <button className="chat-shortcut-button" onClick={() => navigate("chat")} title="Chat Board — AI assistant & admin support">
            <MessageCircle size={17} />
            <span>Chat Board</span>
          </button>
        </div>
      </div>

      {/* 2. Access / Subscription Banner — only the subscription CTA lives
          here; free-access requests are handled on the Request QR page. */}
      <UserAccessStatusCard
        user={data.user}
        onSubscribe={() => navigate("subscription")}
        accessRequest={accessRequests?.[0]}
      />

      {/* 3. Date Filtering Toolbar */}
      <PeriodToolbar
        range={currentRange}
        onChange={onReportRangeChange}
        onOpenReport={onOpenReport}
      />

      {/* 4. Compact Period Analytics (full breakdown lives in the Report page) */}
      <AnalyticsPanels report={periodReport} compact />

      {/* 5. Period Sales & Activations Activity Feed */}
      <article className="panel recent-sales">
        <div className="panel-heading">
          <div>
            <p>PERIOD ACTIVITY FEED</p>
            <h2>Sales &amp; activations ({periodReport.label})</h2>
          </div>
          <button className="text-button" onClick={() => navigate("sales")}>
            View all sales history →
          </button>
        </div>
        {displaySales.length ? (
          <div className="activity-feed-list">
            {displaySales.map((sale) => (
              <SaleRow key={sale.id} sale={sale} onReturnSale={onReturnSale} />
            ))}
          </div>
        ) : (
          <Empty
            Icon={ShoppingBag}
            title="No sales in this period"
            text="Sales recorded during this period will appear here."
          />
        )}
      </article>

      {/* 6. Product Catalog & Inventory Details */}
      <article className="panel product-list">
        <div className="panel-heading">
          <div>
            <p>PRODUCT CATALOG</p>
            <h2>Generated products &amp; stock overview</h2>
            <small className="panel-heading-count">
              {products.length} product{products.length === 1 ? "" : "s"} total
              {catalogFiltered.length !== products.length
                ? ` · ${catalogFiltered.length} matching`
                : ""}
            </small>
          </div>
          <button className="text-button" onClick={() => navigate("qrs")}>
            Manage QR inventory →
          </button>
        </div>
        {products.length ? (
          <>
            <div className="data-toolbar">
              <DataSearchInput
                value={catalogQuery}
                onChange={setCatalogQuery}
                placeholder="Search products or brands"
                label="Search product catalog"
              />
              <DataToolbarSelect
                label="Sort"
                value={catalogSort}
                onChange={setCatalogSort}
                options={[
                  ["revenue", "Top revenue"],
                  ["sold", "Most sold"],
                  ["stock", "Most stock left"],
                  ["name", "Name A → Z"],
                  ["nameDesc", "Name Z → A"],
                  ["returns", "Most returned"],
                ]}
              />
            </div>
            {catalog.slice.length ? (
              <>
                <div className="catalog-grid">
                  {catalog.slice.map((product) => {
                    const total = Math.max(0, Number(product.quantity) || 0);
                    const sold = Math.max(0, Number(product.sold) || 0);
                    const stockLeft = Math.max(0, total - sold);
                    const stockPct = total ? Math.min(100, Math.round((sold / total) * 100)) : 0;
                    return (
                      <button
                        className="product-card"
                        key={product.id}
                        onClick={() => onOpenProduct(product)}
                      >
                        <span className="product-card-top">
                          <span className="product-card-avatar" aria-hidden="true">
                            {String(product.productName || "P").trim().charAt(0).toUpperCase() || "P"}
                          </span>
                          <span className="product-card-id">
                            <strong className="product-card-name" title={product.productName}>{product.productName}</strong>
                            <small className="product-card-brand">
                              {[product.brandName, product.productModel].filter(Boolean).join(" · ") || "Standard Model"}
                            </small>
                          </span>
                          <span className="product-card-price">
                            {product.defaultPrice != null ? (
                              <small className="product-card-price-label">Price: BDT {money(product.defaultPrice)}</small>
                            ) : (
                              <small className="product-card-price-label">Revenue</small>
                            )}
                            <strong className="product-card-revenue">BDT {money(product.revenue)}</strong>
                          </span>
                        </span>
                        <span className="product-card-divider" aria-hidden="true" />
                        <span className="product-card-foot">
                          <span className="product-card-stock">
                            <strong>{sold}</strong>
                            <span className="product-card-stock-total">/ {total} sold</span>
                          </span>
                          <span className={`stock-badge ${stockLeft === 0 ? "out" : stockLeft <= 5 ? "low" : "ok"}`}>
                            {stockLeft === 0 ? "Out of stock" : `${stockLeft} in stock`}
                          </span>
                          {product.returned ? (
                            <span className="pill warning">{product.returned} returned</span>
                          ) : null}
                          {product.warrantyDuration ? (
                            <span className="product-card-warranty-pill" title="Warranty Duration">
                              <ShieldCheck size={11} /> {warrantyText(product.warrantyDuration)}
                            </span>
                          ) : null}
                        </span>
                        <span className="product-card-bar" aria-hidden="true">
                          <span className={stockPct >= 100 ? "full" : ""} style={{ width: `${stockPct}%` }} />
                        </span>
                      </button>
                    );
                  })}
                </div>
                <Pagination
                  page={catalog.page}
                  pageCount={catalog.pageCount}
                  total={catalog.total}
                  pageSize={CATALOG_PAGE_SIZE}
                  start={catalog.start}
                  onPage={catalog.setPage}
                  itemLabel="products"
                />
              </>
            ) : (
              <Empty
                Icon={Search}
                title="No matching products"
                text="Try a different product or brand name."
              />
            )}
          </>
        ) : (
          <Empty
            Icon={ShoppingBag}
            title="No products yet"
            text="Generate QR codes to add products to your catalog."
          />
        )}
      </article>
    </section>
  );
}

function ReturnSaleControls({ sale, onReturnSale, compact = false, actionClass }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const canReturn = sale?.status === "activated" && typeof onReturnSale === "function";
  if (sale?.status === "returned") return null;
  if (!canReturn) return null;
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await onReturnSale({ saleId: sale.id || sale.saleId, code: sale.code, reason: reason.trim() });
      setOpen(false);
      setReason("");
    } finally {
      setBusy(false);
    }
  };
  if (!open) {
    return (
      <div className={`return-sale-actions no-print${compact ? " return-sale-inline" : ""}`}>
        <button type="button" className={actionClass || "small-action danger-action"} onClick={() => setOpen(true)}>
          <RotateCcw size={12} /> Mark as Returned
        </button>
      </div>
    );
  }
  return (
    <form className={`return-sale-panel no-print${compact ? " return-sale-panel-inline" : ""}`} onSubmit={submit}>
      <p>Mark this activated product as returned? It will be removed from sales, revenue, and profit, and its warranty will be voided. This QR cannot be sold again.</p>
      <label>
        Return reason (optional)
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Damaged, wrong item, customer request…"
          maxLength={1000}
        />
      </label>
      <div className="return-sale-buttons">
        <button type="button" className="secondary-button" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button type="submit" className="primary-button" disabled={busy}>
          {busy ? "Returning…" : "Confirm return"}
        </button>
      </div>
    </form>
  );
}

function saleStatusPill(sale) {
  const isReturnedSale = sale.status === "returned";
  const isActivated = !isReturnedSale && (sale.status === "activated" || Boolean(sale.activatedAt));
  const isExpired = isActivated && sale.warrantyExpiresAt && new Date(sale.warrantyExpiresAt).getTime() <= Date.now();
  const hasWarranty = Boolean(sale.warrantyDuration);
  if (isReturnedSale) {
    return (
      <span className="pill danger">
        <RotateCcw size={12} /> Returned · Warranty Voided
      </span>
    );
  }
  if (!isActivated) {
    return (
      <span className="pill warning">
        <Clock size={12} /> Awaiting Activation
      </span>
    );
  }
  if (!hasWarranty) return <span className="pill neutral">No Warranty</span>;
  return isExpired ? (
    <span className="pill danger">
      <AlertTriangle size={12} /> Warranty Expired
    </span>
  ) : (
    <span className="pill success">
      <CheckCircle2 size={12} /> Active Warranty
    </span>
  );
}

function SaleRow({ sale, onReturnSale }) {
  const [copied, setCopied] = useState(false);
  const isReturnedSale = sale.status === "returned";
  const isActivated = !isReturnedSale && (sale.status === "activated" || Boolean(sale.activatedAt));
  const isExpired = isActivated && sale.warrantyExpiresAt && new Date(sale.warrantyExpiresAt).getTime() <= Date.now();
  const hasWarranty = Boolean(sale.warrantyDuration);

  const handleCopyCode = (e) => {
    e.stopPropagation();
    if (!sale.code) return;
    navigator.clipboard?.writeText(sale.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="sale-card-enhanced">
      <div className="sale-card-top">
        <div className="sale-qr-preview" title={`QR code: ${sale.code}`}>
          <QrImage code={sale.code} size={76} />
          <span>Product QR</span>
        </div>
        <div className="sale-title-wrap">
          <div className="sale-title-row">
            <h3 className="sale-product-name">{sale.productName}</h3>
            <span className="sale-price-badge">
              BDT {money(sale.actualPrice ?? sale.defaultPrice)}
            </span>
          </div>
          <div className="sale-meta-subrow">
            <button
              type="button"
              className={`sale-qr-id-copy-btn ${copied ? "is-copied" : ""}`}
              onClick={handleCopyCode}
              title="Click to copy QR code"
            >
              <span>{sale.code}</span>
              {copied ? <Check size={11} color="#059669" /> : <Copy size={11} />}
            </button>
            {sale.serial ? <span className="sale-serial-badge">#{sale.serial}</span> : null}
            {saleStatusPill(sale)}
            {sale.customerName && (
              <span className="sale-customer-badge" title="Customer">
                <UserRound size={12} /> {sale.customerName}
                {sale.customerPhone ? (
                  <a
                    href={`tel:${sale.customerPhone}`}
                    className="customer-phone-link"
                    onClick={(e) => e.stopPropagation()}
                    title={`Call ${sale.customerPhone}`}
                  >
                    · {sale.customerPhone}
                  </a>
                ) : null}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="sale-details-grid">
        {sale.customerName && (
          <div className="sale-detail-col sale-detail-customer">
            <span className="detail-col-label">Customer Details</span>
            <strong className="detail-col-value">
              {sale.customerName}
              {sale.customerPhone ? (
                <a
                  href={`tel:${sale.customerPhone}`}
                  className="customer-phone-link"
                  title={`Call ${sale.customerPhone}`}
                >
                  {" "}({sale.customerPhone})
                </a>
              ) : null}
            </strong>
          </div>
        )}

        <div className="sale-detail-col">
          <span className="detail-col-label">Sold Date &amp; Time</span>
          <strong className="detail-col-value">{dateTimeWithDay(sale.saleDate || sale.soldAt)}</strong>
        </div>

        <div className="sale-detail-col">
          <span className="detail-col-label">Activation Status</span>
          <strong className="detail-col-value">
            {isReturnedSale ? (
              <span className="status-highlight pending">
                <RotateCcw size={13} /> Returned
              </span>
            ) : isActivated ? (
              <span className="status-highlight active">
                <Check size={13} /> Activated
              </span>
            ) : (
              <span className="status-highlight pending">
                <Clock size={13} /> Awaiting Activation
              </span>
            )}
          </strong>
        </div>

        <div className="sale-detail-col">
          <span className="detail-col-label">Activation Date &amp; Time</span>
          <strong className="detail-col-value">
            {sale.activatedAt ? dateTimeWithDay(sale.activatedAt) : "Not yet activated"}
          </strong>
        </div>

        <div className="sale-detail-col">
          <span className="detail-col-label">Warranty Duration</span>
          <strong className="detail-col-value">{warrantyText(sale.warrantyDuration)}</strong>
        </div>

        <div className="sale-detail-col">
          <span className="detail-col-label">Expiration Date &amp; Time</span>
          <strong className="detail-col-value">
            {hasWarranty
              ? (sale.warrantyExpiresAt ? dateTimeWithDay(sale.warrantyExpiresAt) : "Starts on activation")
              : "No Warranty"}
          </strong>
        </div>

        <div className="sale-detail-col countdown-detail-col">
          <span className="detail-col-label">Remaining Warranty Time</span>
          <div className="detail-col-timer">
            <LiveWarrantyTimer
              expiresAt={sale.warrantyExpiresAt}
              duration={sale.warrantyDuration}
              status={sale.status || (sale.activatedAt ? "activated" : "pending_activation")}
            />
          </div>
        </div>
        {isReturnedSale && (
          <div className="sale-detail-col sale-detail-returned">
            <span className="detail-col-label">Returned</span>
            <strong className="detail-col-value">
              {dateTimeWithDay(sale.returnedAt)}
              {sale.returnReason ? ` · ${sale.returnReason}` : ""}
            </strong>
          </div>
        )}
      </div>
      <ReturnSaleControls sale={sale} onReturnSale={onReturnSale} />
    </div>
  );
}
function ProductDetail({ product, data, onClose }) {
  const codes = data.qrs.filter(
    (qr) => qrProductKey(qr) === product.id,
  );
  const sales = data.sales.filter(
    (sale) => sale.productName === product.productName,
  );
  return (
    <section className="page">
      <div className="page-title row-title">
        <div>
          <span className="eyebrow">PRODUCT DETAILS</span>
          <h1>{product.productName}</h1>
          <p>
            {product.quantity} QR codes · {product.sold} sold ·{" "}
            {product.activated} activated
          </p>
        </div>
        <button className="secondary-button" onClick={onClose}>
          Back
        </button>
      </div>
      <div className="stats-grid">
        <Card
          label="Revenue"
          value={`BDT ${money(product.revenue)}`}
          Icon={WalletCards}
        />
        <Card
          label="Profit"
          value={`BDT ${money(product.profit)}`}
          Icon={CircleDollarSign}
          color="purple"
        />
        <Card
          label="Active warranties"
          value={product.activeWarranties}
          Icon={BadgeCheck}
        />
        <Card
          label="No warranty"
          value={product.noWarranty}
          Icon={QrCode}
          color="blue"
        />
      </div>
      <article className="panel recent-sales">
        <h2>QR codes</h2>
        {codes.map((qr) => (
          <div className="sale-row" key={qr.id}>
            <div className="product-initial">#{qr.serial}</div>
            <div className="sale-info">
              <strong>{qr.code}</strong>
              <span>
                {qr.status} · {warrantyText(qr.warrantyDuration)}
              </span>
            </div>
            <Lifetime qr={qr} />
          </div>
        ))}
      </article>
      <article className="panel recent-sales">
        <h2>Sale history</h2>
        {sales.length ? (
          sales.map((sale) => <SaleRow key={sale.id} sale={sale} />)
        ) : (
          <Empty
            Icon={ShoppingBag}
            title="No sales"
            text="Sales will appear when codes are sold."
          />
        )}
      </article>
    </section>
  );
}
function resolveUnitProductId(...sources) {
  for (const source of sources) {
    if (!source) continue;
    if (source.productId) return String(source.productId);
    const composite = String(source.id || "");
    if (composite.includes(":")) {
      const candidate = composite.slice(composite.indexOf(":") + 1).trim();
      if (candidate && candidate !== String(source.productName || "")) return candidate;
    }
  }
  return null;
}

function EnrichedProductDetail({ product, data, focusQrCode, onClose, onPrintSheets, onPrintSingle, onDownloadQrs, onDownloadSingle, onReturnSale }) {
  const codes = data.qrs.filter(
    (qr) =>
      String(qr.requestId) + ":" + (qr.productId || qr.productName) ===
      product.id,
  );
  const sales = data.sales.filter(
    (sale) =>
      String(sale.requestId) + ":" + (sale.productId || sale.productName) ===
      product.id,
  );
  const focusedQr =
    (focusQrCode && codes.find((qr) => qr.code === focusQrCode)) ||
    (focusQrCode && data.qrs.find((qr) => qr.code === focusQrCode)) ||
    null;
  const details = focusedQr || codes[0] || product;
  const unitProductId = resolveUnitProductId(focusedQr, details, product, ...codes);
  const uniqueCode =
    focusedQr?.code ||
    (codes.length === 1 ? codes[0]?.code : null) ||
    null;
  const uniqueCodeLabel =
    uniqueCode ||
    (codes.length > 1 ? `${codes.length} unique codes — see list below` : "Not recorded");
  const orderedCodes = focusedQr
    ? [focusedQr, ...codes.filter((qr) => qr.code !== focusedQr.code)]
    : codes;

  // A QR unit counts as sold once it was activated / has a recorded price.
  // Prefer the scanned unit so the sale price always reflects that specific QR;
  // otherwise fall back to the first sold unit in this product so the details
  // page never shows the original list price as the sold price.
  const isSoldUnit = (unit) =>
    unit != null &&
    (unit.actualPrice != null ||
      unit.status === "activated" ||
      unit.status === "sold" ||
      Boolean(unit.activatedAt) ||
      Boolean(unit.soldAt));
  const soldUnitForPrice =
    focusedQr ||
    codes.find(isSoldUnit) ||
    null;
  const showSalePrice = soldUnitForPrice != null && isSoldUnit(soldUnitForPrice);
  const salePriceValue = soldUnitForPrice
    ? soldUnitForPrice.actualPrice ?? soldUnitForPrice.defaultPrice
    : null;

  const [qrQuery, setQrQuery] = useState("");
  const [qrStatusFilter, setQrStatusFilter] = useState("all");
  const [copiedCode, setCopiedCode] = useState("");
  const [saleQuery, setSaleQuery] = useState("");
  const debouncedQrQuery = useDebouncedValue(qrQuery);
  const debouncedSaleQuery = useDebouncedValue(saleQuery);

  const copyQrCode = (code) => {
    if (!code) return;
    navigator.clipboard?.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(""), 2000);
  };

  const unusedCount = useMemo(
    () => codes.filter((qr) => !qr.soldAt && qr.status !== "returned" && qr.status !== "activated").length,
    [codes],
  );
  const soldCount = useMemo(
    () => codes.filter((qr) => qr.soldAt || qr.status === "sold" || qr.status === "activated").length,
    [codes],
  );
  const activeCount = useMemo(
    () => codes.filter((qr) => qr.warrantyExpiresAt && new Date(qr.warrantyExpiresAt).getTime() > Date.now()).length,
    [codes],
  );
  const returnedCount = useMemo(
    () => codes.filter((qr) => qr.status === "returned").length,
    [codes],
  );

  const filteredCodes = useMemo(() => {
    const q = debouncedQrQuery.trim().toLowerCase();
    let list = orderedCodes;
    if (qrStatusFilter === "available") {
      list = list.filter((qr) => !qr.soldAt && qr.status !== "returned" && qr.status !== "activated");
    } else if (qrStatusFilter === "sold") {
      list = list.filter((qr) => qr.soldAt || qr.status === "sold" || qr.status === "activated");
    } else if (qrStatusFilter === "active") {
      list = list.filter((qr) => qr.warrantyExpiresAt && new Date(qr.warrantyExpiresAt).getTime() > Date.now());
    } else if (qrStatusFilter === "returned") {
      list = list.filter((qr) => qr.status === "returned");
    }
    if (q) {
      list = list.filter((qr) =>
        [qr.code, String(qr.serial || ""), qr.customerName, qr.customerPhone]
          .filter(Boolean)
          .some((val) => String(val).toLowerCase().includes(q)),
      );
    }
    return list;
  }, [orderedCodes, debouncedQrQuery, qrStatusFilter]);

  const pagedCodes = usePagedList(filteredCodes, 20);

  const filteredSales = useMemo(() => {
    const q = debouncedSaleQuery.trim().toLowerCase();
    if (!q) return sales;
    return sales.filter((sale) =>
      [
        sale.code,
        String(sale.serial || ""),
        sale.productName,
        sale.customerName,
        sale.customerPhone,
        sale.status,
        sale.returnReason,
      ]
        .filter(Boolean)
        .some((val) => String(val).toLowerCase().includes(q)),
    );
  }, [sales, debouncedSaleQuery]);
  return (
    <section className="page product-details-page">
      <div className="page-title row-title">
        <div>
          <span className="eyebrow">PRODUCT DETAILS</span>
          <h1>{product.productName}</h1>
          <p>
            {product.quantity} QR codes · {product.sold} sold ·{" "}
            {product.activated} activated · {product.returned || 0} returned
          </p>
        </div>
        <div className="product-details-toolbar">
          {codes.length > 0 && (
            <>
              <button
                type="button"
                className="secondary-button"
                onClick={() => onPrintSheets ? onPrintSheets(codes, `WarQ Stickers - ${product.productName}`) : printStickerSheets(codes, `WarQ Stickers - ${product.productName}`)}
              >
                <Printer size={15} /> Print stickers ({codes.length})
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => onDownloadQrs ? onDownloadQrs(codes, `WarQ_Stickers_${product.productName}`) : downloadAllQrs(codes, `WarQ_Stickers_${product.productName}`)}
              >
                <Download size={15} /> Download all ({codes.length})
              </button>
            </>
          )}
          <button className="secondary-button" onClick={onClose}>
            Back
          </button>
        </div>
      </div>
      <div className="stats-grid">
        <Card
          label="Revenue"
          value={"BDT " + money(product.revenue)}
          Icon={WalletCards}
        />
        <Card
          label="Profit"
          value={"BDT " + money(product.profit)}
          Icon={CircleDollarSign}
          color="purple"
        />
        <Card
          label="Active warranties"
          value={product.activeWarranties}
          Icon={BadgeCheck}
        />
        <Card
          label="No warranty"
          value={product.noWarranty}
          Icon={QrCode}
          color="blue"
        />
        <Card
          label="Returned"
          value={product.returned || 0}
          Icon={RotateCcw}
          color="orange"
        />
      </div>
      <article className="panel product-details-card">
        <div className="panel-heading">
          <div>
            <p>PRODUCT INFORMATION</p>
            <h2>{focusedQr ? "Scanned unit and shop details" : "Product and shop details"}</h2>
          </div>
        </div>
        <div className="product-details-grid">
          <div>
            <span>Unit ID / Product ID</span>
            <strong>{unitProductId || "Not recorded"}</strong>
          </div>
          <div>
            <span>Unique Code</span>
            <strong className="code-font">{uniqueCodeLabel}</strong>
          </div>
          <div>
            <span>Serial Number</span>
            <strong>
              {focusedQr
                ? `#${focusedQr.serial}`
                : details.serial != null && codes.length <= 1
                  ? `#${details.serial}`
                  : codes.length > 1
                    ? "Multiple units"
                    : "Not recorded"}
            </strong>
          </div>
          <div>
            <span>Product Name</span>
            <strong>{details.productName || product.productName}</strong>
          </div>
          {(details.productModel || product.productModel) && (
            <div>
              <span>Product Model</span>
              <strong>{details.productModel || product.productModel}</strong>
            </div>
          )}
          {(details.brandName || product.brandName) && (
            <div>
              <span>Brand</span>
              <strong>{details.brandName || product.brandName}</strong>
            </div>
          )}
          <div>
            <span>Shop</span>
            <strong>{details.shopName || product.shopName || "Not recorded"}</strong>
          </div>
          <div>
            <span>Shop address</span>
            <strong>{details.shopAddress || product.shopAddress || "Not recorded"}</strong>
          </div>
          {focusedQr &&
            (focusedQr.customerName ||
              focusedQr.customerPhone ||
              focusedQr.customerAddress ||
              focusedQr.customerNotes) && (
              <>
                {focusedQr.customerName && (
                  <div>
                    <span>Customer Name</span>
                    <strong>{focusedQr.customerName}</strong>
                  </div>
                )}
                {focusedQr.customerPhone && (
                  <div>
                    <span>Customer Mobile</span>
                    <strong>{focusedQr.customerPhone}</strong>
                  </div>
                )}
                {focusedQr.customerAddress && (
                  <div className="wide">
                    <span>Customer Address</span>
                    <strong>{focusedQr.customerAddress}</strong>
                  </div>
                )}
                {focusedQr.customerNotes && (
                  <div className="wide">
                    <span>Customer Notes</span>
                    <strong>{focusedQr.customerNotes}</strong>
                  </div>
                )}
              </>
            )}
          <div>
            <span>Product price</span>
            <strong>
              {details.defaultPrice == null && product.defaultPrice == null
                ? "Not recorded"
                : "BDT " + money(details.defaultPrice ?? product.defaultPrice)}
            </strong>
          </div>
          {showSalePrice && salePriceValue != null && (
            <div>
              <span>Sale price</span>
              <strong>BDT {money(salePriceValue)}</strong>
            </div>
          )}
          <div>
            <span>Unit cost</span>
            <strong>
              {details.costPrice == null && product.costPrice == null
                ? "Not recorded"
                : "BDT " + money(details.costPrice ?? product.costPrice)}
            </strong>
          </div>
          <div>
            <span>Warranty</span>
            <strong>{warrantyText(details.warrantyDuration || product.warrantyDuration)}</strong>
          </div>
          {focusedQr && (
            <div>
              <span>Status</span>
              <strong>{focusedQr.status === "returned" ? "Returned" : focusedQr.status}</strong>
            </div>
          )}
          <div className="wide">
            <span>Product notes</span>
            <strong>{details.notes || product.notes || "No notes recorded"}</strong>
          </div>
        </div>
      </article>
      <article className="panel recent-sales product-qr-list">
        <div className="panel-heading product-qr-list-heading">
          <div>
            <p>QR CODES</p>
            <h2>{codes.length} total QR code{codes.length === 1 ? "" : "s"}</h2>
          </div>
        </div>

        {codes.length > 0 && (
          <div className="product-qr-toolbar">
            <DataSearchInput
              value={qrQuery}
              onChange={setQrQuery}
              placeholder="Search code, serial #, customer…"
              label="Search QR codes"
            />
            <div className="filter-chips-row">
              <button
                type="button"
                className={`filter-chip ${qrStatusFilter === "all" ? "active" : ""}`}
                onClick={() => setQrStatusFilter("all")}
              >
                All ({codes.length})
              </button>
              <button
                type="button"
                className={`filter-chip ${qrStatusFilter === "available" ? "active" : ""}`}
                onClick={() => setQrStatusFilter("available")}
              >
                In Stock ({unusedCount})
              </button>
              <button
                type="button"
                className={`filter-chip ${qrStatusFilter === "sold" ? "active" : ""}`}
                onClick={() => setQrStatusFilter("sold")}
              >
                Sold ({soldCount})
              </button>
              <button
                type="button"
                className={`filter-chip ${qrStatusFilter === "active" ? "active" : ""}`}
                onClick={() => setQrStatusFilter("active")}
              >
                Active Warranty ({activeCount})
              </button>
              {returnedCount > 0 && (
                <button
                  type="button"
                  className={`filter-chip ${qrStatusFilter === "returned" ? "active" : ""}`}
                  onClick={() => setQrStatusFilter("returned")}
                >
                  Returned ({returnedCount})
                </button>
              )}
            </div>
          </div>
        )}

        {pagedCodes.slice.length ? (
          <>
            <div className="product-qr-rows-container">
              {pagedCodes.slice.map((qr) => (
                <div
                  className={`product-qr-row${focusedQr?.code === qr.code ? " is-focused" : ""}`}
                  key={qr.id}
                >
                  <div className="product-initial">#{qr.serial}</div>
                  <div className="sale-info product-qr-info">
                    <div className="qr-code-copy-row">
                      <strong className="product-qr-code">{qr.code}</strong>
                      <button
                        type="button"
                        className="copy-btn-inline"
                        onClick={() => copyQrCode(qr.code)}
                        title="Copy QR code"
                      >
                        {copiedCode === qr.code ? <Check size={12} color="#059669" /> : <Copy size={12} />}
                      </button>
                    </div>
                    <span>
                      {qr.status} · {warrantyText(qr.warrantyDuration)}
                    </span>
                    {focusedQr?.code === qr.code && (
                      <small className="scanned-qr-label">Scanned QR</small>
                    )}
                  </div>
                  <div className="product-qr-meta">
                    <Lifetime qr={qr} compact />
                    <div className="product-qr-actions">
                      <button
                        type="button"
                        className="small-action"
                        onClick={() => onPrintSingle ? onPrintSingle(qr) : printSingleQr(qr)}
                      >
                        <Printer size={12} /> Print
                      </button>
                      <button
                        type="button"
                        className="small-action"
                        onClick={() => onDownloadSingle ? onDownloadSingle(qr) : downloadQr(qr.code, qr.productName, qr.serial)}
                      >
                        <Download size={12} /> Download
                      </button>
                      <ReturnSaleControls
                        compact
                        sale={{ id: qr.saleId, code: qr.code, status: qr.status }}
                        onReturnSale={onReturnSale}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <Pagination
              page={pagedCodes.page}
              pageCount={pagedCodes.pageCount}
              total={pagedCodes.total}
              pageSize={20}
              start={pagedCodes.start}
              onPage={pagedCodes.setPage}
              itemLabel="QR codes"
            />
          </>
        ) : (
          <Empty
            Icon={QrCode}
            title={codes.length ? "No matching QR codes" : "No QR codes"}
            text={codes.length ? "Try a different search or filter." : "QR codes for this product will appear here."}
          />
        )}
      </article>
      <article className="panel recent-sales">
        <div className="sale-history-heading">
          <h2>Sale history</h2>
          {sales.length > 0 && (
            <DataSearchInput
              value={saleQuery}
              onChange={setSaleQuery}
              placeholder="Search code, customer, phone..."
              label="Search sale history"
            />
          )}
        </div>
        {sales.length ? (
          filteredSales.length ? (
            <div className="product-sale-history-scroll">
              {filteredSales.map((sale) => <SaleRow key={sale.id} sale={sale} onReturnSale={onReturnSale} />)}
            </div>
          ) : (
            <Empty
              Icon={Search}
              title="No matching sales"
              text="Try a different search term."
            />
          )
        ) : (
          <Empty
            Icon={ShoppingBag}
            title="No sales"
            text="Sales will appear when codes are sold."
          />
        )}
      </article>
    </section>
  );
}

function RequestForm({ data, onCreate, busy }) {
  const fresh = () => ({
    productName: "",
    productModel: "",
    brandName: "",
    quantity: 1,
    defaultPrice: "",
    costPrice: "",
    notes: "",
    warrantyDuration: {
      months: "",
      days: "",
      hours: "",
      minutes: "",
      seconds: "",
    },
  });
  const [shopName, setShopName] = useState(data.user?.shopName || ""),
    [shopAddress, setShopAddress] = useState(data.user?.shopAddress || ""),
    [items, setItems] = useState([fresh()]);
  const [fulfillment, setFulfillment] = useState('digital');
  const rate = data.pricing?.perStickerPrice || 50 / 300;
  const count = items.reduce(
    (sum, item) => sum + Math.max(0, Number(item.quantity || 0)),
    0,
  );
  const stickerSubtotal = count * rate;
  const deliveryChargeRate = Math.max(0, Number(data.pricing?.deliveryCharge) || 0);
  const deliveryCharge = fulfillment === 'physical' ? deliveryChargeRate : 0;
  const total = stickerSubtotal + deliveryCharge;
  const update = (index, updateValue) =>
    setItems(
      items.map((item, i) =>
        i === index ? { ...item, ...updateValue } : item,
      ),
    );
  const submit = async (event) => {
    event.preventDefault();
    await onCreate({ shopName, shopAddress, products: items, fulfillment });
    setShopName("");
    setShopAddress("");
    setItems([fresh()]);
    setFulfillment('digital');
  };
  return (
    <form className="panel request-form" onSubmit={submit}>
      <div className="form-heading">
        <PackagePlus />
        <div>
          <h2>Product-model QR request</h2>
          <p>Product name, model, and company/brand are required. The model becomes the folder name.</p>
        </div>
      </div>
      <div className="form-grid">
        <label>
          Shop name *
          <input
            required
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
          />
        </label>
        <label>
          Shop address *
          <input
            required
            value={shopAddress}
            onChange={(e) => setShopAddress(e.target.value)}
          />
        </label>
      </div>
      <fieldset className='fulfillment-picker'>
        <legend>How would you like to receive the QR stickers?</legend>
        <label className={fulfillment === 'digital' ? 'selected' : ''}>
          <input type='radio' name='fulfillment' checked={fulfillment === 'digital'} onChange={() => setFulfillment('digital')} />
          <span><Download /> Digital sheets</span>
          <small>Generate now, then download or print your QR sticker sheets.</small>
        </label>
        <label className={fulfillment === 'physical' ? 'selected' : ''}>
          <input type='radio' name='fulfillment' checked={fulfillment === 'physical'} onChange={() => setFulfillment('physical')} />
          <span><PackagePlus /> Physical sticker delivery</span>
          <small>Pay for stickers plus the fixed BDT {money(deliveryChargeRate)} delivery charge.</small>
        </label>
      </fieldset>
      {items.map((item, index) => (
        <fieldset className="product-editor" key={index}>
          <legend>Product {index + 1}</legend>
          <div className="form-grid">
            <label>
              Product name *
              <input
                required
                value={item.productName}
                onChange={(e) => update(index, { productName: e.target.value })}
              />
            </label>
            <label>
              Product model *
              <input required placeholder="e.g. USB 2.0" value={item.productModel} onChange={(e) => update(index, { productModel: e.target.value })} />
            </label>
            <label>
              Company / brand name *
              <input required placeholder="e.g. Xiaomi" value={item.brandName} onChange={(e) => update(index, { brandName: e.target.value })} />
            </label>
            <label>
              QR quantity *
              <input
                required
                type="number"
                min="1"
                value={item.quantity}
                onChange={(e) => update(index, { quantity: e.target.value })}
              />
            </label>
            <label>
              Sale price (optional)
              <input
                type="number"
                min="0"
                value={item.defaultPrice}
                onChange={(e) =>
                  update(index, { defaultPrice: e.target.value })
                }
              />
            </label>
            <label>
              Unit cost (optional, for profit)
              <input
                type="number"
                min="0"
                value={item.costPrice}
                onChange={(e) => update(index, { costPrice: e.target.value })}
              />
            </label>
            <div className="wide warranty-preset-row">
              <span className="preset-label">Quick Warranty Presets:</span>
              <div className="preset-chips">
                {[
                  ["No Warranty", { months: "", days: "", hours: "", minutes: "", seconds: "" }],
                  ["1 Month", { months: "1", days: "", hours: "", minutes: "", seconds: "" }],
                  ["3 Months", { months: "3", days: "", hours: "", minutes: "", seconds: "" }],
                  ["6 Months", { months: "6", days: "", hours: "", minutes: "", seconds: "" }],
                  ["1 Year", { months: "12", days: "", hours: "", minutes: "", seconds: "" }],
                  ["2 Years", { months: "24", days: "", hours: "", minutes: "", seconds: "" }],
                ].map(([presetLabel, presetVal]) => (
                  <button
                    key={presetLabel}
                    type="button"
                    className="warranty-preset-chip"
                    onClick={() => update(index, { warrantyDuration: presetVal })}
                  >
                    {presetLabel}
                  </button>
                ))}
              </div>
            </div>
            {Object.keys(item.warrantyDuration).map((key) => (
              <label key={key}>
                Warranty {key}
                <input
                  type="number"
                  min="0"
                  value={item.warrantyDuration[key]}
                  onChange={(e) =>
                    update(index, {
                      warrantyDuration: {
                        ...item.warrantyDuration,
                        [key]: e.target.value,
                      },
                    })
                  }
                />
              </label>
            ))}
            <label className="wide">
              Product notes (optional)
              <textarea
                value={item.notes}
                onChange={(e) => update(index, { notes: e.target.value })}
              />
            </label>
          </div>
          {items.length > 1 && (
            <button
              type="button"
              className="text-button"
              onClick={() => setItems(items.filter((_, i) => i !== index))}
            >
              Remove product
            </button>
          )}
        </fieldset>
      ))}
      <div className="request-total">
        <div>
          <span>
            {count} QR codes · folder: {items[0]?.productModel || "Product model"}
          </span>
          {fulfillment === "physical" ? (
            <>
              <strong>BDT {money(total)}</strong>
              <small>Stickers: BDT {money(stickerSubtotal)} / Delivery: BDT {money(deliveryCharge)}</small>
            </>
          ) : (
            <small className="request-digital-note">
              Digital delivery — no payment required. Your printable sheets are generated automatically.
            </small>
          )}
        </div>
        <LoadingButton type="submit" busy={busy} loadingText="Submitting request…">
          Submit request
        </LoadingButton>
      </div>
    </form>
  );
}
function Requests({ data, onCreate, onPay, onUpgrade, onPrintSheets, onDownloadQrs, onDelete, busy }) {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState('bkash');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const rate = data.pricing?.perStickerPrice || 50 / 300;
  const packSize = Math.max(1, Number(data.pricing?.stickerPackSize) || 300);
  const packPrice = Math.max(0, Number(data.pricing?.stickerPackPrice) || 0);
  const deliveryCharge = Math.max(0, Number(data.pricing?.deliveryCharge) || 0);
  return (
    <section className="page">
      <div className="page-title row-title">
        <div>
          <span className="eyebrow">QR STICKER ORDERS</span>
          <h1>Your requests</h1>
          <p>QRs are generated automatically. Digital sheets are ready to print; physical orders include delivery tracking.</p>
        </div>
        <button className="primary-button" onClick={() => setOpen(!open)}>
          <PackagePlus /> New request
        </button>
      </div>
      {open && (
        <RequestForm
          data={data}
          onCreate={async (form) => {
            await onCreate(form);
            setOpen(false);
          }}
          busy={busy}
        />
      )}
      <div className="request-list">
        {data.requests.length ? (
          data.requests.map((item) => (
            <article className="panel request-card" key={item.id}>
              <div className="request-icon">
                <QrCode />
              </div>
              <div>
                <h2>
                  {item.productCount} products · {item.totalQrCodes} QR codes
                </h2>
                <p>
                  {item.shopName} · {item.shopAddress}
                </p>
                <small>
                  {item.products
                    ?.map(
                      (product) =>
                        `${product.productName} (${warrantyText(product.warrantyDuration)})`,
                    )
                    .join(" · ")}
                </small>
                {(() => {
                  const itemQrs = data.qrs?.filter((q) => String(q.requestId) === String(item.id)) || [];
                  if (!itemQrs.length) {
                    if (item.status === 'generating') {
                      return (
                        <div style={{ marginTop: "10px" }}>
                          <span className="pill warning"><LoaderCircle className="spin" size={12} /> Generating {item.totalQrCodes} QR codes…</span>
                        </div>
                      );
                    }
                    return null;
                  }
                  return (
                    <div style={{ display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="small-action"
                        onClick={() => onPrintSheets ? onPrintSheets(itemQrs, `WarQ Stickers - ${item.shopName || "Order"}`) : printStickerSheets(itemQrs, `WarQ Stickers - ${item.shopName || "Order"}`)}
                      >
                        <Printer size={13} /> Print sticker sheet ({itemQrs.length})
                      </button>
                    </div>
                  );
                })()}
              </div>
              <div className="request-side">
                <span className="pill neutral">{item.status}</span>
                <span className="pill warning">
                  {item.paymentStatus} / {item.deliveryStatus}
                </span>
                <strong>BDT {money(item.totalPrice)}</strong>
                {item.paymentStatus !== 'paid' && (
                  <button
                    type="button"
                    className="small-action danger-action request-delete-btn"
                    onClick={() => setConfirmDelete(item)}
                  >
                    <Trash2 size={13} /> Delete request
                  </button>
                )}
              </div>
              {item.fulfillment === 'digital' && item.status === 'generated' && (
                <div className="sticker-upgrade-panel">
                  <div>
                    <strong>Want us to print and deliver these stickers?</strong>
                    <small>
                      You chose digital sheets earlier. Order physical stickers now at BDT {money(rate)} per sticker
                      ({packSize} stickers = BDT {money(packPrice)}) plus a fixed BDT {money(deliveryCharge)} delivery charge.
                    </small>
                  </div>
                  <LoadingButton
                    type="button"
                    className="secondary-button sticker-upgrade-btn"
                    busy={busy}
                    loadingText="Preparing order…"
                    onClick={() => onUpgrade(item.id)}
                  >
                    <PackagePlus size={15} />
                    <span>Order physical stickers ({item.totalQrCodes})</span>
                  </LoadingButton>
                </div>
              )}
              {item.fulfillment === 'physical' && item.paymentStatus !== 'paid' && (
                <div className='request-checkout'>
                  <div className='request-checkout-info'>
                    <strong>Physical Delivery Payment</strong>
                    <small>Stickers BDT {money(item.stickerSubtotal)} + Fixed Delivery BDT {money(item.deliveryCharge || 120)}</small>
                  </div>
                  <PaymentProviderPicker provider={provider} onChange={setProvider} compact />
                  <LoadingButton
                    type='button'
                    className='primary-button checkout-pay-btn'
                    busy={busy || item.paymentStatus === 'pending'}
                    loadingText={item.paymentStatus === 'pending' ? 'Payment pending…' : 'Processing…'}
                    disabled={item.paymentStatus === 'pending'}
                    onClick={() => onPay({ stickerRequestId: item.id, provider })}
                  >
                    <WalletCards size={16} />
                    <span>{item.paymentStatus === 'pending' ? 'Payment pending' : `Pay BDT ${money(item.totalPrice)}`}</span>
                  </LoadingButton>
                </div>
              )}
            </article>
          ))
        ) : (
          <Empty
            Icon={PackagePlus}
            title="No requests yet"
            text="Create a request containing one or many products."
          />
        )}
      </div>
      {confirmDelete && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => !busy && setConfirmDelete(null)}
        >
          <div
            className="detail-modal request-delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm delete request"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 6px", fontSize: "18px" }}>Delete this request?</h3>
            <p style={{ margin: "0", color: "#64748b", lineHeight: "1.5", fontSize: "14px" }}>
              Are you sure you want to delete this unpaid request? This action cannot be undone.
            </p>
            <div className="request-delete-dialog-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setConfirmDelete(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <LoadingButton
                type="button"
                className="small-action danger-action"
                busy={busy}
                loadingText="Deleting..."
                onClick={async () => {
                  if (!onDelete) return;
                  await onDelete(confirmDelete.id);
                  setConfirmDelete(null);
                }}
              >
                <Trash2 size={14} /> Delete
              </LoadingButton>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
function QrImage({ code, size = 100 }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    QRCode.toDataURL(qrUrl(code), {
      width: size,
      margin: 1,
      errorCorrectionLevel: "M",
    }).then(setSrc);
  }, [code, size]);
  return src ? (
    <img className="qr-image" src={src} alt={`QR ${code}`} />
  ) : (
    <div className="qr-placeholder">
      <LoaderCircle className="spin" />
    </div>
  );
}
function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(";base64,");
  const contentType = parts[0].split(":")[1] || "image/png";
  const byteCharacters = atob(parts[1]);
  const byteArrays = [];
  for (let offset = 0; offset < byteCharacters.length; offset += 512) {
    const slice = byteCharacters.slice(offset, offset + 512);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    byteArrays.push(new Uint8Array(byteNumbers));
  }
  return new Blob(byteArrays, { type: contentType });
}

function saveBlobAsFile(blob, filename) {
  const blobUrl = URL.createObjectURL(blob);
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

function downloadQr(code, productName = "WarQ-QR", serial = "") {
  return QRCode.toDataURL(qrUrl(code), {
    width: 1024,
    margin: 2,
    errorCorrectionLevel: "M",
  })
    .then((dataUrl) => {
      const blob = dataUrlToBlob(dataUrl);
      const safeName = String(productName || "WarQ").replace(/[^a-zA-Z0-9_\-\u0980-\u09FF]/g, "_");
      const serialPart = serial ? `_#${serial}` : "";
      const filename = `${safeName}${serialPart}_${code}.png`;
      saveBlobAsFile(blob, filename);
    })
    .catch((err) => {
      console.error("QR download failed:", err);
      alert("Could not download QR code: " + (err?.message || "unknown error"));
    });
}

async function downloadAllQrs(qrs, zipName = "WarQ-QR-Codes") {
  if (!qrs || !qrs.length) {
    alert("No QR codes to download.");
    return;
  }
  try {
    const zip = new JSZip();
    const folder = zip.folder("qr-codes");
    const ordered = [...qrs].sort(
      (a, b) =>
        String(a.requestId).localeCompare(String(b.requestId)) ||
        Number(a.serial) - Number(b.serial)
    );

    for (let i = 0; i < ordered.length; i++) {
      const qr = ordered[i];
      const dataUrl = await QRCode.toDataURL(qrUrl(qr.code), {
        width: 1024,
        margin: 2,
        errorCorrectionLevel: "M",
      });
      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
      const safeProduct = String(qr.productName || "WarQ").replace(/[^a-zA-Z0-9_\-\u0980-\u09FF]/g, "_");
      const indexStr = String(i + 1).padStart(3, "0");
      const filename = `${indexStr}_${safeProduct}_#${qr.serial || i + 1}_${qr.code}.png`;
      folder.file(filename, base64Data, { base64: true });
    }

    const manifestLines = ordered.map(
      (qr, i) =>
        `[#${i + 1}] Product: ${qr.productName || "N/A"} | Serial: #${qr.serial || i + 1} | Code: ${qr.code} | Scan URL: ${qrUrl(qr.code)} | Status: ${qr.status || "generated"}`
    );
    zip.file(
      "QR_LIST_MANIFEST.txt",
      `WarQ Smart Warranty System - QR Export\nExport Date: ${new Date().toLocaleString()}\nTotal QR Codes: ${ordered.length}\n========================================\n\n${manifestLines.join("\n")}`
    );

    const safeZipName = String(zipName || "WarQ-QR-Codes").replace(/[^a-zA-Z0-9_\-\u0980-\u09FF]/g, "_");
    const zipBlob = await zip.generateAsync({ type: "blob" });
    saveBlobAsFile(zipBlob, `${safeZipName}.zip`);
  } catch (err) {
    console.error("Batch QR download error:", err);
    alert("Could not generate QR zip download: " + (err?.message || "unknown error"));
  }
}

function printWithIframe(html) {
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.left = "-9999px";
  frame.style.top = "-9999px";
  frame.style.width = "1000px";
  frame.style.height = "1000px";
  frame.style.border = "none";
  frame.style.opacity = "0";
  document.body.appendChild(frame);

  const doc = frame.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();

  const doPrint = () => {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch (e) {
      console.error("Iframe print error:", e);
    }
  };

  const imgs = Array.from(doc.images || []);
  if (imgs.length) {
    Promise.all(
      imgs.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
        });
      })
    ).then(() => {
      setTimeout(doPrint, 250);
    });
  } else {
    setTimeout(doPrint, 350);
  }

  const cleanup = () => {
    try {
      if (document.body.contains(frame)) document.body.removeChild(frame);
    } catch {}
  };
  frame.contentWindow.onafterprint = cleanup;
  setTimeout(cleanup, 120000);
}

function printSingleQr(qr) {
  if (!qr) return;
  QRCode.toDataURL(qrUrl(qr.code), {
    width: 450,
    margin: 2,
    errorCorrectionLevel: "M",
  })
    .then((imgUrl) => {
      const escape = (v) =>
        String(v ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Print QR - ${escape(qr.productName)}</title>
  <style>
    @page { size: auto; margin: 8mm; }
    body { margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; display: flex; flex-direction: column; justify-content: center; align-items: center; min-height: 90vh; background: #fff; color: #0f172a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .card { border: 2px dashed #0d9488; border-radius: 16px; padding: 28px; text-align: center; max-width: 320px; box-sizing: border-box; }
    .card img { width: 220px; height: 220px; object-fit: contain; display: block; margin: 0 auto; }
    .card h2 { margin: 14px 0 4px; font-size: 19px; color: #0f172a; }
    .card p { margin: 0 0 6px; font-size: 14px; color: #0d9488; font-weight: 700; }
    .card small { font-size: 12px; color: #64748b; font-family: monospace; background: #f1f5f9; padding: 3px 8px; border-radius: 4px; display: inline-block; margin-bottom: 12px; }
    .actions { margin-top: 16px; display: flex; justify-content: center; gap: 10px; }
    .btn { background: #0d9488; color: #fff; border: none; padding: 9px 18px; border-radius: 6px; font-size: 13px; font-weight: bold; cursor: pointer; }
    @media print { .actions { display: none !important; } .card { border: 1.5px dashed #333; } }
  </style>
</head>
<body>
  <div class="card">
    <div style="font-size: 12px; font-weight: 800; color: #0d9488; margin-bottom: 12px;">WARQ SMART WARRANTY</div>
    <img src="${imgUrl}" alt="QR">
    <h2>${escape(qr.productName)}</h2>
    <p>Serial #${escape(qr.serial)}</p>
    <small>${escape(qr.code)}</small>
    <div style="font-size: 10px; color: #94a3b8;">Scan with phone camera or WarQ to verify</div>
    <div class="actions">
      <button class="btn" onclick="window.print()">🖨️ Print Sticker</button>
      <button class="btn" style="background:#64748b;" onclick="window.close()">✕ Close</button>
    </div>
  </div>
  <script>
    window.addEventListener('load', () => {
      setTimeout(() => { try { window.print(); } catch {} }, 400);
    });
  <\/script>
</body>
</html>`;
      printWithIframe(html);
    })
    .catch((err) => {
      console.error("Print single QR error:", err);
    });
}

function printStickerSheets(qrs, title = "WarQ Printable QR Sticker Sheets") {
  if (!qrs || !qrs.length) {
    alert("No QR codes available to print.");
    return;
  }

  const escape = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const ordered = [...qrs].sort(
    (a, b) =>
      String(a.requestId).localeCompare(String(b.requestId)) ||
      Number(a.serial) - Number(b.serial)
  );

  const sheets = Array.from(
    { length: Math.ceil(ordered.length / 30) },
    (_, index) => ordered.slice(index * 30, index * 30 + 30)
  );

  Promise.all(
    ordered.map((qr) =>
      QRCode.toDataURL(qrUrl(qr.code), {
        width: 360,
        margin: 1,
        errorCorrectionLevel: "M",
      })
    )
  )
    .then((images) => {
      const imageFor = new Map(ordered.map((qr, index) => [qr.id || qr.code, images[index]]));

      const pages = sheets
        .map(
          (sheet, sheetIndex) => `
        <section class="sheet">
          <header class="sheet-header">
            <div class="header-left">
              <strong>WarQ Smart Warranty Stickers</strong>
              <span>• Official Authenticated QR Codes</span>
            </div>
            <span>Sheet ${sheetIndex + 1} of ${sheets.length} (${ordered.length} total)</span>
          </header>
          <div class="sheet-grid">
            ${sheet
              .map(
                (qr) => `
              <article class="sheet-sticker">
                <div class="sticker-header">${escape(qr.productName)}</div>
                <img src="${imageFor.get(qr.id || qr.code)}" alt="QR" class="sticker-qr-img">
                <div class="sticker-footer">
                  <b>#${escape(qr.serial)}</b>
                  <small>${escape(qr.code)}</small>
                </div>
              </article>
            `
              )
              .join("")}
          </div>
          <footer class="sheet-footer">
            <span>WarQ Smart Warranty System • Scan QR code to verify authenticity</span>
          </footer>
        </section>
      `
        )
        .join("");

      const css = `
        <style>
          @page {
            size: A4 portrait;
            margin: 6mm;
          }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif;
            color: #0f172a;
            background: #ffffff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .toolbar {
            position: sticky;
            top: 0;
            background: #0f172a;
            color: #ffffff;
            padding: 12px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            z-index: 1000;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
          }
          .toolbar button {
            background: #0d9488;
            color: #ffffff;
            border: none;
            padding: 8px 18px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: bold;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 6px;
          }
          .toolbar button:hover { background: #0f766e; }
          .sheet {
            min-height: 284mm;
            padding: 2mm 0;
            display: flex;
            flex-direction: column;
            break-after: page;
            page-break-after: always;
          }
          .sheet:last-child {
            break-after: auto;
            page-break-after: auto;
          }
          .sheet-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            color: #0d9488;
            font-size: 8.5pt;
            padding: 0 2mm 2mm;
            border-bottom: 0.5pt solid #cbd5e1;
            margin-bottom: 2mm;
          }
          .header-left {
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .header-left span { color: #64748b; font-size: 7.5pt; }
          .sheet-header > span { color: #64748b; font-size: 7.5pt; font-weight: bold; }
          .sheet-grid {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            grid-template-rows: repeat(6, 1fr);
            gap: 2.2mm;
            flex-grow: 1;
          }
          .sheet-sticker {
            min-width: 0;
            height: 42.5mm;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: space-between;
            padding: 1.8mm 1mm;
            border: 0.3mm dashed #94a3b8;
            border-radius: 2mm;
            text-align: center;
            background: #ffffff;
            overflow: hidden;
            box-sizing: border-box;
          }
          .sheet-sticker .sticker-header {
            font-size: 6.5pt;
            font-weight: bold;
            line-height: 1.15;
            max-height: 13pt;
            overflow: hidden;
            color: #0f172a;
            width: 100%;
            white-space: nowrap;
            text-overflow: ellipsis;
          }
          .sheet-sticker .sticker-qr-img {
            width: 24.5mm;
            height: 24.5mm;
            object-fit: contain;
            display: block;
            margin: auto 0;
          }
          .sheet-sticker .sticker-footer {
            display: flex;
            flex-direction: column;
            align-items: center;
            line-height: 1.1;
            width: 100%;
          }
          .sheet-sticker .sticker-footer b {
            font-size: 6.5pt;
            color: #0d9488;
          }
          .sheet-sticker .sticker-footer small {
            font-size: 5pt;
            color: #64748b;
            font-family: monospace;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            max-width: 100%;
          }
          .sheet-footer {
            border-top: 0.5pt solid #cbd5e1;
            padding-top: 2mm;
            margin-top: 2mm;
            font-size: 6.5pt;
            color: #94a3b8;
            text-align: center;
          }
          @media print {
            .toolbar { display: none !important; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .sheet { min-height: auto; }
            .sheet-sticker { border: 0.25mm dashed #475569; }
          }
        </style>
      `;

      const fullHtml = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escape(title)}</title>
  ${css}
</head>
<body>
  <div class="toolbar">
    <div>
      <strong>WarQ QR Print Preview</strong> — ${ordered.length} stickers (${sheets.length} page${sheets.length === 1 ? "" : "s"})
    </div>
    <div style="display:flex;gap:10px;">
      <button onclick="window.print()">🖨️ Print Now</button>
      <button style="background:#475569;" onclick="window.close()">✕ Close</button>
    </div>
  </div>
  ${pages}
  <script>
    window.addEventListener('load', () => {
      setTimeout(() => {
        try { window.print(); } catch {}
      }, 500);
    });
  <\/script>
</body>
</html>`;

      printWithIframe(fullHtml);
    })
    .catch((err) => {
      console.error("Print sticker sheets error:", err);
      alert("Could not generate printable sticker sheets: " + (err?.message || "unknown error"));
    });
}

function PrintStudioModal({ printData, onClose, onDownloadZip, onDownloadSingle }) {
  const { qrs = [], title = "WarQ QR Sticker Sheets", single = false } = printData || {};
  const [images, setImages] = useState({});
  const [loading, setLoading] = useState(true);
  const [downloadingZip, setDownloadingZip] = useState(false);

  const ordered = useMemo(() => {
    return [...qrs].sort(
      (a, b) =>
        String(a.requestId).localeCompare(String(b.requestId)) ||
        Number(a.serial) - Number(b.serial)
    );
  }, [qrs]);

  const sheets = useMemo(() => {
    if (single) return [ordered.slice(0, 1)];
    const chunks = [];
    for (let i = 0; i < ordered.length; i += 30) {
      chunks.push(ordered.slice(i, i + 30));
    }
    return chunks;
  }, [ordered, single]);

  useEffect(() => {
    let isCurrent = true;
    setLoading(true);
    Promise.all(
      ordered.map((qr) =>
        QRCode.toDataURL(qrUrl(qr.code), {
          width: single ? 450 : 360,
          margin: 1,
          errorCorrectionLevel: "M",
        }).then((url) => [qr.id || qr.code, url])
      )
    )
      .then((entries) => {
        if (!isCurrent) return;
        setImages(Object.fromEntries(entries));
        setLoading(false);
      })
      .catch((err) => {
        console.error("Print Studio image generation failed:", err);
        if (isCurrent) setLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [ordered, single]);

  const handlePrint = () => {
    window.print();
  };

  const handleZipDownload = async () => {
    setDownloadingZip(true);
    try {
      if (onDownloadZip) {
        await onDownloadZip(ordered, title);
      } else {
        await downloadAllQrs(ordered, title);
      }
    } finally {
      setDownloadingZip(false);
    }
  };

  const handleSingleDownload = () => {
    if (ordered[0]) {
      if (onDownloadSingle) {
        onDownloadSingle(ordered[0]);
      } else {
        downloadQr(ordered[0].code, ordered[0].productName, ordered[0].serial);
      }
    }
  };

  return (
    <div className="print-studio-modal">
      <div className="print-studio-toolbar no-print">
        <div className="print-studio-title-group">
          <div className="icon-box">
            <Printer size={22} />
          </div>
          <div>
            <h2>{title}</h2>
            <p>
              {single
                ? "Single Sticker Card Preview"
                : `${ordered.length} Sticker${ordered.length === 1 ? "" : "s"} · ${sheets.length} A4 Page${sheets.length === 1 ? "" : "s"} (30 stickers/page)`}
            </p>
          </div>
        </div>
        <div className="print-studio-actions">
          <button
            type="button"
            className="print-btn-primary"
            onClick={handlePrint}
            disabled={loading}
          >
            <Printer size={16} /> Print Now
          </button>
          {!single && (
            <button
              type="button"
              className="print-btn-secondary"
              onClick={handleZipDownload}
              disabled={loading || downloadingZip}
            >
              {downloadingZip ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Download size={16} />
              )}
              {downloadingZip ? "Creating ZIP…" : "Download All (ZIP)"}
            </button>
          )}
          {single && (
            <button
              type="button"
              className="print-btn-secondary"
              onClick={handleSingleDownload}
              disabled={loading}
            >
              <Download size={16} /> Download PNG
            </button>
          )}
          <button
            type="button"
            className="print-btn-close"
            onClick={onClose}
          >
            <X size={16} /> Close
          </button>
        </div>
      </div>
      <div className="print-studio-tip no-print">
        <span>💡 <strong>Print Recommendation:</strong> In your browser print settings, choose <strong>A4 Paper</strong>, set Margins to <strong>None/Minimum</strong>, and turn ON <strong>"Background graphics"</strong> for crisp sticker cuts.</span>
      </div>
      <div className="print-studio-scroll">
        {loading ? (
          <div className="print-studio-loading">
            <LoaderCircle className="spin" size={36} color="#0d9488" />
            <h3>Preparing high-resolution QR stickers…</h3>
            <p>Formatting {ordered.length} QR codes for clean printing.</p>
          </div>
        ) : (
          <div id="warq-print-area">
            {single ? (
              <div className="single-card-wrap">
                <div className="single-sticker-card">
                  <div className="single-card-header">
                    <span className="brand-title">WarQ Smart Warranty</span>
                    <span className="brand-badge">Official QR Code</span>
                  </div>
                  <div className="single-card-body">
                    {images[ordered[0]?.id || ordered[0]?.code] ? (
                      <img
                        src={images[ordered[0]?.id || ordered[0]?.code]}
                        alt="QR Code"
                        className="single-qr-img"
                      />
                    ) : (
                      <LoaderCircle className="spin" />
                    )}
                    <h2 className="single-product-name">
                      {ordered[0]?.productName || "Product"}
                    </h2>
                    <p className="single-serial">
                      Serial #{ordered[0]?.serial}
                    </p>
                    <code className="single-code">{ordered[0]?.code}</code>
                    <div className="single-scan-hint">
                      Scan with camera or WarQ scanner to verify warranty
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              sheets.map((sheet, sheetIndex) => (
                <section className="sheet" key={sheetIndex}>
                  <header className="sheet-header">
                    <div className="header-left">
                      <strong>WarQ Smart Warranty Stickers</strong>
                      <span>• Official Authenticated QR Codes</span>
                    </div>
                    <span>
                      Sheet {sheetIndex + 1} of {sheets.length} ({ordered.length} total)
                    </span>
                  </header>
                  <div className="sheet-grid">
                    {sheet.map((qr) => (
                      <article className="sheet-sticker" key={qr.id || qr.code}>
                        <div className="sticker-header" title={qr.productName}>
                          {qr.productName}
                        </div>
                        {images[qr.id || qr.code] ? (
                          <img
                            src={images[qr.id || qr.code]}
                            alt="QR"
                            className="sticker-qr-img"
                          />
                        ) : (
                          <div className="sticker-qr-placeholder">
                            <LoaderCircle className="spin" size={16} />
                          </div>
                        )}
                        <div className="sticker-footer">
                          <b>#{qr.serial}</b>
                          <small>{qr.code}</small>
                        </div>
                      </article>
                    ))}
                  </div>
                  <footer className="sheet-footer">
                    <span>WarQ Smart Warranty System • Scan QR to verify and activate warranty</span>
                  </footer>
                </section>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
function Inventory({ data, onSell, onPrintSheets, onPrintSingle, onDownloadQrs, onDownloadSingle, busy }) {
  const [selected, setSelected] = useState(null),
    [price, setPrice] = useState("");
  const qrs = data.qrs;
  return (
    <section className="page">
      <div className="page-title row-title">
        <div>
          <span className="eyebrow">QR INVENTORY</span>
          <h1>Generated QR codes</h1>
          <p>Serial order is permanent. A sale never starts the warranty.</p>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            className="secondary-button"
            disabled={!qrs.length}
            onClick={() => onPrintSheets ? onPrintSheets(qrs, "WarQ Inventory Stickers") : printStickerSheets(qrs, "WarQ Inventory Stickers")}
          >
            <Printer size={15} /> Print all ({qrs.length})
          </button>
          <button
            className="secondary-button"
            disabled={!qrs.length}
            onClick={() => onDownloadQrs ? onDownloadQrs(qrs, "WarQ_Inventory_Stickers") : downloadAllQrs(qrs, "WarQ_Inventory_Stickers")}
          >
            <Download size={15} /> Download all
          </button>
        </div>
      </div>
      <div className="qr-grid">
        {qrs.map((qr) => (
          <article className="panel qr-card" key={qr.id}>
            <QrImage code={qr.code} />
            <div className="qr-card-info">
              <Lifetime qr={qr} />
              <h2>{qr.productName}</h2>
              <p>
                #{qr.serial} · {qr.status}
              </p>
              <small>{qr.code}</small>
              <div className="card-actions">
                <button
                  type="button"
                  className="text-button"
                  onClick={() => onPrintSingle ? onPrintSingle(qr) : printSingleQr(qr)}
                >
                  <Printer size={12} /> Print
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => onDownloadSingle ? onDownloadSingle(qr) : downloadQr(qr.code, qr.productName, qr.serial)}
                >
                  <Download size={12} /> Download
                </button>
                {qr.status === "generated" && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setSelected(qr);
                      setPrice(qr.defaultPrice ?? "");
                    }}
                  >
                    Record sale
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
      {!qrs.length && (
        <Empty
          title="No QR codes yet"
          text="Approved, generated requests will appear here."
        />
      )}
      {selected && (
        <div className="modal-backdrop">
          <form
            className="detail-modal"
            onSubmit={async (event) => {
              event.preventDefault();
              await onSell(selected.code, price);
              setSelected(null);
            }}
          >
            <button
              type="button"
              className="close-button"
              onClick={() => setSelected(null)}
            >
              <X />
            </button>
            <h2>Record product sale</h2>
            <p>
              This records the sale date/time only. The customer’s authenticated
              scan starts the warranty later.
            </p>
            <label>
              Actual sale price (optional)
              <input
                type="number"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </label>
            <button className="primary-button full" disabled={busy}>
              Record sale
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
function InventoryFolders({ data, onSell, onAddToFolder, onDeleteQr, onDeleteQrs, onDeleteGroup, onPrintSheets, onPrintSingle, onDownloadQrs, onDownloadSingle, onReturnSale, busy }) {
  const [selected, setSelected] = useState(null),
    [saleForm, setSaleForm] = useState({ price: "", customerName: "", customerPhone: "", customerAddress: "", customerNotes: "" }),
    [phoneErr, setPhoneErr] = useState(""),
    [priceErr, setPriceErr] = useState(""),
    [expanded, setExpanded] = useState(null),
    [selectedCodes, setSelectedCodes] = useState({}),
    [folderSearch, setFolderSearch] = useState(""),
    [folderQrSearch, setFolderQrSearch] = useState(""),
    [folderQrStatus, setFolderQrStatus] = useState("all"),
    [folderQrPage, setFolderQrPage] = useState(1),
    [addingGroup, setAddingGroup] = useState(null),
    [addition, setAddition] = useState({ quantity: 100 }),
    [copiedCode, setCopiedCode] = useState("");
  const qrs = data.qrs;
  const groupIdFor = (qr) => qr.groupId || `${qr.requestId}_${String(qr.productId || qr.productName).replace(/[^A-Za-z0-9_-]/g, "_")}`;
  const isUnusedQr = (qr) => ["generated", "inactive"].includes(qr.status);

  const qrsByGroup = useMemo(() => {
    const map = new Map();
    for (const qr of qrs) {
      const id = groupIdFor(qr);
      const list = map.get(id);
      if (list) list.push(qr);
      else map.set(id, [qr]);
    }
    return map;
  }, [qrs]);

  const groups = useMemo(
    () =>
      data.groups?.length
        ? data.groups
        : [...new Map(qrs.map((qr) => [groupIdFor(qr), { id: groupIdFor(qr), requestId: qr.requestId, folderName: qr.productModel || qr.folderName || `QR folder ${qr.requestId}`, productName: qr.productName, productModel: qr.productModel || "", brandName: qr.brandName || "", productNames: [qr.productName], warrantyDuration: qr.warrantyDuration || null, defaultPrice: qr.defaultPrice ?? null, createdAt: qr.createdAt ? new Date(qr.createdAt).getTime() : null, lastAddedAt: qr.createdAt ? new Date(qr.createdAt).getTime() : null, totalQrs: (qrsByGroup.get(groupIdFor(qr)) || []).length }])).values()],
    [data.groups, qrs, qrsByGroup],
  );
  const qrsForGroup = (group) => qrsByGroup.get(group.id) || [];
  const batchesForGroup = (group) => {
    const qrs = qrsForGroup(group);
    const byRequest = new Map();
    for (const qr of qrs) {
      const bid = qr.requestId || group.id;
      const entry = byRequest.get(bid) || { id: bid, qrs: [], minCreatedAt: null };
      entry.qrs.push(qr);
      const t = qr.createdAt ? new Date(qr.createdAt).getTime() : null;
      if (t && (!entry.minCreatedAt || t < entry.minCreatedAt)) entry.minCreatedAt = t;
      byRequest.set(bid, entry);
    }
    const requestById = new Map((data.requests || []).map((req) => [req.id, req]));
    const batches = [];
    for (const [bid, entry] of byRequest) {
      const req = requestById.get(bid);
      let createdAt = null;
      if (req?.generatedAt) createdAt = new Date(req.generatedAt).getTime();
      else if (req?.createdAt) createdAt = new Date(req.createdAt).getTime();
      else createdAt = entry.minCreatedAt;
      batches.push({
        id: bid,
        qrs: entry.qrs,
        quantity: Number(req?.totalQrCodes) || entry.qrs.length,
        createdAt,
        status: req?.status || 'generated',
        generatedBy: req?.generatedBy || 'system',
      });
    }
    return batches.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  };
  const batchStatusClass = (s) =>
    s === 'generated' ? "success" : s === 'generating' || s === 'pending' ? "warning" : s === 'generation_failed' ? "danger" : "neutral";
  const productsForGroup = (group) => [...new Set((Array.isArray(group.productNames) && group.productNames.length ? group.productNames : String(group.productName || '').split(',')).map((name) => name.trim()).filter(Boolean))];
  const debouncedFolderSearch = useDebouncedValue(folderSearch);
  const visibleGroups = useMemo(() => {
    const normalizedSearch = debouncedFolderSearch.trim().toLowerCase();
    if (!normalizedSearch) return groups;
    return groups.filter((group) => [group.folderName, group.productName, group.productModel, group.brandName, group.requestId, group.warrantyDuration ? warrantyText(group.warrantyDuration) : "", group.defaultPrice != null ? String(group.defaultPrice) : "", ...productsForGroup(group)].join(' ').toLowerCase().includes(normalizedSearch));
  }, [groups, debouncedFolderSearch]);
  const folderPage = usePagedList(visibleGroups, FOLDER_PAGE_SIZE);

  useEffect(() => {
    setFolderQrSearch("");
    setFolderQrStatus("all");
    setFolderQrPage(1);
  }, [expanded]);

  const openAddModal = (group) => { setAddition({ quantity: 100 }); setAddingGroup(group); };
  const selectedForGroup = (groupId) => selectedCodes[groupId] || [];

  const toggleQrSelection = (groupId, code) => {
    setSelectedCodes((current) => {
      const selectedInFolder = current[groupId] || [];
      const next = selectedInFolder.includes(code)
        ? selectedInFolder.filter((item) => item !== code)
        : [...selectedInFolder, code];
      return { ...current, [groupId]: next };
    });
  };

  const selectAllUnused = (groupId, unusedQrs, shouldSelect) => {
    setSelectedCodes((current) => ({
      ...current,
      [groupId]: shouldSelect ? unusedQrs.map((qr) => qr.code) : []
    }));
  };

  const copyFolderQrCode = (e, code) => {
    e.stopPropagation();
    if (!code) return;
    navigator.clipboard?.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(""), 2000);
  };

  const deleteSelectedQrs = async (groupId) => {
    const codes = selectedForGroup(groupId);
    if (!codes.length) return;
    await onDeleteQrs(codes);
    setSelectedCodes((current) => ({ ...current, [groupId]: [] }));
  };

  const openSellModal = (qr) => {
    setSelected(qr);
    setSaleForm({
      price: qr.defaultPrice ?? "",
      customerName: "",
      customerPhone: "",
      customerAddress: "",
      customerNotes: ""
    });
    setPhoneErr("");
    setPriceErr("");
  };

  const handleSaleSubmit = async (e) => {
    e.preventDefault();
    if (saleForm.customerPhone.trim() && !isValidBdPhoneNumber(saleForm.customerPhone)) {
      setPhoneErr("Please enter a valid 11-digit Bangladeshi mobile number.");
      return;
    }
    const priceInput = String(saleForm.price ?? "").trim();
    const numericPrice = Number(priceInput);
    if (priceInput !== "" && (!Number.isFinite(numericPrice) || numericPrice < 0)) {
      setPriceErr("Enter a valid sale price amount.");
      return;
    }
    setPriceErr("");
    await onSell(selected.code, {
      actualPrice: priceInput === "" ? undefined : numericPrice,
      customerName: saleForm.customerName.trim(),
      customerPhone: formatBdPhoneNumber(saleForm.customerPhone),
      customerAddress: saleForm.customerAddress.trim(),
      customerNotes: saleForm.customerNotes.trim()
    });
    setSelected(null);
  };

  return (
    <section className="page">
      <div className="page-title row-title">
        <div>
          <span className="eyebrow">QR INVENTORY</span>
          <h1>QR code folders</h1>
          <p>Search folders, manage their QR codes, or add more QR codes to an existing product folder.</p>
        </div>
        <div className="qr-folder-header-actions" style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button className="secondary-button" disabled={!qrs.length} onClick={() => onPrintSheets ? onPrintSheets(qrs, "WarQ Inventory Stickers") : printStickerSheets(qrs, "WarQ Inventory Stickers")}>
            <Printer size={15} /> Print all (30/page)
          </button>
        </div>
      </div>
      <label className="inventory-search" aria-label="Search QR folders and products">
        <Search size={17} />
        <input value={folderSearch} onChange={(event) => setFolderSearch(event.target.value)} placeholder="Search folders or products" />
        {folderSearch && <button type="button" className="text-button" onClick={() => setFolderSearch("")}>Clear</button>}
      </label>
      <div className="qr-folder-list">
        {folderPage.slice.map((group) => {
          const groupQrs = qrsForGroup(group), isOpen = expanded === group.id;
          const unusedQrs = groupQrs.filter(isUnusedQr);
          const selectedInFolder = selectedForGroup(group.id);
          const selectedUnusedCount = selectedInFolder.filter((code) => unusedQrs.some((qr) => qr.code === code)).length;
          const allUnusedSelected = unusedQrs.length > 0 && unusedQrs.every((qr) => selectedInFolder.includes(qr.code));
          const hasProtectedQrs = groupQrs.some((qr) => !isUnusedQr(qr));
          const available = group.available ?? groupQrs.filter((qr) => ["generated", "inactive"].includes(qr.status)).length;
          const activated = group.activated ?? groupQrs.filter((qr) => qr.status === "activated").length;
          const normalizedQrSearch = isOpen ? folderQrSearch.trim().toLowerCase() : "";
          const visibleFolderQrs = isOpen
            ? groupQrs.filter((qr) => {
                if (folderQrStatus === "unused" && !isUnusedQr(qr)) return false;
                if (folderQrStatus === "activated" && qr.status !== "activated") return false;
                if (folderQrStatus === "sold" && qr.status !== "sold") return false;
                if (folderQrStatus === "returned" && qr.status !== "returned") return false;
                if (normalizedQrSearch) {
                  return [qr.code, qr.serial, qr.productName, qr.status]
                    .filter(Boolean)
                    .some((value) => String(value).toLowerCase().includes(normalizedQrSearch));
                }
                return true;
              })
            : groupQrs;
          const folderQrTotal = visibleFolderQrs.length;
          const folderQrPageCount = Math.max(1, Math.ceil(folderQrTotal / FOLDER_QR_PAGE_SIZE));
          const safeFolderQrPage = Math.min(folderQrPage, folderQrPageCount);
          const folderQrStart = (safeFolderQrPage - 1) * FOLDER_QR_PAGE_SIZE;
          const folderQrSlice = visibleFolderQrs.slice(folderQrStart, folderQrStart + FOLDER_QR_PAGE_SIZE);
          const batches = batchesForGroup(group);
          return (
            <article className="panel qr-folder" key={group.id}>
              <div className="qr-folder-heading">
                <span className="row-icon"><FolderOpen /></span>
                <div className="qr-folder-info">
                  <div className="qr-folder-title-row">
                    <h2>{group.folderName || `QR folder ${group.requestId}`}</h2>
                  </div>
                  <div className="qr-folder-meta">
                    <div className="qr-folder-chips">
                      <span className="qr-folder-chip qr-folder-product-chip" title="Product and Brand">
                        <strong className="qr-folder-product-name">{group.productName || "Product"}</strong>
                        {group.brandName ? <span className="qr-folder-brand-name"> · {group.brandName}</span> : null}
                      </span>
                      <span className="qr-folder-chip qr-folder-chip-total" title="Total QR Codes in folder">
                        {group.totalQrs} QR codes
                      </span>
                      <span className="qr-folder-chip qr-folder-chip-unused" title="Unused QR Codes ready for sale">
                        {available} unused
                      </span>
                      <span className="qr-folder-chip qr-folder-chip-activated" title="Activated QR Codes">
                        {activated} activated
                      </span>
                      {group.warrantyDuration ? (
                        <span className="qr-folder-chip qr-folder-chip-warranty" title="Warranty Duration">
                          {warrantyText(group.warrantyDuration)}
                        </span>
                      ) : null}
                      {group.defaultPrice != null ? (
                        <span className="qr-folder-chip qr-folder-chip-price" title="Default Unit Price">
                          Price: BDT {money(group.defaultPrice)}
                        </span>
                      ) : null}
                    </div>
                    <div className="qr-folder-submeta">
                      {group.createdAt ? (
                        <span className="qr-folder-submeta-item">
                          Created {dateTime(group.createdAt)}
                        </span>
                      ) : null}
                      {group.lastAddedAt && group.createdAt && group.lastAddedAt !== group.createdAt ? (
                        <span className="qr-folder-submeta-item">
                          Last added {dateTime(group.lastAddedAt)}
                        </span>
                      ) : null}
                      <span className="qr-folder-id-tag">
                        Folder <code>{group.id}</code>
                      </span>
                    </div>
                  </div>
                </div>
                <div className="folder-actions">
                  <div className="folder-actions-buttons">
                    <button className="small-action" onClick={() => onPrintSheets ? onPrintSheets(groupQrs, `WarQ Stickers - ${group.productName}`) : printStickerSheets(groupQrs, `WarQ Stickers - ${group.productName}`)}>
                      <Printer size={12} /> Print folder ({groupQrs.length})
                    </button>
                    <button className="small-action" disabled={busy} onClick={() => openAddModal(group)}><Plus size={12} /> Add QR codes</button>
                    <button className="small-action" onClick={() => setExpanded(isOpen ? null : group.id)}>{isOpen ? "Hide QRs" : "View QRs"}</button>
                    {!hasProtectedQrs && (
                      <button className="small-action danger-action" onClick={() => window.confirm(`Delete the ${group.productName} folder and all ${unusedQrs.length} unused QR codes? This cannot be undone.`) && onDeleteGroup(group.id)}><Trash2 /> Delete folder</button>
                    )}
                  </div>
                  {hasProtectedQrs && (
                    <span className="folder-protection-note">Sold and activated QR codes are protected. Open the folder to remove only unused codes.</span>
                  )}
                </div>
              </div>
              {isOpen && (
                <>
                  {batches.length > 0 && (
                    <div className="qr-folder-batch-history">
                      <div className="qr-folder-batch-history-title">
                        <Clock size={14} />
                        <strong>QR Generation History</strong>
                        <span>{batches.length} batches</span>
                      </div>
                      <div className="qr-folder-batch-list">
                        {batches.map((batch, index) => (
                          <div className="qr-folder-batch-item" key={batch.id}>
                            <div className="qr-folder-batch-info">
                              <span className="qr-folder-batch-label">Batch {index + 1}</span>
                              <span className="qr-folder-batch-meta">
                                {batch.createdAt ? (
                                  <>
                                    <strong>{dateWithDay(batch.createdAt)}</strong>
                                    <span>· {timeWithAmPm(batch.createdAt)}</span>
                                  </>
                                ) : (
                                  <strong>Date not recorded</strong>
                                )}
                              </span>
                              <span className="qr-folder-batch-qty">
                                {batch.qrs.length} QR code{batch.qrs.length === 1 ? "" : "s"}
                              </span>
                              <span className={`pill ${batchStatusClass(batch.status)} qr-folder-batch-pill`}>
                                {String(batch.status).replace("_", " ")}
                              </span>
                            </div>
                            <button
                              type="button"
                              className="small-action"
                              disabled={busy || !batch.qrs.length}
                              onClick={() => onPrintSheets ? onPrintSheets(batch.qrs, `WarQ Stickers - ${group.productName} (Batch ${index + 1})`) : printStickerSheets(batch.qrs, `WarQ Stickers - ${group.productName} (Batch ${index + 1})`)}
                            >
                              <Printer size={12} /> Print batch ({batch.qrs.length})
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="folder-selection-bar">
                    <label className="folder-select-all">
                      <input
                        type="checkbox"
                        checked={allUnusedSelected}
                        disabled={!unusedQrs.length || busy}
                        onChange={(event) => selectAllUnused(group.id, unusedQrs, event.target.checked)}
                      />
                      Select all unused ({unusedQrs.length})
                    </label>
                    <span>{selectedUnusedCount ? `${selectedUnusedCount} QR code${selectedUnusedCount === 1 ? "" : "s"} selected` : "Sold and activated QR codes are always protected"}</span>
                    <button
                      type="button"
                      className="small-action danger-action"
                      disabled={!selectedUnusedCount || busy}
                      onClick={() => window.confirm(`Delete ${selectedUnusedCount} selected unused QR code${selectedUnusedCount === 1 ? "" : "s"}? Activated QR codes will never be deleted.`) && deleteSelectedQrs(group.id)}
                    >
                      <Trash2 size={12} /> Delete selected ({selectedUnusedCount})
                    </button>
                  </div>
                  <div className="data-toolbar data-toolbar-compact">
                    <DataSearchInput
                      value={folderQrSearch}
                      onChange={(value) => { setFolderQrSearch(value); setFolderQrPage(1); }}
                      placeholder={`Search QR codes in ${group.folderName || "this folder"}`}
                      label="Search QR codes in folder"
                    />
                    <DataToolbarSelect
                      label="Status"
                      value={folderQrStatus}
                      onChange={(value) => { setFolderQrStatus(value); setFolderQrPage(1); }}
                      options={[
                        ["all", "All QRs"],
                        ["unused", "Unused"],
                        ["sold", "Sold (awaiting activation)"],
                        ["activated", "Activated"],
                        ["returned", "Returned"],
                      ]}
                    />
                  </div>
                  <div className="qr-grid folder-qr-grid">
                  {folderQrSlice.map((qr) => {
                    const canDelete = isUnusedQr(qr);
                    const isSelectedForDeletion = selectedInFolder.includes(qr.code);
                    return (
                    <article className={`qr-card ${isSelectedForDeletion ? "selected-for-deletion" : ""}`} key={qr.id}>
                      <QrImage code={qr.code} />
                      <div className="qr-card-info">
                        <Lifetime qr={qr} />
                        <h2>{qr.productName}</h2>
                        <p>Serial #{qr.serial} · {qr.status === "returned" ? "returned" : qr.status}</p>
                        <button
                          type="button"
                          className={`sale-qr-id-copy-btn ${copiedCode === qr.code ? "is-copied" : ""}`}
                          onClick={(e) => copyFolderQrCode(e, qr.code)}
                          title="Click to copy QR code"
                        >
                          <span>{qr.code}</span>
                          {copiedCode === qr.code ? <Check size={11} color="#059669" /> : <Copy size={11} />}
                        </button>
                        <label className="qr-select-control">
                          <input
                            type="checkbox"
                            checked={isSelectedForDeletion}
                            disabled={!canDelete || busy}
                            onChange={() => toggleQrSelection(group.id, qr.code)}
                          />
                          {canDelete ? "Select for deletion" : qr.status === "returned" ? "Returned QR — protected" : "Activated QR — protected"}
                        </label>
                        <div className="card-actions">
                          <button type="button" className="text-button" onClick={() => onPrintSingle ? onPrintSingle(qr) : printSingleQr(qr)}>
                            <Printer size={12} /> Print
                          </button>
                          <button type="button" className="text-button" onClick={() => onDownloadSingle ? onDownloadSingle(qr) : downloadQr(qr.code, qr.productName, qr.serial)}>
                            <Download size={12} /> Download
                          </button>
                          <ReturnSaleControls
                            compact
                            sale={{ id: qr.saleId, code: qr.code, status: qr.status }}
                            onReturnSale={onReturnSale}
                            actionClass="text-button delete-text-button"
                          />
                          {isUnusedQr(qr) && <button className="text-button" onClick={() => openSellModal(qr)}>Activate sale</button>}
                          {["generated", "inactive"].includes(qr.status) && <button className="text-button delete-text-button" onClick={() => window.confirm(`Delete QR ${qr.code}?`) && onDeleteQr(qr.code)}>Delete</button>}
                        </div>
                      </div>
                    </article>
                  )})}
                  </div>
                  {folderQrTotal ? (
                    <Pagination
                      page={safeFolderQrPage}
                      pageCount={folderQrPageCount}
                      total={folderQrTotal}
                      pageSize={FOLDER_QR_PAGE_SIZE}
                      start={folderQrStart}
                      onPage={setFolderQrPage}
                      itemLabel="QR codes"
                    />
                  ) : (
                    <Empty
                      Icon={Search}
                      title="No matching QR codes"
                      text="Try a different search term or status filter."
                    />
                  )}
                </>
              )}
            </article>
          );
        })}
      </div>
      {!qrs.length ? (
        <Empty title="No QR codes yet" text="Each generated QR request will appear here as its own folder." />
      ) : !visibleGroups.length ? (
        <Empty title="No matching folders" text="Try another folder or product name." />
      ) : (
        folderPage.pageCount > 1 && (
          <Pagination
            page={folderPage.page}
            pageCount={folderPage.pageCount}
            total={folderPage.total}
            pageSize={FOLDER_PAGE_SIZE}
            start={folderPage.start}
            onPage={folderPage.setPage}
            itemLabel="folders"
          />
        )
      )}
      {selected && (
        <div className="modal-backdrop">
          <form className="detail-modal" onSubmit={handleSaleSubmit}>
            <button type="button" className="close-button" onClick={() => setSelected(null)}><X /></button>
            <h2>Activate Product Sale &amp; Warranty</h2>
            <p>This records the sale, activates the QR code, and immediately starts its warranty countdown.</p>
            
            <div className="product-summary-mini" style={{ background: "#f8fafc", padding: "10px 12px", borderRadius: "10px", margin: "10px 0 14px", border: "1px solid #e2e8f0" }}>
              <strong style={{ display: "block", color: "#0f172a" }}>{selected.productName} (Serial #{selected.serial})</strong>
              <small style={{ color: "#64748b" }}>Code: {selected.code} · Duration: {warrantyText(selected.warrantyDuration)}</small>
              {selected.defaultPrice != null && (
                <small style={{ display: "block", color: "#166534", marginTop: "2px", fontWeight: 600 }}>
                  Product Price: BDT {money(selected.defaultPrice)}
                </small>
              )}
            </div>

            <div className="form-grid">
              <label>
                Customer Name (Optional)
                <input
                  placeholder="e.g. Rahim Chowdhury"
                  value={saleForm.customerName}
                  onChange={(e) => setSaleForm({ ...saleForm, customerName: e.target.value })}
                />
              </label>

              <label>
                Customer Phone (Optional)
                <input
                  inputMode="tel"
                  placeholder="017XXXXXXXX"
                  value={saleForm.customerPhone}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSaleForm({ ...saleForm, customerPhone: v });
                    if (v.trim() && !isValidBdPhoneNumber(v)) {
                      setPhoneErr("Invalid BD mobile number");
                    } else {
                      setPhoneErr("");
                    }
                  }}
                />
                {phoneErr && <small style={{ color: "#ef4444" }}>{phoneErr}</small>}
              </label>
            </div>

            <div className="form-grid" style={{ marginTop: "10px" }}>
              <label>
                Actual Sale Price (BDT)
                <input
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  placeholder={selected.defaultPrice != null ? `Default: ${money(selected.defaultPrice)}` : "0"}
                  value={saleForm.price}
                  onChange={(e) => {
                    setSaleForm({ ...saleForm, price: e.target.value });
                    if (priceErr) setPriceErr("");
                  }}
                />
                {priceErr && <small style={{ color: "#ef4444" }}>{priceErr}</small>}
              </label>

              <label>
                Customer Notes / Address (Optional)
                <input
                  placeholder="Customer address or invoice #"
                  value={saleForm.customerNotes}
                  onChange={(e) => setSaleForm({ ...saleForm, customerNotes: e.target.value })}
                />
              </label>
            </div>

            <button className="primary-button full" disabled={busy} style={{ marginTop: "18px" }}>
              {busy ? <LoaderCircle className="spin" size={16} /> : <CheckCircle2 size={16} />}
              Activate Warranty &amp; Record Sale
            </button>
          </form>
        </div>
      )}
      {addingGroup && (
        <div className="modal-backdrop">
          <form className="detail-modal" onSubmit={async (event) => { event.preventDefault(); await onAddToFolder(addingGroup, addition); setAddingGroup(null); }}>
            <button type="button" className="close-button" onClick={() => setAddingGroup(null)}><X /></button>
            <h2>Add QR codes</h2>
            <p>Add more QR codes for an existing product in <strong>{addingGroup.folderName || `QR folder ${addingGroup.requestId}`}</strong>.</p>
            <div className="form-grid">
              <label>Additional QR quantity<input required type="number" min="1" max="50000" value={addition.quantity} onChange={(event) => setAddition({ ...addition, quantity: event.target.value })} /></label>
            </div>
            <button className="primary-button full" disabled={busy} style={{ marginTop: "18px" }}>{busy ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />} Add QR codes to folder</button>
          </form>
        </div>
      )}
    </section>
  );
}
const SALE_STATUS_FILTERS = [
  ["all", "All statuses"],
  ["active", "Active warranty"],
  ["awaiting", "Awaiting activation"],
  ["expired", "Warranty expired"],
  ["returned", "Returned"],
  ["no_warranty", "No warranty"],
];

function saleBucket(sale) {
  const isReturnedSale = sale.status === "returned";
  const isActivated =
    !isReturnedSale && (sale.status === "activated" || Boolean(sale.activatedAt));
  const isExpired =
    isActivated &&
    sale.warrantyExpiresAt &&
    new Date(sale.warrantyExpiresAt).getTime() <= Date.now();
  if (isReturnedSale) return "returned";
  if (!isActivated) return "awaiting";
  if (isExpired) return "expired";
  return sale.warrantyDuration ? "active" : "no_warranty";
}

function Sales({ data, onReturnSale }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const debouncedQuery = useDebouncedValue(query);

  const filteredSales = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    let list = data.sales;
    if (statusFilter !== "all") {
      list = list.filter((sale) => saleBucket(sale) === statusFilter);
    }
    if (q) {
      list = list.filter((sale) =>
        [
          sale.productName,
          sale.code,
          sale.serial,
          sale.customerName,
          sale.customerPhone,
          sale.customerNotes,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q)),
      );
    }
    const priceOf = (sale) => Number(sale.actualPrice ?? sale.defaultPrice ?? 0);
    const timeOf = (sale) =>
      new Date(sale.saleDate || sale.soldAt || sale.activatedAt || 0).getTime() || 0;
    const sorted = [...list];
    if (sort === "oldest") sorted.sort((a, b) => timeOf(a) - timeOf(b));
    else if (sort === "priceDesc") sorted.sort((a, b) => priceOf(b) - priceOf(a));
    else if (sort === "priceAsc") sorted.sort((a, b) => priceOf(a) - priceOf(b));
    else sorted.sort((a, b) => timeOf(b) - timeOf(a));
    return sorted;
  }, [data.sales, debouncedQuery, statusFilter, sort]);
  const salesPage = usePagedList(filteredSales, SALES_PAGE_SIZE);

  const salesSummary = useMemo(() => {
    const list = data.sales || [];
    let gross = 0;
    let returns = 0;
    let activeWarranties = 0;
    const now = Date.now();
    for (const s of list) {
      if (s.status === "returned") {
        returns++;
      } else {
        gross += Number(s.actualPrice ?? s.defaultPrice ?? 0);
        if (s.warrantyExpiresAt && new Date(s.warrantyExpiresAt).getTime() > now) {
          activeWarranties++;
        }
      }
    }
    return {
      totalCount: list.length,
      netRevenue: gross,
      activeWarranties,
      returns,
    };
  }, [data.sales]);

  return (
    <section className="page">
      <div className="page-title">
        <span className="eyebrow">SALES HISTORY</span>
        <h1>Sales and activations</h1>
        <p>
          QR activation records the sale and starts the warranty in one secure event. Returned products stay in history but are excluded from sales, revenue, and profit.
        </p>
      </div>
      {data.sales?.length > 0 && (
        <div className="sales-summary-grid">
          <div className="sales-summary-stat">
            <span className="sales-stat-icon green"><ShoppingBag size={18} /></span>
            <div>
              <small>Total Transactions</small>
              <strong>{salesSummary.totalCount}</strong>
            </div>
          </div>
          <div className="sales-summary-stat">
            <span className="sales-stat-icon blue"><CircleDollarSign size={18} /></span>
            <div>
              <small>Realized Revenue</small>
              <strong>BDT {money(salesSummary.netRevenue)}</strong>
            </div>
          </div>
          <div className="sales-summary-stat">
            <span className="sales-stat-icon teal"><ShieldCheck size={18} /></span>
            <div>
              <small>Active Warranties</small>
              <strong>{salesSummary.activeWarranties}</strong>
            </div>
          </div>
          <div className="sales-summary-stat">
            <span className="sales-stat-icon orange"><RotateCcw size={18} /></span>
            <div>
              <small>Returns Recorded</small>
              <strong>{salesSummary.returns}</strong>
            </div>
          </div>
        </div>
      )}
      <article className="panel recent-sales">
        {data.sales.length ? (
          <>
            <div className="data-toolbar">
              <DataSearchInput
                value={query}
                onChange={setQuery}
                placeholder="Search product, QR code, serial, customer…"
                label="Search sales"
              />
              <DataToolbarSelect
                label="Status"
                value={statusFilter}
                onChange={setStatusFilter}
                options={SALE_STATUS_FILTERS}
              />
              <DataToolbarSelect
                label="Sort"
                value={sort}
                onChange={setSort}
                options={[
                  ["newest", "Newest first"],
                  ["oldest", "Oldest first"],
                  ["priceDesc", "Price: high → low"],
                  ["priceAsc", "Price: low → high"],
                ]}
              />
            </div>
            {salesPage.slice.length ? (
              <>
                {salesPage.slice.map((sale) => (
                  <SaleRow key={sale.id} sale={sale} onReturnSale={onReturnSale} />
                ))}
                <Pagination
                  page={salesPage.page}
                  pageCount={salesPage.pageCount}
                  total={salesPage.total}
                  pageSize={SALES_PAGE_SIZE}
                  start={salesPage.start}
                  onPage={salesPage.setPage}
                  itemLabel="sales"
                />
              </>
            ) : (
              <Empty
                Icon={Search}
                title="No matching sales"
                text="Try a different search term or status filter."
              />
            )}
          </>
        ) : (
          <Empty
            Icon={ShoppingBag}
            title="No sales"
            text="Record sales from QR inventory."
          />
        )}
      </article>
    </section>
  );
}
function addressesAreSame(shopAddress, deliveryAddress) {
  const shop = String(shopAddress || "").trim();
  const delivery = String(deliveryAddress || "").trim();
  return Boolean(shop) && shop === delivery;
}

function normalizeLocationFields(district, upazila) {
  const districtName = String(district || "").trim();
  const match = BD_DISTRICTS.find(
    (item) => item.name.toLowerCase() === districtName.toLowerCase(),
  );
  const resolvedDistrict = match?.name || districtName;
  const upazilas = getUpazilasForDistrict(resolvedDistrict);
  const upazilaName = String(upazila || "").trim();
  const resolvedUpazila =
    upazilas.find((name) => name.toLowerCase() === upazilaName.toLowerCase()) || "";
  return { district: resolvedDistrict, upazila: resolvedUpazila };
}

function Profile({
  data,
  onSave,
  onRead,
  onDeleteNotification,
  onClearNotifications,
  busy,
  required = false,
}) {
  const buildForm = (user) => {
    const location = normalizeLocationFields(user?.district, user?.upazila);
    return {
      name: user?.name || "",
      shopName: user?.shopName || "",
      email: user?.email || auth?.currentUser?.email || "",
      mobile: user?.mobile || "",
      shopAddress: user?.shopAddress || "",
      deliveryAddress: user?.deliveryAddress || "",
      district: location.district,
      upazila: location.upazila,
      bio: user?.bio || "",
    };
  };
  const [form, setForm] = useState(() => buildForm(data.user));
  const [phoneError, setPhoneError] = useState("");
  const [sameAddress, setSameAddress] = useState(() =>
    addressesAreSame(data.user?.shopAddress, data.user?.deliveryAddress),
  );
  const unreadCount = (data.notifications || []).filter((note) => !note.readAt).length;

  useEffect(() => {
    if (!data.user) return;
    setForm(buildForm(data.user));
    setSameAddress(
      addressesAreSame(data.user.shopAddress, data.user.deliveryAddress),
    );
  }, [data.user?.uid, data.user?.email]);

  useEffect(() => {
    if (!data.user) return;
    setSameAddress(
      addressesAreSame(data.user.shopAddress, data.user.deliveryAddress),
    );
  }, [data.user?.shopAddress, data.user?.deliveryAddress, data.user?.sameAsShopAddress]);

  const handleDistrictChange = (nextDistrict) => {
    const location = normalizeLocationFields(nextDistrict, "");
    setForm((prev) => ({
      ...prev,
      district: location.district,
      upazila: "",
    }));
  };

  const handleUpazilaChange = (nextUpazila) => {
    setForm((prev) => {
      const location = normalizeLocationFields(prev.district, nextUpazila);
      return {
        ...prev,
        district: location.district,
        upazila: location.upazila,
      };
    });
  };

  const handlePhoneChange = (e) => {
    const val = e.target.value;
    setForm((prev) => ({ ...prev, mobile: val }));
    if (val.trim() && !isValidBdPhoneNumber(val)) {
      setPhoneError("Please enter a valid Bangladeshi phone number (e.g. 017XXXXXXXX or +88017XXXXXXXX).");
    } else {
      setPhoneError("");
    }
  };

  const handleShopAddressChange = (e) => {
    const addr = e.target.value;
    setForm((prev) => {
      const deliveryAddress = sameAddress ? addr : prev.deliveryAddress;
      if (!sameAddress) {
        setSameAddress(addressesAreSame(addr, prev.deliveryAddress));
      }
      return {
        ...prev,
        shopAddress: addr,
        deliveryAddress,
      };
    });
  };

  const handleDeliveryAddressChange = (e) => {
    const value = e.target.value;
    setForm((prev) => {
      setSameAddress(addressesAreSame(prev.shopAddress, value));
      return { ...prev, deliveryAddress: value };
    });
  };

  const handleToggleSameAddress = (checked) => {
    setSameAddress(checked);
    if (checked) {
      setForm((prev) => ({ ...prev, deliveryAddress: prev.shopAddress }));
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const location = normalizeLocationFields(form.district, form.upazila);
    const shopAddress = form.shopAddress.trim();
    const deliveryAddress = sameAddress
      ? shopAddress
      : form.deliveryAddress.trim();
    const sameAsShopAddress = addressesAreSame(shopAddress, deliveryAddress);
    if (
      !form.name.trim() ||
      !form.shopName.trim() ||
      !shopAddress ||
      !deliveryAddress ||
      !location.district ||
      !location.upazila
    ) {
      alert("Please fill in all mandatory profile fields.");
      return;
    }
    if (!isValidBdPhoneNumber(form.mobile)) {
      setPhoneError("A valid Bangladeshi mobile phone number is required.");
      return;
    }
    onSave({
      ...form,
      name: form.name.trim(),
      shopName: form.shopName.trim(),
      email: (form.email || data.user?.email || auth?.currentUser?.email || "").trim().toLowerCase(),
      shopAddress,
      deliveryAddress,
      sameAsShopAddress,
      district: location.district,
      upazila: location.upazila,
      bio: form.bio ? form.bio.trim() : "",
      mobile: formatBdPhoneNumber(form.mobile),
    });
  };

  return (
    <section className="page narrow-page profile-onboarding-page">
      <div className="page-title profile-page-header">
        <span className="eyebrow">
          <Store size={14} /> {required ? "STEP 2 OF 2 · SETUP PROFILE" : "BUSINESS PROFILE"}
        </span>
        <h1>{required ? "Setup your business profile" : "Your profile & account"}</h1>
        <p>
          {required
            ? "Provide your store identity and delivery details to unlock smart QR sticker generation, inventory folders, and warranty activations."
            : "Update your store information, location details, and review system notifications."}
        </p>
      </div>

      <form className="profile-enhanced-form" onSubmit={handleSubmit}>
        {/* Step 1: Merchant & Store Identity */}
        <div className="profile-form-section">
          <div className="profile-section-header">
            <span className="profile-section-icon"><Store size={16} /></span>
            <div>
              <h3>Store &amp; Merchant Identity</h3>
              <p>Your shop name and owner details for customer warranty records</p>
            </div>
          </div>

          <div className="form-grid">
            <label>
              Merchant Full Name *
              <input
                required
                placeholder="e.g. Sujon Ahmed"
                value={form.name}
                onChange={(e) => {
                  const val = e.target.value;
                  setForm((prev) => ({ ...prev, name: val }));
                }}
              />
            </label>
            <label>
              Shop / Business Name *
              <input
                required
                placeholder="e.g. TechZone Electronics"
                value={form.shopName}
                onChange={(e) => {
                  const val = e.target.value;
                  setForm((prev) => ({ ...prev, shopName: val }));
                }}
              />
            </label>
          </div>
        </div>

        {/* Step 2: Contact & Account Details */}
        <div className="profile-form-section">
          <div className="profile-section-header">
            <span className="profile-section-icon"><Phone size={16} /></span>
            <div>
              <h3>Account &amp; Contact Details</h3>
              <p>Linked login email and primary Bangladeshi mobile number</p>
            </div>
          </div>

          <div className="form-grid">
            <label>
              Email Address
              <input
                type="email"
                value={form.email || data.user?.email || auth?.currentUser?.email || ""}
                readOnly
                disabled
                className="profile-email-readonly"
                placeholder="user@example.com"
                title="Your login email is automatically saved and linked to your account"
              />
              <small className="field-hint">
                Auto-saved from your login account.
              </small>
            </label>

            <label>
              Bangladeshi Mobile Phone Number *
              <input
                required
                inputMode="tel"
                placeholder="017XXXXXXXX or +88017XXXXXXXX"
                value={form.mobile}
                onChange={handlePhoneChange}
              />
              {form.mobile.trim() ? (
                isValidBdPhoneNumber(form.mobile) ? (
                  <span className="phone-validation-indicator valid">
                    <CheckCircle2 size={13} /> Valid BD number ({formatBdPhoneNumber(form.mobile)})
                  </span>
                ) : (
                  <span className="phone-validation-indicator invalid">
                    <AlertCircle size={13} /> {phoneError || "Invalid Bangladeshi phone number (11 digits, starts with 013-019)"}
                  </span>
                )
              ) : (
                <small className="field-hint">
                  Enter an 11-digit Bangladeshi mobile number (013, 014, 015, 016, 017, 018, 019).
                </small>
              )}
            </label>
          </div>
        </div>

        {/* Step 3: Location */}
        <div className="profile-form-section">
          <div className="profile-section-header">
            <span className="profile-section-icon"><MapPin size={16} /></span>
            <div>
              <h3>Store Location</h3>
              <p>Select your District and Upazila / Thana territory in Bangladesh</p>
            </div>
          </div>

          <LocationPicker
            district={form.district}
            upazila={form.upazila}
            onDistrictChange={handleDistrictChange}
            onUpazilaChange={handleUpazilaChange}
          />
        </div>

        {/* Step 4: Physical & Delivery Addresses */}
        <div className="profile-form-section">
          <div className="profile-section-header">
            <span className="profile-section-icon"><MapPin size={16} /></span>
            <div>
              <h3>Addresses</h3>
              <p>Physical store address and QR sticker package delivery destination</p>
            </div>
          </div>

          <label>
            Shop Physical Address *
            <textarea
              required
              rows={2}
              placeholder="e.g. Shop #14, Level 2, Eastern Plaza, Hatirpool, Dhaka"
              value={form.shopAddress}
              onChange={handleShopAddressChange}
            />
          </label>

          <div className="profile-address-block">
            <div className="profile-delivery-header">
              <span className="profile-field-label">Sticker Delivery Address *</span>
              <label className="profile-same-address">
                <input
                  type="checkbox"
                  checked={sameAddress}
                  onChange={(e) => handleToggleSameAddress(e.target.checked)}
                />
                Same as shop address
              </label>
            </div>
            <textarea
              required
              rows={2}
              placeholder="Address for receiving printed physical QR sticker sheets"
              value={form.deliveryAddress}
              disabled={sameAddress}
              onChange={handleDeliveryAddressChange}
            />
          </div>
        </div>

        {/* Step 5: Bio / Notes */}
        <div className="profile-form-section">
          <div className="profile-section-header">
            <span className="profile-section-icon"><Info size={16} /></span>
            <div>
              <h3>About Shop / Notes (Optional)</h3>
              <p>Additional business notes or warranty instructions</p>
            </div>
          </div>

          <textarea
            rows={2}
            placeholder="e.g. Official retailer for electronics, computers, and accessories"
            value={form.bio}
            onChange={(e) => {
              const val = e.target.value;
              setForm((prev) => ({ ...prev, bio: val }));
            }}
          />
        </div>

        <LoadingButton
          type="submit"
          className="primary-button full profile-submit-btn"
          busy={busy}
          loadingText="Saving profile…"
        >
          {!busy && (required ? <CheckCircle2 size={18} /> : <CheckCircle2 size={18} />)}
          {required ? "Save Profile & Launch Dashboard" : "Update Profile"}
        </LoadingButton>
      </form>

      {!required && (
        <article className="panel" style={{ padding: "22px 24px", marginTop: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <h2 style={{ margin: 0, fontSize: "17px", display: "flex", alignItems: "center", gap: "8px" }}>
              <TrendingUp size={18} color="#0d9488" /> Business Statistics &amp; Analytics
            </h2>
            <span className="pill success" style={{ fontSize: "11px" }}>Live Overview</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "12px" }}>
            <div style={{ background: "#f0fdf4", padding: "12px 14px", borderRadius: "10px", border: "1px solid #bbf7d0" }}>
              <span style={{ fontSize: "11px", color: "#15803d", display: "block", fontWeight: "600" }}>Total Net Profit</span>
              <strong style={{ fontSize: "17px", color: "#15803d" }}>BDT {money(data.stats?.totalProfit || 0)}</strong>
            </div>

            <div style={{ background: "#eff6ff", padding: "12px 14px", borderRadius: "10px", border: "1px solid #bfdbfe" }}>
              <span style={{ fontSize: "11px", color: "#1d4ed8", display: "block", fontWeight: "600" }}>Product Sales (Revenue)</span>
              <strong style={{ fontSize: "17px", color: "#1d4ed8" }}>BDT {money(data.stats?.totalAmount || 0)}</strong>
            </div>

            <div style={{ background: "#f8fafc", padding: "12px 14px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
              <span style={{ fontSize: "11px", color: "#64748b", display: "block", fontWeight: "600" }}>Products Created/Added</span>
              <strong style={{ fontSize: "17px", color: "#0f172a" }}>{data.stats?.totalProducts || 0}</strong>
            </div>

            <div style={{ background: "#f8fafc", padding: "12px 14px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
              <span style={{ fontSize: "11px", color: "#64748b", display: "block", fontWeight: "600" }}>Products Sold / Activated</span>
              <strong style={{ fontSize: "17px", color: "#0f172a" }}>{data.stats?.totalSales || 0}</strong>
            </div>

            <div style={{ background: "#f8fafc", padding: "12px 14px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
              <span style={{ fontSize: "11px", color: "#64748b", display: "block", fontWeight: "600" }}>QRs Generated</span>
              <strong style={{ fontSize: "17px", color: "#0f172a" }}>{data.stats?.totalQrs || 0}</strong>
            </div>

            <div style={{ background: "#faf5ff", padding: "12px 14px", borderRadius: "10px", border: "1px solid #e9d5ff" }}>
              <span style={{ fontSize: "11px", color: "#7e22ce", display: "block", fontWeight: "600" }}>QRs Activated</span>
              <strong style={{ fontSize: "17px", color: "#7e22ce" }}>{data.stats?.activatedQrs || 0}</strong>
            </div>

            <div style={{ background: "#fff7ed", padding: "12px 14px", borderRadius: "10px", border: "1px solid #fed7aa" }}>
              <span style={{ fontSize: "11px", color: "#c2410c", display: "block", fontWeight: "600" }}>QRs Expired</span>
              <strong style={{ fontSize: "17px", color: "#c2410c" }}>{data.stats?.expiredWarranties || data.stats?.expiredQrs || 0}</strong>
            </div>

            <div style={{ background: "#fff7ed", padding: "12px 14px", borderRadius: "10px", border: "1px solid #fed7aa" }}>
              <span style={{ fontSize: "11px", color: "#c2410c", display: "block", fontWeight: "600" }}>Returns</span>
              <strong style={{ fontSize: "17px", color: "#c2410c" }}>{data.stats?.totalReturns || 0}</strong>
            </div>

            <div style={{ background: "#f8fafc", padding: "12px 14px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
              <span style={{ fontSize: "11px", color: "#64748b", display: "block", fontWeight: "600" }}>Available QRs</span>
              <strong style={{ fontSize: "17px", color: "#0f172a" }}>{data.stats?.availableQr || 0}</strong>
            </div>

            <div style={{ background: "#f0fdf4", padding: "12px 14px", borderRadius: "10px", border: "1px solid #bbf7d0" }}>
              <span style={{ fontSize: "11px", color: "#15803d", display: "block", fontWeight: "600" }}>Active Warranties</span>
              <strong style={{ fontSize: "17px", color: "#15803d" }}>{data.stats?.activeWarranties || 0}</strong>
            </div>

            <div style={{ background: "#fff7ed", padding: "12px 14px", borderRadius: "10px", border: "1px solid #fed7aa" }}>
              <span style={{ fontSize: "11px", color: "#c2410c", display: "block", fontWeight: "600" }}>Expired Warranties</span>
              <strong style={{ fontSize: "17px", color: "#c2410c" }}>{data.stats?.expiredWarranties || 0}</strong>
            </div>
          </div>
        </article>
      )}

      <article className="panel" style={{ padding: "22px 24px", marginTop: "24px" }}>
        <div className="notifications-header-wrap">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <h2 style={{ margin: 0, fontSize: "17px", display: "flex", alignItems: "center", gap: "8px" }}>
              <Bell size={18} color="#0d9488" /> Messages from WarQ
            </h2>
            {unreadCount > 0 && (
              <span className="notifications-count-badge">{unreadCount} new</span>
            )}
          </div>
          {data.notifications?.length > 0 && onClearNotifications && (
            <button
              type="button"
              className="clear-all-notif-btn"
              onClick={onClearNotifications}
              title="Delete all notifications"
            >
              <Trash2 size={12} /> Clear all
            </button>
          )}
        </div>

        {data.notifications?.length ? (
          <div className="notifications-list">
            {data.notifications.map((note) => (
              <div
                className={`notification-card ${!note.readAt ? "unread" : ""}`}
                key={note.id}
                onClick={() => !note.readAt && onRead?.(note.id)}
                style={{ cursor: !note.readAt ? "pointer" : "default" }}
              >
                <div className="notification-card-top">
                  <h3 className="notification-card-title">
                    {!note.readAt && <span className="pulse-dot" style={{ flexShrink: 0 }}></span>}
                    {note.title || "Notification"}
                  </h3>
                  {onDeleteNotification && (
                    <button
                      type="button"
                      className="notification-del-btn"
                      title="Delete notification"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteNotification(note.id);
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <p className="notification-card-body">{note.message}</p>
                <div className="notification-card-footer">
                  <span>{dateTimeWithDay(note.createdAt)}</span>
                  <span className={note.readAt ? "pill neutral" : "pill success"} style={{ fontSize: "10px", padding: "2px 8px" }}>
                    {note.readAt ? "Read" : "New"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            Icon={Bell}
            title="No notifications"
            text="Admin messages and system announcements will appear here."
          />
        )}
      </article>
    </section>
  );
}

function NotificationsView({
  data,
  onBack,
  onRead,
  onDeleteNotification,
  onClearNotifications,
  busy,
}) {
  const [filter, setFilter] = useState("all");
  const notifications = useMemo(() => data?.notifications || [], [data?.notifications]);
  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.readAt).length,
    [notifications],
  );
  const readCount = notifications.length - unreadCount;

  const filteredNotifications = useMemo(() => {
    if (filter === "unread") return notifications.filter((n) => !n.readAt);
    if (filter === "read") return notifications.filter((n) => Boolean(n.readAt));
    return notifications;
  }, [notifications, filter]);

  return (
    <section className="page notifications-page">
      <div className="page-title row-title">
        <div>
          <span className="eyebrow">SYSTEM &amp; ACCOUNT NOTIFICATIONS</span>
          <h1 style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span>Notifications</span>
            {unreadCount > 0 && (
              <span className="notifications-count-badge">{unreadCount} new</span>
            )}
          </h1>
          <p>System updates, alerts, announcements, and messages from WarQ.</p>
        </div>
        <div className="row-actions" style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          {onBack && (
            <button type="button" className="secondary-button" onClick={onBack}>
              Back to Dashboard
            </button>
          )}
        </div>
      </div>

      <article className="panel notifications-panel" style={{ padding: "22px 24px" }}>
        {notifications.length > 0 && (
          <div className="notifications-filter-bar">
            <button
              type="button"
              className={`filter-pill ${filter === "all" ? "active" : ""}`}
              onClick={() => setFilter("all")}
            >
              All <span className="pill-count">{notifications.length}</span>
            </button>
            <button
              type="button"
              className={`filter-pill ${filter === "unread" ? "active" : ""}`}
              onClick={() => setFilter("unread")}
            >
              Unread <span className="pill-count">{unreadCount}</span>
            </button>
            <button
              type="button"
              className={`filter-pill ${filter === "read" ? "active" : ""}`}
              onClick={() => setFilter("read")}
            >
              Read <span className="pill-count">{readCount}</span>
            </button>
            {onClearNotifications && (
              <button
                type="button"
                className="clear-all-notif-btn"
                onClick={() => {
                  if (window.confirm("Are you sure you want to clear all notifications?")) {
                    onClearNotifications();
                  }
                }}
                title="Delete all notifications"
              >
                <Trash2 size={13} />
                <span>Clear all</span>
              </button>
            )}
          </div>
        )}

        {filteredNotifications.length > 0 ? (
          <div className="notifications-list">
            {filteredNotifications.map((note) => (
              <div
                key={note.id}
                className={`notification-card ${!note.readAt ? "unread" : ""}`}
                onClick={() => !note.readAt && onRead?.(note.id)}
                style={{ cursor: !note.readAt ? "pointer" : "default" }}
                title={!note.readAt ? "Click to mark as read" : undefined}
              >
                <div className="notification-card-top">
                  <h3 className="notification-card-title">
                    {!note.readAt && <span className="pulse-dot" style={{ flexShrink: 0 }}></span>}
                    <span>{note.title || "Notification"}</span>
                  </h3>
                  <div className="notification-card-actions">
                    {!note.readAt && onRead && (
                      <button
                        type="button"
                        className="mark-read-inline-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRead(note.id);
                        }}
                        title="Mark as read"
                      >
                        <Check size={13} />
                        <span>Mark read</span>
                      </button>
                    )}
                    {onDeleteNotification && (
                      <button
                        type="button"
                        className="notification-del-btn"
                        title="Delete notification"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteNotification(note.id);
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
                <p className="notification-card-body">{note.message}</p>
                <div className="notification-card-footer">
                  <span>{dateTimeWithDay(note.createdAt)}</span>
                  <span
                    className={note.readAt ? "pill neutral" : "pill success"}
                    style={{ fontSize: "10px", padding: "2px 8px" }}
                  >
                    {note.readAt ? "Read" : "New"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            Icon={filter === "unread" ? CheckCircle2 : Bell}
            title={
              filter === "unread"
                ? "No unread notifications"
                : filter === "read"
                  ? "No read notifications"
                  : "No notifications"
            }
            text={
              filter === "unread"
                ? "You are all caught up! There are no unread notifications."
                : filter === "read"
                  ? "None of your notifications have been marked as read yet."
                  : "Admin messages, announcements, and system alerts will appear here."
            }
          />
        )}
      </article>
    </section>
  );
}

function QrScanner({ onClose, onOpenInventory }) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [processing, setProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  const scanHandler = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let reader = null;
    let resolving = false;

    const handleScan = async (decodedText) => {
      if (cancelled || resolving) return;
      resolving = true;
      setError("");
      setProcessing(true);
      setProcessingStatus("Verifying QR code…");
      try {
        if (reader?.isScanning) await reader.stop().catch(() => {});
        const code = scannedWarqCode(decodedText);
        if (!code) {
          const invalid = new Error("This is not a valid WarQ QR code.");
          invalid.code = "invalid-argument";
          throw invalid;
        }
        setProcessingStatus("Loading QR details…");
        const response = await api.getQr(code);
        if (!cancelled) setResult(response.qr);
      } catch (err) {
        if (!cancelled) setError(errorText(err));
        resolving = false;
      } finally {
        if (!cancelled) {
          setProcessing(false);
          setProcessingStatus("");
        }
      }
    };

    scanHandler.current = handleScan;

    const startCamera = async () => {
      try {
        reader = new Html5Qrcode("warq-qr-reader", { verbose: false });
        await reader.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 230, height: 230 }, aspectRatio: 1 },
          handleScan,
          () => {},
        );
      } catch (err) {
        if (!cancelled)
          setError(
            "Camera access is unavailable. Allow camera access, or enter the QR ID below.",
          );
      }
    };

    startCamera();
    return () => {
      cancelled = true;
      scanHandler.current = null;
      if (reader?.isScanning) reader.stop().catch(() => {});
    };
  }, [attempt]);

  const restart = () => {
    setResult(null);
    setError("");
    setManualCode("");
    setProcessing(false);
    setProcessingStatus("");
    setAttempt((value) => value + 1);
  };

  const submitManualCode = (event) => {
    event.preventDefault();
    if (processing || !manualCode.trim()) return;
    scanHandler.current?.(manualCode);
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Scan a WarQ QR code"
    >
      <section className="scanner-modal">
        <button
          type="button"
          className="close-button"
          onClick={onClose}
          disabled={processing}
          aria-label="Close QR scanner"
        >
          <X />
        </button>
        <div className="scanner-title">
          <span className="scan-icon">
            <ScanLine />
          </span>
          <div>
            <span className="eyebrow">MOBILE QR SCANNER</span>
            <h2>Scan your product QR</h2>
          </div>
        </div>
        {processing ? (
          <div className="scanner-processing" aria-live="polite" role="status">
            <div className="scanner-processing-visual">
              <div className="scanner-laser-box">
                <QrCode size={42} className="scanner-pulse-icon" />
                <div className="scanner-laser-line"></div>
              </div>
            </div>
            <div className="scanner-processing-info">
              <div className="scanner-processing-heading">
                <LoaderCircle className="spin" size={18} />
                <h3>Processing QR Code…</h3>
              </div>
              <p className="scanner-processing-status">
                {processingStatus || "Verifying QR code…"}
              </p>
            </div>
            <div className="scanner-processing-bar-wrap">
              <div className="scanner-processing-bar"></div>
            </div>
            <p className="scanner-processing-hint">Please wait a moment while WarQ connects to the server.</p>
          </div>
        ) : result ? (
          <div className="scanner-result">
            <span className="scan-icon">
              <CheckCircle2 />
            </span>
            <h3>QR verified</h3>
            <p>This QR code belongs to your signed-in WarQ account.</p>
            <dl>
              <div>
                <dt>Product</dt>
                <dd>{result.productName}</dd>
              </div>
              <div>
                <dt>QR ID</dt>
                <dd>{result.code}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{result.status}</dd>
              </div>
            </dl>
            <div className="scanner-result-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={onOpenInventory}
              >
                <QrCode /> QR inventory
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={restart}
              >
                <ScanLine /> Scan another
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="scanner-helper">
              Scan a WarQ product code with your camera. For security, only QR
              codes owned by your signed-in account can be opened here.
            </p>
            <div id="warq-qr-reader" className="reader" />
            {error && (
              <div className="camera-error-box">
                <p className="camera-error">{error}</p>
                <button
                  type="button"
                  className="secondary-button"
                  style={{ marginTop: "8px", width: "100%", justifyContent: "center", display: "inline-flex", alignItems: "center", gap: "6px" }}
                  onClick={restart}
                >
                  <RefreshCcw size={14} /> Restart Camera / Try Again
                </button>
              </div>
            )}
            <form className="manual-scan" onSubmit={submitManualCode}>
              <span>Camera not available? Enter the QR ID instead.</span>
              <div>
                <input
                  value={manualCode}
                  onChange={(event) => setManualCode(event.target.value)}
                  placeholder="WQ-..."
                  aria-label="QR ID"
                  disabled={processing}
                />
                <button
                  type="submit"
                  className="primary-button"
                  disabled={!manualCode.trim() || processing}
                >
                  {processing ? <LoaderCircle className="spin" size={16} /> : <ScanLine size={16} />} Check
                </button>
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  );
}

function EnrichedQrScanner({
  onClose,
  onOpenInventory,
  onVerified,
  onOpenProduct,
  onRecordSale,
  onReturnSale,
}) {
const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [processing, setProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  const [pending, setPending] = useState(null);
  const [salePrice, setSalePrice] = useState("");
  const [salePriceErr, setSalePriceErr] = useState("");
  const [saleCustomer, setSaleCustomer] = useState({ name: "", phone: "", address: "", notes: "" });
  const [salePhoneErr, setSalePhoneErr] = useState("");
  const scanHandler = useRef(null);
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);
  useEffect(() => {
    let cancelled = false;
    let reader = null;
    let resolving = false;
    const handleScan = async (decodedText) => {
      if (cancelled || resolving) return;
      resolving = true;
      setError("");
      setProcessing(true);
      setProcessingStatus("Verifying QR code...");
      try {
        if (reader?.isScanning) await reader.stop().catch(() => {});
        const code = scannedWarqCode(decodedText);
        if (!code) {
          const invalid = new Error("This is not a valid WarQ QR code.");
          invalid.code = "invalid-argument";
          throw invalid;
        }
        setProcessingStatus("Loading QR records...");
        const response = await api.getQr(code);
        const qr = response.qr;
        if (qr.status === "returned") {
          if (!cancelled) setResult({ qr, product: null, stats: null, saleRecorded: false });
        } else if (qr.status === "generated" || qr.status === "inactive" || qr.status === "sold") {
          // Pause for confirmation so the shopkeeper can enter the actual
          // sale price paid by the customer before the warranty is activated.
          if (!cancelled) {
            setSalePrice(
              qr.actualPrice != null
                ? String(qr.actualPrice)
                : qr.defaultPrice != null
                  ? String(qr.defaultPrice)
                  : "",
            );
            setSaleCustomer({
              name: qr.customerName || "",
              phone: qr.customerPhone || "",
              address: qr.customerAddress || "",
              notes: qr.customerNotes || "",
            });
            setSalePriceErr("");
            setSalePhoneErr("");
            setResult(null);
            setPending(qr);
          }
        } else {
          setProcessingStatus("Synchronizing dashboard & analytics...");
          const dashboard = await onVerified(qr);
          if (!cancelled)
            setResult({
              qr,
              product: dashboard?.product || null,
              stats: dashboard?.stats || null,
              saleRecorded: false,
            });
        }
      } catch (err) {
        if (!cancelled) setError(errorText(err));
        resolving = false;
      } finally {
        if (!cancelled) {
          setProcessing(false);
          setProcessingStatus("");
        }
      }
    };
    scanHandler.current = handleScan;
    const startCamera = async () => {
      try {
        reader = new Html5Qrcode("warq-qr-reader", { verbose: false });
        await reader.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 230, height: 230 }, aspectRatio: 1 },
          handleScan,
          () => {},
        );
      } catch (err) {
        if (!cancelled)
          setError(
            "Camera access is unavailable. Allow camera access, or enter the QR ID below.",
          );
      }
    };
    startCamera();
    return () => {
      cancelled = true;
      scanHandler.current = null;
      if (reader?.isScanning) reader.stop().catch(() => {});
    };
  }, [attempt]);
  const restart = () => {
    setResult(null);
    setError("");
    setManualCode("");
    setProcessing(false);
    setProcessingStatus("");
    setPending(null);
    setSalePrice("");
    setSalePriceErr("");
    setSaleCustomer({ name: "", phone: "", address: "", notes: "" });
    setSalePhoneErr("");
    setAttempt((value) => value + 1);
  };
  const submitManualCode = (event) => {
    event.preventDefault();
    if (processing || !manualCode.trim()) return;
    scanHandler.current?.(manualCode);
  };
  const confirmSale = async (event) => {
    if (event) event.preventDefault();
    if (!pending) return;
    const priceInput = String(salePrice ?? "").trim();
    const hasPrice = priceInput !== "";
    const numeric = Number(priceInput);
    if (hasPrice && (!Number.isFinite(numeric) || numeric < 0)) {
      setSalePriceErr("Enter a valid sale price amount.");
      return;
    }
    if (saleCustomer.phone.trim() && !isValidBdPhoneNumber(saleCustomer.phone)) {
      setSalePhoneErr("Please enter a valid 11-digit Bangladeshi mobile number.");
      return;
    }
    setSalePriceErr("");
    setSalePhoneErr("");
    setProcessing(true);
    setProcessingStatus(
      pending.status === "sold"
        ? "Activating warranty..."
        : "Registering sale and activating warranty...",
    );
    try {
      let finalQr;
      if (pending.status === "sold") {
        const activation = await api.activateQr({
          code: pending.code,
          ...(hasPrice ? { actualPrice: numeric } : {}),
          ...(saleCustomer.name.trim() || saleCustomer.phone.trim() || saleCustomer.address.trim()
            ? {
                customerName: saleCustomer.name.trim(),
                customerPhone: formatBdPhoneNumber(saleCustomer.phone),
                customerAddress: saleCustomer.address.trim(),
                customerNotes: saleCustomer.notes.trim(),
              }
            : {}),
        });
        finalQr = activation.qr;
      } else {
        setProcessingStatus("Updating QR status...");
        const recorded = await onRecordSale(pending, {
          ...(hasPrice ? { actualPrice: numeric } : {}),
          customerName: saleCustomer.name.trim(),
          customerPhone: formatBdPhoneNumber(saleCustomer.phone),
          customerAddress: saleCustomer.address.trim(),
          customerNotes: saleCustomer.notes.trim(),
        });
        finalQr = recorded?.qr;
        if (!finalQr || finalQr.status === "sold") {
          const latest = await api.getQr(pending.code);
          finalQr = latest.qr;
        }
      }
      setProcessingStatus("Synchronizing dashboard & analytics...");
      const dashboard = await onVerified(finalQr);
      if (aliveRef.current) {
        setPending(null);
        setSalePrice("");
        setSaleCustomer({ name: "", phone: "", address: "", notes: "" });
        setResult({
          qr: finalQr,
          product: dashboard?.product || null,
          stats: dashboard?.stats || null,
          saleRecorded: true,
        });
      }
    } catch (err) {
      if (aliveRef.current) setError(errorText(err));
    } finally {
      if (aliveRef.current) {
        setProcessing(false);
        setProcessingStatus("");
      }
    }
  };
  const qr = result?.qr;
  const stats = result?.stats;
  const defaultPrice = pending
    ? pending.actualPrice != null
      ? pending.actualPrice
      : pending.defaultPrice
    : null;
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Scan a WarQ QR code"
    >
      <section className="scanner-modal">
        <button
          type="button"
          className="close-button"
          onClick={onClose}
          disabled={processing}
          aria-label="Close QR scanner"
        >
          <X />
        </button>
        <div className="scanner-title">
          <span className="scan-icon">
            <ScanLine />
          </span>
          <div>
            <span className="eyebrow">MOBILE QR SCANNER</span>
            <h2>Scan your product QR</h2>
          </div>
        </div>
        {processing ? (
          <div className="scanner-processing" aria-live="polite" role="status">
            <div className="scanner-processing-visual">
              <div className="scanner-laser-box">
                <QrCode size={42} className="scanner-pulse-icon" />
                <div className="scanner-laser-line"></div>
              </div>
            </div>
            <div className="scanner-processing-info">
              <div className="scanner-processing-heading">
                <LoaderCircle className="spin" size={18} />
                <h3>Processing QR Code…</h3>
              </div>
              <p className="scanner-processing-status">
                {processingStatus || "Verifying and updating warranty records…"}
              </p>
            </div>
            <div className="scanner-processing-bar-wrap">
              <div className="scanner-processing-bar"></div>
            </div>
            <p className="scanner-processing-hint">Please wait a moment while WarQ synchronizes with the server.</p>
          </div>
        ) : pending ? (
          <div className="scanner-result scanner-result-enriched" aria-live="polite">
            <div className="warranty-hero-banner neutral">
              <div className="status-hero-icon">
                <ShoppingBag size={24} />
              </div>
              <div className="status-hero-text">
                <h3>Confirm Sale &amp; Warranty Activation</h3>
                <p>This QR has not been activated yet. Confirm the actual sale price before starting the warranty.</p>
              </div>
            </div>
            <div className="scanner-sale-confirm">
              <form onSubmit={confirmSale}>
                {pending.defaultPrice != null && (
                  <div className="scanner-price-compare">
                    <span>
                      Product Price
                      <strong>BDT {money(pending.defaultPrice)}</strong>
                    </span>
                    {pending.costPrice != null && (
                      <span>
                        Unit Cost
                        <strong>BDT {money(pending.costPrice)}</strong>
                      </span>
                    )}
                  </div>
                )}
                {error && (
                  <div className="camera-error-box">
                    <p className="camera-error">{error}</p>
                  </div>
                )}
                <label className="scanner-sale-price-field">
                  <span>Actual Sale Price (BDT)</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    placeholder={defaultPrice != null ? `Default: ${money(defaultPrice)}` : "0"}
                    value={salePrice}
                    onChange={(e) => {
                      setSalePrice(e.target.value);
                      if (salePriceErr) setSalePriceErr("");
                    }}
                  />
                  {salePriceErr && <small className="scanner-form-error">{salePriceErr}</small>}
                </label>

                <div className="scanner-customer-grid">
                  <label>
                    Customer Name (Optional)
                    <input
                      value={saleCustomer.name}
                      onChange={(e) => setSaleCustomer({ ...saleCustomer, name: e.target.value })}
                      placeholder="e.g. Rahim Chowdhury"
                    />
                  </label>
                  <label>
                    Customer Phone (Optional)
                    <input
                      inputMode="tel"
                      value={saleCustomer.phone}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSaleCustomer({ ...saleCustomer, phone: v });
                        if (v.trim() && !isValidBdPhoneNumber(v)) {
                          setSalePhoneErr("Invalid BD mobile number");
                        } else {
                          setSalePhoneErr("");
                        }
                      }}
                      placeholder="017XXXXXXXX"
                    />
                    {salePhoneErr && <small className="scanner-form-error">{salePhoneErr}</small>}
                  </label>
                </div>

                <label>
                  Customer Address / Notes (Optional)
                  <input
                    value={saleCustomer.address}
                    onChange={(e) => setSaleCustomer({ ...saleCustomer, address: e.target.value })}
                    placeholder="Customer address or invoice #"
                  />
                </label>

                <div className="scanner-confirm-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={restart}
                    disabled={processing}
                  >
                    Scan another
                  </button>
                  <button type="submit" className="primary-button" disabled={processing}>
                    {processing ? <LoaderCircle className="spin" size={16} /> : <CheckCircle2 size={16} />}
                    {pending.status === "sold" ? "Activate Warranty" : "Activate Warranty &amp; Record Sale"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : qr ? (
          <div className="scanner-result scanner-result-enriched" aria-live="polite">
            {qr.status === "returned" ? (
              <div className="warranty-hero-banner expired">
                <div className="status-hero-icon">
                  <RotateCcw size={24} />
                </div>
                <div className="status-hero-text">
                  <h3>Returned · Warranty Voided</h3>
                  <p>This QR was returned and cannot be activated or sold again.</p>
                </div>
              </div>
            ) : qr.warrantyDuration ? (
              (qr.status === "activated" || Boolean(qr.activatedAt)) ? null : (
                <div className="warranty-hero-banner neutral">
                  <div className="status-hero-icon">
                    <Clock size={24} />
                  </div>
                  <div className="status-hero-text">
                    <h3>Awaiting Activation</h3>
                    <p>Coverage begins immediately upon sale activation.</p>
                  </div>
                </div>
              )
            ) : (
              <div className="warranty-hero-banner neutral">
                <div className="status-hero-icon">
                  <Info size={24} />
                </div>
                <div className="status-hero-text">
                  <h3>No Warranty</h3>
                  <p>No warranty coverage configured.</p>
                </div>
              </div>
            )}

            <div className="scanner-countdown-wrap">
              <LiveWarrantyCountdownBlock
                expiresAt={qr.warrantyExpiresAt}
                duration={qr.warrantyDuration}
                status={qr.status}
                isActivated={qr.status === "activated" || Boolean(qr.activatedAt)}
              />
            </div>

            <dl className="scanner-details">
              <div>
                <dt>Product</dt>
                <dd>{qr.productName}</dd>
              </div>
              <div>
                <dt>Unit ID / Product ID</dt>
                <dd>{qr.productId || "Not recorded"}</dd>
              </div>
              <div>
                <dt>Unique Code</dt>
                <dd className="code-font">{qr.code}</dd>
              </div>
              <div>
                <dt>Serial</dt>
                <dd>#{qr.serial}</dd>
              </div>
              {qr.customerName && (
                <div>
                  <dt>Customer Name</dt>
                  <dd>{qr.customerName}</dd>
                </div>
              )}
              {qr.customerPhone && (
                <div>
                  <dt>Customer Mobile</dt>
                  <dd>{qr.customerPhone}</dd>
                </div>
              )}
              {qr.customerAddress && (
                <div>
                  <dt>Customer Address</dt>
                  <dd>{qr.customerAddress}</dd>
                </div>
              )}
              <div>
                <dt>Status</dt>
                <dd>{qr.status === "returned" ? "Returned (warranty voided)" : qr.status}</dd>
              </div>
              {qr.returnedAt && (
                <div>
                  <dt>Returned At</dt>
                  <dd>{dateTimeWithDay(qr.returnedAt)}</dd>
                </div>
              )}
              {qr.returnReason ? (
                <div className="scanner-note">
                  <dt>Return reason</dt>
                  <dd>{qr.returnReason}</dd>
                </div>
              ) : null}
              <div>
                <dt>Shop</dt>
                <dd>{qr.shopName || "Not recorded"}</dd>
              </div>
              <div>
                <dt>Address</dt>
                <dd>{qr.shopAddress || "Not recorded"}</dd>
              </div>
              <div>
                <dt>Sale price</dt>
                <dd>
                  {qr.actualPrice == null
                    ? qr.defaultPrice == null
                      ? "Not recorded"
                      : "BDT " + money(qr.defaultPrice)
                    : "BDT " + money(qr.actualPrice)}
                </dd>
              </div>
              <div>
                <dt>Unit cost</dt>
                <dd>
                  {qr.costPrice == null
                    ? "Not recorded"
                    : "BDT " + money(qr.costPrice)}
                </dd>
              </div>
              <div>
                <dt>Warranty</dt>
                <dd>{warrantyText(qr.warrantyDuration)}</dd>
              </div>
              <div>
                <dt>Activated At</dt>
                <dd>{qr.activationDate || qr.activatedAt ? dateTimeWithDay(qr.activationDate || qr.activatedAt) : "Awaiting activation"}</dd>
              </div>
              <div>
                <dt>Expires At</dt>
                <dd>{qr.warrantyDuration ? (qr.warrantyExpiresAt ? dateTimeWithDay(qr.warrantyExpiresAt) : "Starts on activation") : "No Warranty"}</dd>
              </div>
              {qr.notes && (
                <div className="scanner-note">
                  <dt>Notes</dt>
                  <dd>{qr.notes}</dd>
                </div>
              )}
              {qr.customerNotes && (
                <div className="scanner-note">
                  <dt>Customer Notes</dt>
                  <dd>{qr.customerNotes}</dd>
                </div>
              )}
            </dl>
            {stats && (
              <section
                className="scanner-dashboard-summary"
                aria-label="Updated dashboard statistics"
              >
                <h4>Updated dashboard</h4>
                <div>
                  <span>
                    Revenue<strong>BDT {money(stats.totalAmount)}</strong>
                  </span>
                  <span>
                    Products sold<strong>{stats.totalSales}</strong>
                  </span>
                  <span>
                    Profit<strong>BDT {money(stats.totalProfit)}</strong>
                  </span>
                  <span>
                    Active warranties<strong>{stats.activeWarranties}</strong>
                  </span>
                  <span>
                    Expired warranties<strong>{stats.expiredWarranties}</strong>
                  </span>
                  <span>
                    No warranty<strong>{stats.noWarrantyProducts}</strong>
                  </span>
                  <span>
                    Activated QRs<strong>{stats.activatedQrs}</strong>
                  </span>
                  <span>
                    Returns<strong>{stats.totalReturns || 0}</strong>
                  </span>
                </div>
                <p>
                  Dashboard totals refresh immediately after the QR is activated.
                </p>
              </section>
            )}
            {qr.status === "activated" && onReturnSale ? (
              <ReturnSaleControls
                sale={{
                  id: qr.saleId,
                  code: qr.code,
                  status: qr.status,
                  activatedAt: qr.activatedAt,
                }}
                onReturnSale={async (payload) => {
                  await onReturnSale(payload);
                  const latest = await api.getQr(qr.code);
                  const dashboard = await onVerified(latest.qr);
                  setResult({
                    qr: latest.qr,
                    product: dashboard?.product || result?.product || null,
                    stats: dashboard?.stats || result?.stats || null,
                    saleRecorded: false,
                  });
                }}
              />
            ) : null}
            <div className="scanner-result-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={onOpenInventory}
              >
                <QrCode /> QR inventory
              </button>
              {result.product && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => onOpenProduct(result.product, qr)}
                >
                  <ShoppingBag /> Product details
                </button>
              )}
              <button
                type="button"
                className="primary-button"
                onClick={restart}
              >
                <ScanLine /> Scan another
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="scanner-helper">
              Scan a WarQ product code with your camera. After scanning, confirm
              the actual sale price before the warranty is activated.
            </p>
            <div id="warq-qr-reader" className="reader" />
            {error && (
              <div className="camera-error-box">
                <p className="camera-error">{error}</p>
                <button
                  type="button"
                  className="secondary-button"
                  style={{ marginTop: "8px", width: "100%", justifyContent: "center", display: "inline-flex", alignItems: "center", gap: "6px" }}
                  onClick={restart}
                >
                  <RefreshCcw size={14} /> Restart Camera / Try Again
                </button>
              </div>
            )}
            <form className="manual-scan" onSubmit={submitManualCode}>
              <span>Camera not available? Enter the QR ID instead.</span>
              <div>
                <input
                  value={manualCode}
                  onChange={(event) => setManualCode(event.target.value)}
                  placeholder="WQ-..."
                  aria-label="QR ID"
                  disabled={processing}
                />
                <button
                  type="submit"
                  className="primary-button"
                  disabled={!manualCode.trim() || processing}
                >
                  {processing ? <LoaderCircle className="spin" size={16} /> : <ScanLine size={16} />} Check
                </button>
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
function CustomerWarranty({ code, onBack, onActivated }) {
  const [qr, setQr] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [usePublicView, setUsePublicView] = useState(false),
    [custForm, setCustForm] = useState({ name: "", phone: "", address: "", notes: "", price: "" }),
    [salePriceErr, setSalePriceErr] = useState(""),
    [phoneErr, setPhoneErr] = useState("");
  const started = useRef(false);

  const load = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await api.getQr(code);
      setUsePublicView(false);
      setQr(result.qr);
      const existingCustomer =
        result.qr?.customerName || result.qr?.customerPhone;
      setCustForm({
        name: result.qr.customerName || "",
        phone: result.qr.customerPhone || "",
        address: result.qr.customerAddress || "",
        notes: result.qr.customerNotes || "",
        price: result.qr?.actualPrice != null
          ? String(result.qr.actualPrice)
          : result.qr?.defaultPrice != null
            ? String(result.qr.defaultPrice)
            : ""
      });
      if (existingCustomer) setPhoneErr("");
    } catch (err) {
      const belongsToOther =
        err?.code === "permission-denied" &&
        /another WarQ account|another account/i.test(err?.message || "");
      if (belongsToOther) {
        setUsePublicView(true);
        setError("");
        return;
      }
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const handlePhoneInput = (val) => {
    setCustForm((prev) => ({ ...prev, phone: val }));
    if (val.trim() && !isValidBdPhoneNumber(val)) {
      setPhoneErr("Enter a valid 11-digit Bangladeshi mobile number (e.g. 017XXXXXXXX).");
    } else {
      setPhoneErr("");
    }
  };

  const handleActivateSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!custForm.name.trim()) {
      setError("Please enter the customer's name.");
      return;
    }
    if (!isValidBdPhoneNumber(custForm.phone)) {
      setPhoneErr("A valid 11-digit Bangladeshi mobile number is required.");
      return;
    }
    const priceInput = String(custForm.price ?? "").trim();
    const numericPrice = Number(priceInput);
    if (priceInput !== "" && (!Number.isFinite(numericPrice) || numericPrice < 0)) {
      setSalePriceErr("Enter a valid sale price amount.");
      return;
    }
    setSalePriceErr("");
    setBusy(true);
    setError("");
    try {
      const activation = await api.recordSale({
        code,
        ...(priceInput !== "" ? { actualPrice: numericPrice } : {}),
        customerName: custForm.name.trim(),
        customerPhone: formatBdPhoneNumber(custForm.phone),
        customerAddress: custForm.address.trim(),
        customerNotes: custForm.notes.trim(),
      });
      setQr(activation.qr);
      await onActivated?.();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load();
  }, [code]);

  if (usePublicView) {
    return <PublicCustomerWarranty code={code} onShopkeeperLogin={onBack} />;
  }

  if (busy && !qr) return <Loading />;
  if (error)
    return (
      <main className="loading-screen">
        <section className="panel session-error">
          <div className="brand-mark">
            <QrCode />
          </div>
          <h1>QR status unavailable</h1>
          <p>{error}</p>
          <p style={{ fontSize: "13px", color: "#64748b", marginTop: "8px" }}>
            Only the WarQ account that generated this QR code can open the shopkeeper activation view. Customers can still view warranty details when the seller subscription is active.
          </p>
          <div className="session-error-actions">
            <button className="primary-button" onClick={load}>
              Retry
            </button>
            <button className="secondary-button" onClick={onBack}>
              Back to WarQ
            </button>
          </div>
        </section>
      </main>
    );
  if (!qr) return null;

  const isActivated = qr.status === "activated" || Boolean(qr.activatedAt);
  const hasWarranty = Boolean(qr.warrantyDuration);
  const isExpired =
    hasWarranty &&
    isActivated &&
    qr.warrantyExpiresAt &&
    new Date(qr.warrantyExpiresAt).getTime() <= Date.now();

  return (
    <main className="customer-warranty">
      <section className="panel warranty-card enhanced-warranty-card">
        <div className="warranty-card-header-brand">
          <div className="brand compact">
            <span className="brand-mark">
              <QrCode />
            </span>
            <span>
              War<span>Q</span>
            </span>
          </div>
          <span className="eyebrow">
            <ShieldCheck size={14} /> OWNER QR ACCESS
          </span>
        </div>

        {isActivated ? (
          <>
            {/* Prominent Status Banner */}
            {hasWarranty ? (
              isExpired ? (
                <div className="warranty-hero-banner expired">
                  <div className="status-hero-icon">
                    <AlertTriangle size={32} />
                  </div>
                  <div className="status-hero-text">
                    <h2>Warranty Expired</h2>
                    <p>This product <strong>no longer has a valid warranty</strong>.</p>
                  </div>
                </div>
              ) : (
                <div className="warranty-hero-banner active">
                  <div className="status-hero-icon">
                    <CheckCircle2 size={32} />
                  </div>
                  <div className="status-hero-text">
                    <h2>Active Warranty</h2>
                    <p>This product <strong>has an active warranty</strong>.</p>
                  </div>
                </div>
              )
            ) : (
              <div className="warranty-hero-banner neutral">
                <div className="status-hero-icon">
                  <Info size={32} />
                </div>
                <div className="status-hero-text">
                  <h2>No Warranty Coverage</h2>
                  <p>This product does not have active warranty coverage.</p>
                </div>
              </div>
            )}

            {/* Live Remaining Countdown Widget */}
            <LiveWarrantyCountdownBlock
              expiresAt={qr.warrantyExpiresAt}
              duration={qr.warrantyDuration}
              status={qr.status}
              isActivated={isActivated}
            />

            {/* Customer Details Card (if recorded) */}
            {(qr.customerName || qr.customerPhone) && (
              <div className="warranty-section-box">
                <h3 className="section-box-title">
                  <UserRound size={16} /> Customer Information
                </h3>
                <div className="warranty-meta-grid">
                  <div>
                    <span>Customer Name</span>
                    <strong>{qr.customerName || "N/A"}</strong>
                  </div>
                  <div>
                    <span>Contact Number</span>
                    <strong>{qr.customerPhone || "N/A"}</strong>
                  </div>
                  {qr.customerAddress && (
                    <div className="wide">
                      <span>Customer Address</span>
                      <strong>{qr.customerAddress}</strong>
                    </div>
                  )}
                  {qr.customerNotes && (
                    <div className="wide">
                      <span>Customer Notes</span>
                      <strong>{qr.customerNotes}</strong>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Complete Product Details */}
            <div className="warranty-section-box">
              <h3 className="section-box-title">
                <ShoppingBag size={16} /> Product Information
              </h3>
              <div className="warranty-meta-grid">
                <div>
                  <span>Unit ID / Product ID</span>
                  <strong>{qr.productId || "Not recorded"}</strong>
                </div>
                <div>
                  <span>Unique Code</span>
                  <strong className="code-font">{qr.code}</strong>
                </div>
                <div>
                  <span>Product Name</span>
                  <strong>{qr.productName}</strong>
                </div>
                <div>
                  <span>Serial Number</span>
                  <strong>#{qr.serial}</strong>
                </div>
                <div>
                  <span>Sale Price</span>
                  <strong>
                    {qr.actualPrice == null && qr.defaultPrice == null
                      ? "Not recorded"
                      : `BDT ${money(qr.actualPrice ?? qr.defaultPrice)}`}
                  </strong>
                </div>
                <div>
                  <span>Store Name</span>
                  <strong>{qr.shopName || "WarQ Partner Shop"}</strong>
                </div>
                <div className="wide">
                  <span>Store Address</span>
                  <strong>{qr.shopAddress || "Authorized Merchant"}</strong>
                </div>
              </div>
            </div>

            {/* Warranty & Timeline Details */}
            <div className="warranty-section-box">
              <h3 className="section-box-title">
                <Calendar size={16} /> Warranty Timeline &amp; Dates
              </h3>
              <div className="warranty-meta-grid">
                <div>
                  <span>Total Duration</span>
                  <strong>{warrantyText(qr.warrantyDuration)}</strong>
                </div>
                <div>
                  <span>Activation Date &amp; Time</span>
                  <strong>
                    {qr.activationDate || qr.activatedAt
                      ? dateTimeWithDay(qr.activationDate || qr.activatedAt)
                      : "Not activated"}
                  </strong>
                </div>
                <div>
                  <span>Expiration Date &amp; Time</span>
                  <strong>
                    {hasWarranty
                      ? (qr.warrantyExpiresAt ? dateTimeWithDay(qr.warrantyExpiresAt) : "Starts on activation")
                      : "No Warranty"}
                  </strong>
                </div>
                <div>
                  <span>Sold Date</span>
                  <strong>
                    {qr.saleDate || qr.soldAt ? dateTimeWithDay(qr.saleDate || qr.soldAt) : "Recorded on activation"}
                  </strong>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Unactivated State: Display Product Summary & Activation Form */}
            <div className="unactivated-product-hero">
              <div className="product-initial-badge large">
                {qr.productName?.slice(0, 1) || "P"}
              </div>
              <div>
                <h2>{qr.productName}</h2>
                <p>{qr.shopName} · Serial #{qr.serial}</p>
                <p className="unactivated-ids">
                  <span>ID: {qr.productId || "N/A"}</span>
                  <span>Code: {qr.code}</span>
                </p>
                <div className="unactivated-pills">
                  <span className="pill warning">
                    <Clock size={12} /> Awaiting Activation
                  </span>
                  <span className="pill success">
                    <ShieldCheck size={12} /> {warrantyText(qr.warrantyDuration)}
                  </span>
                </div>
              </div>
            </div>

            <form className="customer-activation-form" onSubmit={handleActivateSubmit}>
              <div className="activation-form-header">
                <h3>
                  <CheckCircle2 size={18} color="#0d9488" /> Activate Product Warranty
                </h3>
                <p>Register customer information to start official warranty coverage and countdown.</p>
              </div>

              <div className="form-grid">
                <label>
                  Customer Full Name *
                  <input
                    required
                    placeholder="e.g. Mohammad Ali"
                    value={custForm.name}
                    onChange={(e) => setCustForm({ ...custForm, name: e.target.value })}
                  />
                </label>

                <label>
                  Bangladeshi Mobile Phone *
                  <input
                    required
                    inputMode="tel"
                    placeholder="017XXXXXXXX or +88017XXXXXXXX"
                    value={custForm.phone}
                    onChange={(e) => handlePhoneInput(e.target.value)}
                  />
                  {custForm.phone.trim() ? (
                    isValidBdPhoneNumber(custForm.phone) ? (
                      <span className="phone-validation-indicator valid">
                        <CheckCircle2 size={12} /> Valid ({formatBdPhoneNumber(custForm.phone)})
                      </span>
                    ) : (
                      <span className="phone-validation-indicator invalid">
                        <AlertCircle size={12} /> {phoneErr || "11-digit BD number starting with 013-019"}
                      </span>
                    )
                  ) : null}
                </label>
              </div>

              <label>
                Customer Address (Optional)
                <input
                  placeholder="Customer address or city"
                  value={custForm.address}
                  onChange={(e) => setCustForm({ ...custForm, address: e.target.value })}
                />
              </label>

              <label>
                Notes / Invoice Number (Optional)
                <input
                  placeholder="e.g. Invoice #1042 or store remarks"
                  value={custForm.notes}
                  onChange={(e) => setCustForm({ ...custForm, notes: e.target.value })}
                />
              </label>

              <div className="customer-sale-price-box">
                {qr.defaultPrice != null && (
                  <div className="customer-original-price">
                    <span>Product Price</span>
                    <strong>BDT {money(qr.defaultPrice)}</strong>
                  </div>
                )}
                <label className="customer-sale-price-field">
                  <span>Actual Sale Price (BDT)</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={custForm.price}
                    onChange={(e) => {
                      setCustForm({ ...custForm, price: e.target.value });
                      if (salePriceErr) setSalePriceErr("");
                    }}
                    placeholder={qr.defaultPrice != null ? `Default: ${money(qr.defaultPrice)}` : "0"}
                  />
                  {salePriceErr && <small className="scanner-form-error">{salePriceErr}</small>}
                </label>
              </div>

              <button className="primary-button full activate-submit-btn" disabled={busy}>
                {busy ? <LoaderCircle className="spin" size={18} /> : <CheckCircle2 size={18} />}
                Activate Warranty &amp; Start Coverage
              </button>
            </form>
          </>
        )}

        <div className="warranty-card-footer">
          <p className="qr-code-line">QR ID: {qr.code}</p>
          <button className="secondary-button" onClick={onBack}>
            Back to WarQ
          </button>
        </div>
      </section>
    </main>
  );
}
/* Paginated + scrollable sticker order history for the Manage Users panel.
   Handles thousands of records: debounced search, fixed page size with a
   capped scroll viewport, and the shared Pagination control. */
const STICKER_HISTORY_PAGE_SIZE = 10;

function StickerHistoryBox({ history = [] }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const debouncedQuery = useDebouncedValue(query, 220);

  const statusOf = (entry) => `${entry.fulfillment === "physical" ? "Physical" : "Digital"} ${entry.paymentStatus} ${entry.deliveryStatus}`;

  const filtered = useMemo(() => {
    const needle = debouncedQuery.trim().toLowerCase();
    if (!needle) return history;
    return history.filter((entry) =>
      `${entry.totalQrCodes} stickers ${statusOf(entry)} ${dateTime(entry.createdAt)} BDT ${money(entry.totalPrice || 0)}`
        .toLowerCase()
        .includes(needle),
    );
  }, [history, debouncedQuery]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / STICKER_HISTORY_PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * STICKER_HISTORY_PAGE_SIZE;
  const visible = filtered.slice(start, start + STICKER_HISTORY_PAGE_SIZE);

return (
    <div className="manage-sub-box manage-history-box">
      <strong className="manage-sub-box-title">Sticker order history</strong>
      {history.length > 10 ? (
        <div className="data-toolbar data-toolbar-compact manage-history-toolbar">
          <DataSearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search orders (status, date, amount...)"
            label="Search sticker order history"
          />
        </div>
      ) : null}
      <div className="manage-history-rows manage-history-scroll">
        {visible.map((entry) => (
          <div key={entry.id} className="manage-history-row">
            <span className="manage-history-row-main">
              <span className="manage-history-stickers">
                <strong>{entry.totalQrCodes}</strong> stickers
              </span>
              <span className={`history-badge fulfillment-${entry.fulfillment === "physical" ? "physical" : "digital"}`}>
                {entry.fulfillment === "physical" ? "Physical" : "Digital"}
              </span>
              <span className={`history-badge payment-${String(entry.paymentStatus || "").toLowerCase().replace(/\s+/g, "-")}`}>
                {entry.paymentStatus || "Unknown"}
              </span>
              <span className={`history-badge delivery-${String(entry.deliveryStatus || "").toLowerCase().replace(/\s+/g, "-")}`}>
                {entry.deliveryStatus || "Unknown"}
              </span>
            </span>
            <span className="manage-history-meta">
              <span className="manage-history-date">{dateTime(entry.createdAt)}</span>
              <strong className="manage-history-amount">BDT {money(entry.totalPrice || 0)}</strong>
            </span>
          </div>
        ))}
        {!visible.length ? <p className="manage-history-empty">No matching orders.</p> : null}
      </div>
      <Pagination
        page={safePage}
        pageCount={pageCount}
        total={filtered.length}
        pageSize={STICKER_HISTORY_PAGE_SIZE}
        start={start}
        onPage={setPage}
        itemLabel="orders"
      />
    </div>
  );
}
function AdminLogin({ onLogin, busy, error }) {
  const [adminId, setAdminId] = useState(""),
    [password, setPassword] = useState("");
  return (
    <main className="loading-screen">
      <form
        className="panel session-error admin-login"
        onSubmit={(event) => {
          event.preventDefault();
          onLogin({ adminId, password });
        }}
      >
        <div className="brand-mark">
          <ShieldCheck />
        </div>
        <h1>Admin sign in</h1>
        <label>
          Admin ID
          <input
            required
            value={adminId}
            onChange={(e) => setAdminId(e.target.value)}
          />
        </label>
        <label>
          Password
          <PasswordInput
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <LoadingButton type="submit" className="primary-button" busy={busy} loadingText="Signing in…">
          Sign in
        </LoadingButton>
        {error && <p className="form-error">{error}</p>}
      </form>
    </main>
  );
}
function Admin({ data, run, refresh, onPrintSheets, onDownloadQrs, busy, tab, setTab, supportWaitingCount = 0 }) {
  const [orderFilter, setOrderFilter] = useState("all"),
    [user, setUser] = useState(null),
    [duration, setDuration] = useState({
      days: 1,
      hours: 0,
      minutes: 0,
      seconds: 0,
    }),
    [unlimited, setUnlimited] = useState(false),
    [userSearch, setUserSearch] = useState(""),
    [userFilter, setUserFilter] = useState("all");
  const [price, setPrice] = useState(data.pricing?.stickerPackPrice || 50),
    [pack, setPack] = useState(data.pricing?.stickerPackSize || 300),
    [delivery, setDelivery] = useState(data.pricing?.deliveryCharge ?? 120);

  useEffect(() => {
    setPrice(data.pricing?.stickerPackPrice ?? 50);
    setPack(data.pricing?.stickerPackSize ?? 300);
    setDelivery(data.pricing?.deliveryCharge ?? 120);
  }, [data.pricing?.stickerPackPrice, data.pricing?.stickerPackSize, data.pricing?.deliveryCharge]);

  const validUsers = useMemo(() => {
    return (data.users || []).filter(
      (item) => item && item.role !== "admin_console" && !item.banned && item.status !== "banned"
    );
  }, [data.users]);

  const validUserIds = useMemo(() => {
    return new Set(validUsers.map((u) => u.id));
  }, [validUsers]);

  const filteredUsers = useMemo(() => {
    let list = validUsers;
    if (userFilter === "active") {
      list = list.filter(
        (u) =>
          !u.disabled &&
          (u.unlimitedAccess ||
            (u.subscriptionEndsAt &&
              new Date(u.subscriptionEndsAt).getTime() > Date.now()))
      );
    } else if (userFilter === "unlimited") {
      list = list.filter((u) => !u.disabled && u.unlimitedAccess);
    } else if (userFilter === "disabled") {
      list = list.filter((u) => u.disabled);
    } else if (userFilter === "inactive") {
      list = list.filter(
        (u) =>
          !u.unlimitedAccess &&
          (!u.subscriptionEndsAt ||
            new Date(u.subscriptionEndsAt).getTime() <= Date.now())
      );
    }

    const q = userSearch.trim().toLowerCase();
    if (!q) return list;

    return list.filter((u) => {
      const name = (u.name || "").toLowerCase();
      const email = (u.email || "").toLowerCase();
      const shopName = (u.shopName || "").toLowerCase();
      const mobile = (u.mobile || "").toLowerCase();
      const shopAddress = (u.shopAddress || "").toLowerCase();
      const deliveryAddress = (u.deliveryAddress || "").toLowerCase();
      const district = (u.district || "").toLowerCase();
      const upazila = (u.upazila || "").toLowerCase();
      const id = (u.id || "").toLowerCase();
      const bio = (u.bio || "").toLowerCase();
      return (
        name.includes(q) ||
        email.includes(q) ||
        shopName.includes(q) ||
        mobile.includes(q) ||
        shopAddress.includes(q) ||
        deliveryAddress.includes(q) ||
        district.includes(q) ||
        upazila.includes(q) ||
        id.includes(q) ||
        bio.includes(q)
      );
    });
  }, [validUsers, userSearch, userFilter]);

  const validRequests = useMemo(() => {
    return (data.requests || []).filter(
      (order) => order && validUserIds.has(order.ownerId || order.userId || order.uid)
    );
  }, [data.requests, validUserIds]);

  const filteredOrders = useMemo(() => {
    if (orderFilter === "physical") {
      return validRequests.filter((order) => order.fulfillment === "physical");
    }
    if (orderFilter === "digital") {
      return validRequests.filter((order) => order.fulfillment !== "physical");
    }
    if (orderFilter === "pending_delivery") {
      return validRequests.filter(
        (order) =>
          order.fulfillment === "physical" &&
          order.paymentStatus === "paid" &&
          order.deliveryStatus !== "delivered",
      );
    }
    if (orderFilter === "delivered") {
      return validRequests.filter((order) => order.deliveryStatus === "delivered");
    }
    return validRequests;
  }, [validRequests, orderFilter]);

  const validAccessRequests = useMemo(() => {
    return (data.accessRequests || []).filter(
      (req) => req && validUserIds.has(req.ownerId || req.userId || req.uid)
    );
  }, [data.accessRequests, validUserIds]);

  const validQrs = useMemo(() => {
    return (data.qrs || []).filter(
      (q) => q && validUserIds.has(q.ownerId || q.userId || q.uid)
    );
  }, [data.qrs, validUserIds]);

  const adminClaims = useMemo(() => {
    const list = Array.isArray(data.claims) ? data.claims : [];
    return [...list].sort((a, b) =>
      String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
    );
  }, [data.claims]);

  const updateClaim = (claimId, status, resolutionNote) =>
    run(async () => {
      await adminApi.updateClaimStatus({ claimId, status, resolutionNote });
      await refresh();
    });

  const updateOrder = (requestId, update) =>
    run(async () => {
      await adminApi.updateStickerRequest({ requestId, ...update });
      await refresh();
    });

  return (
    <section className="page admin-page">
      <div className="page-title row-title">
        <div>
          <span className="eyebrow">
            <ShieldCheck /> ADMINISTRATOR
          </span>
          <h1>WarQ control center</h1>
          <p>Orders, sticker prices, access, and customer notifications.</p>
        </div>
        <button className="secondary-button" onClick={refresh} disabled={busy}>
          <RefreshCcw /> Refresh
        </button>
      </div>
      <div className="admin-stats">
        <Card label="Users" value={validUsers.length} Icon={Users} />
        <Card
          label="Orders"
          value={validRequests.length}
          Icon={ClipboardList}
          color="orange"
        />
        <Card
          label="Generated QRs"
          value={validQrs.length}
          Icon={QrCode}
          color="purple"
        />
        <Card label="Activated QRs" value={data.globalStats?.activatedQrs || 0} Icon={Zap} />
        <Card label="Active warranties" value={data.globalStats?.activeWarranties || 0} Icon={BadgeCheck} color="purple" />
        <Card label="Expired warranties" value={data.globalStats?.expiredWarranties || 0} Icon={ShieldCheck} color="orange" />
        <Card label="Subscription Revenue" value={`BDT ${money(data.globalStats?.subscriptionRevenue ?? data.globalStats?.totalRevenue ?? 0)}`} Icon={WalletCards} color="blue" />
        <Card label="Access requests" value={data.globalStats?.pendingAccessRequests || 0} Icon={KeyRound} color="orange" />
      </div>
      <div className="admin-tabs">
        {[
          ["orders", `Orders (${validRequests.length})`],
          ["users", `Users (${validUsers.length})`],
          ["access", `Access requests (${validAccessRequests.filter(r => r.status === 'pending').length})`],
          ["claims", `Claims (${adminClaims.filter((claim) => claim.status === "submitted" || claim.status === "reviewing" || !claim.status).length})`],
          ["support", "Support"],
          ["pricing", "Pricing & delivery"],
          ["messages", "Notifications"],
          ["profile", "Profile"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
            {id === "support" && supportWaitingCount > 0 ? (
              <span className="admin-tab-badge">{supportWaitingCount > 99 ? "99+" : supportWaitingCount}</span>
            ) : null}
          </button>
        ))}
      </div>
      {tab === "orders" && (
        <article className="panel admin-list admin-orders-list">
          <div className="admin-order-filters">
            {[
              ["all", `All (${validRequests.length})`],
              ["physical", `Physical (${validRequests.filter(o => o.fulfillment === "physical").length})`],
              ["digital", `Digital (${validRequests.filter(o => o.fulfillment !== "physical").length})`],
              ["pending_delivery", `Awaiting delivery (${validRequests.filter(o => o.fulfillment === "physical" && o.paymentStatus === "paid" && o.deliveryStatus !== "delivered").length})`],
              ["delivered", `Delivered (${validRequests.filter(o => o.deliveryStatus === "delivered").length})`],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={orderFilter === id ? "active" : ""}
                onClick={() => setOrderFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {filteredOrders.length ? (
            filteredOrders.map((order) => {
              const orderOwner = validUsers.find((item) => item.id === (order.ownerId || order.userId || order.uid));
              return (
              <div className="admin-row admin-order-row" key={order.id}>
                <div className="row-icon">
                  <PackagePlus />
                </div>
                <div className="admin-order-main">
                  <strong>
                    {order.productCount} products · {order.totalQrCodes} stickers
                    · BDT {money(order.totalPrice)}
                  </strong>
                  <span>
                    {orderOwner?.name || orderOwner?.shopName || "Merchant"} · {order.shopName} · {order.shopAddress}
                  </span>
                  <small>
                    {order.fulfillment === "physical" ? "Physical delivery" : "Digital self-print"} · Payment: {order.paymentStatus} · Delivery: {order.deliveryStatus} · {dateTime(order.createdAt)}
                  </small>
                  <small>
                    {order.products
                      ?.map(
                        (product) =>
                          `${product.productName} (${warrantyText(product.warrantyDuration)})`,
                      )
                      .join(" · ")}
                  </small>
                  {(() => {
                    const orderQrs = (data.qrs || []).filter((q) => String(q.requestId) === String(order.id));
                    if (!orderQrs.length) return null;
                    return (
                      <div className="admin-order-qr-actions">
                        <button
                          type="button"
                          className="small-action"
                          onClick={() => onPrintSheets ? onPrintSheets(orderQrs, `WarQ Stickers - ${order.shopName || "Order"}`) : printStickerSheets(orderQrs, `WarQ Stickers - ${order.shopName || "Order"}`)}
                        >
                          <Printer size={12} /> Print stickers ({orderQrs.length})
                        </button>
                        <button
                          type="button"
                          className="small-action"
                          onClick={() => onDownloadQrs ? onDownloadQrs(orderQrs, `WarQ_Stickers_${order.shopName || "Order"}`) : downloadAllQrs(orderQrs, `WarQ_Stickers_${order.shopName || "Order"}`)}
                        >
                          <Download size={12} /> Download all ({orderQrs.length})
                        </button>
                      </div>
                    );
                  })()}
                </div>
                <div className="admin-row-aside">
                  <span className="pill neutral">{order.status}</span>
                  <div className="admin-actions">
                    {order.fulfillment === "physical" &&
                      order.paymentStatus === "paid" &&
                      order.deliveryStatus !== "delivered" && (
                        <LoadingButton
                          type="button"
                          className="small-action"
                          busy={busy}
                          loadingText="Updating…"
                          onClick={() => updateOrder(order.id, { deliveryStatus: "delivered" })}
                        >
                          <CheckCircle2 size={12} /> Mark delivered
                        </LoadingButton>
                      )}
                    {order.fulfillment === "physical" && order.deliveryStatus === "delivered" && (
                      <span className="pill success">Delivered</span>
                    )}
                    <LoadingButton
                      type="button"
                      className="small-action danger-action"
                      busy={busy}
                      loadingText="Deleting…"
                      onClick={() => {
                        if (!window.confirm("Delete this sticker order from the admin panel? QR codes will remain in the merchant account.")) return;
                        run(async () => {
                          await adminApi.deleteStickerRequest(order.id);
                          await refresh();
                        });
                      }}
                    >
                      <Trash2 size={12} /> Delete order
                    </LoadingButton>
                  </div>
                </div>
              </div>
            );
            })
          ) : (
            <Empty
              Icon={ClipboardList}
              title="No orders"
              text="New QR requests will appear here."
            />
          )}
        </article>
      )}
      {tab === "users" && (
        <article className="panel admin-list admin-users-list">
          <div className="admin-search-container">
            <div className="admin-search-bar">
              <Search className="search-icon" size={18} />
              <input
                type="text"
                placeholder="Search users by name, email, shop name, phone number, district, address, user ID..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />
              {userSearch && (
                <button
                  type="button"
                  className="admin-search-clear-btn"
                  onClick={() => setUserSearch("")}
                  title="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="admin-search-meta">
              <div className="admin-filter-pills">
                {[
                  ["all", `All (${validUsers.length})`],
                  ["active", `Active Access (${validUsers.filter(u => !u.disabled && (u.unlimitedAccess || (u.subscriptionEndsAt && new Date(u.subscriptionEndsAt).getTime() > Date.now()))).length})`],
                  ["unlimited", `Unlimited (${validUsers.filter(u => !u.disabled && u.unlimitedAccess).length})`],
                  ["disabled", `Disabled (${validUsers.filter(u => u.disabled).length})`],
                  ["inactive", `Inactive (${validUsers.filter(u => !u.unlimitedAccess && (!u.subscriptionEndsAt || new Date(u.subscriptionEndsAt).getTime() <= Date.now())).length})`],
                ].map(([fId, fLabel]) => (
                  <button
                    key={fId}
                    type="button"
                    className={`admin-filter-pill ${userFilter === fId ? "active" : ""}`}
                    onClick={() => setUserFilter(fId)}
                  >
                    {fLabel}
                  </button>
                ))}
              </div>

              <span className="admin-search-count">
                Showing <strong>{filteredUsers.length}</strong> of {validUsers.length} users
                {userSearch && (
                  <button
                    type="button"
                    className="admin-search-reset"
                    onClick={() => setUserSearch("")}
                  >
                    Reset
                  </button>
                )}
              </span>
            </div>
          </div>

          {filteredUsers.length ? (
            filteredUsers.map((item) => (
              <div className="admin-row admin-user-row" key={item.id}>
                <div className="avatar small">
                  {(item.name || item.shopName || "U").slice(0, 1).toUpperCase()}
                </div>
                <div className="admin-user-main">
                  <div className="admin-user-title-row">
                    <strong className="admin-user-name">{item.name || "Unnamed user"}</strong>
                    {item.shopName && (
                      <span className="pill neutral admin-user-shop-pill">
                        <Store size={11} /> {item.shopName}
                      </span>
                    )}
                    <UserAccessBadge user={item} />
                  </div>

                  <div className="admin-user-contact-row">
                    <span>
                      <Mail size={12} /> {item.email || "No email"}
                    </span>
                    {item.mobile && (
                      <span>
                        <Phone size={12} /> {formatBdPhoneNumber(item.mobile)}
                      </span>
                    )}
                    {(item.district || item.upazila) && (
                      <span>
                        <MapPin size={12} /> {[item.upazila, item.district].filter(Boolean).join(", ")}
                      </span>
                    )}
                  </div>

                  <div className="admin-user-metrics-chips">
                    <span className="admin-metric-chip profit" title="Total Net Profit">
                      Profit: BDT {money(item.analytics?.totalProfit || 0)}
                    </span>
                    <span className="admin-metric-chip sales" title="Total Products Sold / Activated">
                      Sales: {item.analytics?.totalSales || 0}
                    </span>
                    <span className="admin-metric-chip" title="Generated QRs">
                      QRs: {item.analytics?.generatedQrCount || item.analytics?.totalQrs || 0}
                    </span>
                    <span className="admin-metric-chip activated" title="Activated QRs">
                      Activated: {item.analytics?.activatedQrCount || item.analytics?.activatedQrs || 0}
                    </span>
                    <span className="admin-metric-chip active-w" title="Active Warranties">
                      Active: {item.analytics?.activeWarrantyCount || item.analytics?.activeWarranties || 0}
                    </span>
                    <span className="admin-metric-chip expired-w" title="Expired Warranties / QRs">
                      Expired: {item.analytics?.expiredWarrantyCount || item.analytics?.expiredWarranties || 0}
                    </span>
                  </div>
                </div>

                <div className="admin-actions">
                  <button
                    className="small-action admin-manage-btn"
                    onClick={() => {
                      setUser(item);
                      setUnlimited(item.unlimitedAccess || false);
                    }}
                  >
                    View Details &amp; Manage
                  </button>
                </div>
              </div>
            ))
          ) : (
            <Empty
              Icon={userSearch ? Search : Users}
              title={userSearch ? "No matching users" : "No users"}
              text={userSearch ? `No users found matching "${userSearch}". Try adjusting your search query.` : "Registered merchant accounts will appear here."}
            />
          )}
        </article>
      )}
      {tab === "access" && (
        <article className="panel admin-list admin-access-list">
          {validAccessRequests.length ? (
            validAccessRequests.map((request) => {
              const requester = validUsers.find((item) => item.id === request.ownerId || item.id === request.userId);
              const pending = request.status === "pending";
              return (
                <div className="access-request-card" key={request.id}>
                  <div className="access-request-card-main">
                    <div className="access-request-avatar">
                      {(requester?.name || requester?.email || "?").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="access-request-id">
                      <strong>{requester?.name || requester?.email || "Unknown user"}</strong>
                      <span>{requester?.shopName || "Merchant account"}</span>
                    </div>
                    <span className={`pill ${pending ? "warning" : request.status === "approved" ? "success" : "danger"}`}>
                      {pending ? "Waiting" : request.status}
                    </span>
                  </div>
                  <div className="access-request-details">
                    <span><Mail size={13} /> {requester?.email || request.ownerId || "No email"}</span>
                    {requester?.mobile ? (
                      <span><Phone size={13} /> {requester.mobile}</span>
                    ) : null}
                    <span><Clock size={13} /> Requested {dateTime(request.createdAt)}</span>
                  </div>
                  {request.message ? (
                    <div className="access-request-message">
                      <small>Message from merchant</small>
                      <p>{request.message}</p>
                    </div>
                  ) : null}
                  {pending && (
                    <div className="access-request-actions">
                      <button className="small-action" onClick={() => run(async () => { await adminApi.resolveAccessRequest({ requestId: request.id, decision: "approved", duration: { days: 30, hours: 0, minutes: 0, seconds: 0 } }); await refresh(); })}>Approve 30 days</button>
                      <button className="small-action" onClick={() => run(async () => { await adminApi.resolveAccessRequest({ requestId: request.id, decision: "approved", unlimited: true }); await refresh(); })}>Approve unlimited</button>
                      <button className="small-action danger-action" onClick={() => run(async () => { await adminApi.resolveAccessRequest({ requestId: request.id, decision: "rejected" }); await refresh(); })}>Reject</button>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <Empty Icon={KeyRound} title="No access requests" text="Free-access requests from users will appear here." />
          )}
        </article>
      )}
      {tab === "claims" && (
        <article className="panel admin-list admin-claims-list">
          {adminClaims.length ? (
            adminClaims.map((claim) => (
              <div className="admin-row admin-claim-row" key={claim.id}>
                <div className="admin-row-main">
                  <div className="admin-row-title">
                    <strong>{claim.qrCode || claim.code || "Claim"}</strong>
                    <span className={`claim-status-pill claim-status-${claim.status || "submitted"}`}>
                      {claim.status || "submitted"}
                    </span>
                  </div>
                  <div className="access-request-details">
                    <span><UserRound size={13} /> {claim.customerName || "Customer"} {claim.customerPhone ? `· ${claim.customerPhone}` : ""}</span>
                    {claim.customerEmail ? <span><Mail size={13} /> {claim.customerEmail}</span> : null}
                    <span><Clock size={13} /> Raised {dateTime(claim.createdAt)}</span>
                    <span><ClipboardList size={13} /> {claim.category || "repair"}</span>
                  </div>
                  {claim.description ? (
                    <div className="access-request-message">
                      <small>Customer description</small>
                      <p>{claim.description}</p>
                    </div>
                  ) : null}
                  {claim.resolutionNote ? (
                    <div className="access-request-message">
                      <small>Resolution note</small>
                      <p>{claim.resolutionNote}</p>
                    </div>
                  ) : null}
                  <div className="access-request-actions">
                    <button className="small-action" onClick={() => updateClaim(claim.id, "reviewing", claim.resolutionNote)}>
                      Mark reviewing
                    </button>
                    <button className="small-action" onClick={() => updateClaim(claim.id, "approved", claim.resolutionNote)}>
                      Approve
                    </button>
                    <button className="small-action danger-action" onClick={() => updateClaim(claim.id, "rejected", claim.resolutionNote)}>
                      Reject
                    </button>
                    <button className="small-action" onClick={() => updateClaim(claim.id, "resolved", claim.resolutionNote)}>
                      Mark resolved
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <Empty Icon={ShieldCheck} title="No warranty claims" text="Customer warranty claims will appear here for review." />
          )}
        </article>
      )}
      {tab === "support" && <AdminSupportPanel busy={busy} />}
      {tab === "pricing" && (
        <div className="admin-pricing-grid">
          <article className="panel form-panel">
            <h2>Sticker pricing</h2>
            <p>
              Current request totals use this rate: {pack} stickers = BDT{" "}
              {money(price)}.
            </p>
            <label>
              Stickers per pack
              <input
                type="number"
                min="1"
                value={pack}
                onChange={(e) => setPack(e.target.value)}
              />
            </label>
            <label>
              Pack price (BDT)
              <input
                type="number"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </label>
            <button
              className="primary-button"
              onClick={() =>
                run(async () => {
                  await adminApi.setStickerPricing({
                    stickerPackSize: Number(pack) || 1,
                    stickerPackPrice: Math.max(0, Number(price) || 0),
                    deliveryCharge: Math.max(0, Number(delivery) || 0),
                  });
                  await refresh();
                })
              }
            >
              Save price
            </button>
          </article>
          <article className="panel form-panel">
            <h2>Delivery charge</h2>
            <p>Added to every physical sticker delivery order.</p>
            <div className="delivery-current">
              <span className="delivery-current-label">Current charge</span>
              <strong className="delivery-current-value">BDT {money(delivery)}</strong>
            </div>
            <div className="delivery-stepper">
              <button
                type="button"
                className="delivery-step-btn"
                onClick={() => setDelivery((value) => Math.max(0, (Number(value) || 0) - 10))}
              >
                − BDT 10
              </button>
              <button
                type="button"
                className="delivery-step-btn"
                onClick={() => setDelivery((value) => Math.max(0, (Number(value) || 0) + 10))}
              >
                + BDT 10
              </button>
            </div>
            <label>
              Delivery charge (BDT)
              <input
                type="number"
                min="0"
                value={delivery}
                onChange={(e) => setDelivery(e.target.value)}
              />
            </label>
            <button
              className="primary-button"
              onClick={() =>
                run(async () => {
                  await adminApi.setStickerPricing({
                    stickerPackSize: Number(pack) || 1,
                    stickerPackPrice: Math.max(0, Number(price) || 0),
                    deliveryCharge: Math.max(0, Number(delivery) || 0),
                  });
                  await refresh();
                })
              }
            >
              Save delivery charge
            </button>
          </article>
        </div>
      )}
      {tab === "messages" && (
        <>
          <AdminAnnouncementComposer
            users={validUsers}
            busy={busy}
            onSend={(payload) =>
              run(async () => {
                await adminApi.sendNotification(payload);
                await refresh();
              })
            }
          />
          <AdminSentNotificationsList
            notifications={data.notifications || []}
            users={validUsers}
            busy={busy}
            onDelete={(notificationId) =>
              run(async () => {
                await adminApi.deleteNotification(notificationId);
                await refresh();
              })
            }
          />
        </>
      )}
      {tab === "profile" && (
        <AdminProfileView
          data={{ ...data, users: validUsers }}
          onLogout={() => run(() => signOutAdmin())}
        />
      )}
      {user && tab === "users" && (
        <div className="modal-backdrop">
          <section className="manage-user">
            <button className="close-button" onClick={() => setUser(null)}>
              <X />
            </button>
            <div className="manage-user-header">
              <span className="eyebrow">
                <KeyRound size={13} /> USER PROFILE &amp; DETAILED BUSINESS STATISTICS
              </span>
              <div className="manage-user-head-row">
                <h2>{user.name || user.shopName || "Merchant Details"}</h2>
                <UserAccessBadge user={user} detailed />
              </div>
              <small className="manage-user-id-line">
                User ID: <code>{user.id}</code> · Registered {dateTime(user.createdAt)}
              </small>
            </div>

            <div className="manage-user-body">

            {/* Merchant Business Details */}
            <div className="user-profile-details-box">
              <h3 className="manage-section-title">
                <Store size={14} color="#0d9488" /> Shop &amp; Contact Information
              </h3>
              <dl className="user-profile-details-grid">
                <div>
                  <dt>Shop Name</dt>
                  <dd>{user.shopName || "Not specified"}</dd>
                </div>
                <div>
                  <dt>Contact Person</dt>
                  <dd>{user.name || "Not specified"}</dd>
                </div>
                <div>
                  <dt>Email Address</dt>
                  <dd>{user.email || "No email"}</dd>
                </div>
                <div>
                  <dt>Phone Number</dt>
                  <dd>{user.mobile ? formatBdPhoneNumber(user.mobile) : "No phone"}</dd>
                </div>
                <div>
                  <dt>District &amp; Upazila</dt>
                  <dd>{[user.upazila, user.district].filter(Boolean).join(", ") || "Not specified"}</dd>
                </div>
                <div>
                  <dt>Shop Physical Address</dt>
                  <dd>{user.shopAddress || "Not specified"}</dd>
                </div>
                <div>
                  <dt>Delivery Address</dt>
                  <dd>{user.deliveryAddress || "Not specified"}</dd>
                </div>
                {user.bio && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <dt>Bio / Notes</dt>
                    <dd>{user.bio}</dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Detailed Business Statistics Grid */}
            <div className="manage-stats-section">
              <h3 className="manage-section-title">
                <TrendingUp size={14} color="#0d9488" /> User Business Statistics &amp; Analytics
              </h3>
              <div className="user-stat-grid">
                <div className="user-stat-card highlight-green">
                  <span className="stat-label"><CircleDollarSign size={13} /> Total Net Profit</span>
                  <span className="stat-value">BDT {money(user.analytics?.totalProfit || 0)}</span>
                </div>
                <div className="user-stat-card highlight-blue">
                  <span className="stat-label"><WalletCards size={13} /> Product Sales (Revenue)</span>
                  <span className="stat-value">BDT {money(user.analytics?.totalRevenue || 0)}</span>
                </div>
                <div className="user-stat-card">
                  <span className="stat-label"><ShoppingBag size={13} /> Products Created/Added</span>
                  <span className="stat-value">{user.analytics?.totalProducts || 0}</span>
                </div>
                <div className="user-stat-card">
                  <span className="stat-label"><CheckCircle2 size={13} /> Products Sold / Activated</span>
                  <span className="stat-value">{user.analytics?.totalSales || 0}</span>
                </div>
                <div className="user-stat-card">
                  <span className="stat-label"><QrCode size={13} /> Total QRs Generated</span>
                  <span className="stat-value">{user.analytics?.generatedQrCount || user.analytics?.totalQrs || 0}</span>
                </div>
                <div className="user-stat-card highlight-purple">
                  <span className="stat-label"><Zap size={13} /> QR Codes Activated</span>
                  <span className="stat-value">{user.analytics?.activatedQrCount || user.analytics?.activatedQrs || 0}</span>
                </div>
                <div className="user-stat-card highlight-orange">
                  <span className="stat-label"><Clock size={13} /> QR Codes Expired</span>
                  <span className="stat-value">{user.analytics?.expiredWarrantyCount || user.analytics?.expiredWarranties || 0}</span>
                </div>
                <div className="user-stat-card highlight-green">
                  <span className="stat-label"><BadgeCheck size={13} /> Active Warranties</span>
                  <span className="stat-value">{user.analytics?.activeWarrantyCount || user.analytics?.activeWarranties || 0}</span>
                </div>
                <div className="user-stat-card highlight-orange">
                  <span className="stat-label"><ShieldCheck size={13} /> Expired Warranties</span>
                  <span className="stat-value">{user.analytics?.expiredWarrantyCount || user.analytics?.expiredWarranties || 0}</span>
                </div>
                <div className="user-stat-card">
                  <span className="stat-label"><PackagePlus size={13} /> Available (Unused) QRs</span>
                  <span className="stat-value">{user.analytics?.availableQrCount || user.analytics?.availableQr || 0}</span>
                </div>
                <div className="user-stat-card highlight-blue">
                  <span className="stat-label"><PackagePlus size={13} /> Sticker Orders (Paid)</span>
                  <span className="stat-value">{user.analytics?.paidStickerOrders || 0}</span>
                </div>
                <div className="user-stat-card highlight-green">
                  <span className="stat-label"><CheckCircle2 size={13} /> Stickers Delivered</span>
                  <span className="stat-value">{user.analytics?.totalStickersOrdered || 0}</span>
                </div>
              </div>

              {(user.analytics?.stickerOrderHistory?.length > 0) && (
                <StickerHistoryBox history={user.analytics.stickerOrderHistory} />
              )}

              {/* Warranty products breakdown */}
              {((user.analytics?.activeWarrantyProducts?.length > 0) || (user.analytics?.expiredWarrantyProducts?.length > 0)) && (
                <div className="manage-sub-box">
                  {user.analytics?.activeWarrantyProducts?.length > 0 && (
                    <div className="manage-warranty-group">
                      <strong className="manage-warranty-title active">
                        <BadgeCheck size={13} /> Active Warranty Products ({user.analytics.activeWarrantyProducts.length}):
                      </strong>
                      <div className="product-tag-list">
                        {user.analytics.activeWarrantyProducts.map((pName, i) => (
                          <span key={i} className="product-tag" style={{ background: "#f0fdf4", borderColor: "#bbf7d0", color: "#15803d" }}>
                            {pName}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {user.analytics?.expiredWarrantyProducts?.length > 0 && (
                    <div className="manage-warranty-group">
                      <strong className="manage-warranty-title expired">
                        <ShieldCheck size={13} /> Expired Warranty Products ({user.analytics.expiredWarrantyProducts.length}):
                      </strong>
                      <div className="product-tag-list">
                        {user.analytics.expiredWarrantyProducts.map((pName, i) => (
                          <span key={i} className="product-tag" style={{ background: "#fff7ed", borderColor: "#fed7aa", color: "#c2410c" }}>
                            {pName}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Access Controls & Account Actions */}
            <div className="admin-access-panel">
              <h3 className="admin-access-title">
                <KeyRound size={14} color="#0d9488" /> Grant or Adjust Access Duration
              </h3>
              <label className="admin-access-toggle">
                <input
                  type="checkbox"
                  checked={unlimited}
                  onChange={(e) => setUnlimited(e.target.checked)}
                />
                <span className="admin-access-toggle-text">
                  <strong>Grant Lifetime Unlimited Access</strong>
                  <small>Access never expires — duration settings below are skipped.</small>
                </span>
              </label>

              {!unlimited && (
                <div className="admin-access-body">
                  <span className="admin-access-section-label">Quick duration presets</span>
                  <div className="admin-preset-grid">
                    <button
                      type="button"
                      className={`admin-preset-btn ${duration.minutes === 20 && duration.days === 0 && duration.hours === 0 ? "active" : ""}`}
                      onClick={() => setDuration({ days: 0, hours: 0, minutes: 20, seconds: 0 })}
                    >
                      ⚡ 20 Minutes
                    </button>
                    <button
                      type="button"
                      className={`admin-preset-btn ${duration.hours === 1 && duration.days === 0 && duration.minutes === 0 ? "active" : ""}`}
                      onClick={() => setDuration({ days: 0, hours: 1, minutes: 0, seconds: 0 })}
                    >
                      1 Hour
                    </button>
                    <button
                      type="button"
                      className={`admin-preset-btn ${duration.days === 1 && duration.hours === 0 && duration.minutes === 0 ? "active" : ""}`}
                      onClick={() => setDuration({ days: 1, hours: 0, minutes: 0, seconds: 0 })}
                    >
                      24 Hours (1 Day)
                    </button>
                    <button
                      type="button"
                      className={`admin-preset-btn ${duration.days === 7 && duration.hours === 0 && duration.minutes === 0 ? "active" : ""}`}
                      onClick={() => setDuration({ days: 7, hours: 0, minutes: 0, seconds: 0 })}
                    >
                      7 Days
                    </button>
                    <button
                      type="button"
                      className={`admin-preset-btn ${duration.days === 30 && duration.hours === 0 && duration.minutes === 0 ? "active" : ""}`}
                      onClick={() => setDuration({ days: 30, hours: 0, minutes: 0, seconds: 0 })}
                    >
                      30 Days
                    </button>
                    <button
                      type="button"
                      className={`admin-preset-btn ${duration.days === 365 ? "active" : ""}`}
                      onClick={() => setDuration({ days: 365, hours: 0, minutes: 0, seconds: 0 })}
                    >
                      1 Year
                    </button>
                  </div>

                  <span className="admin-access-section-label">Custom duration input</span>
                  <div className="admin-duration-grid">
                    {Object.keys(duration).map((key) => (
                      <label key={key} className="admin-duration-field">
                        <span className="admin-duration-name">{key}</span>
                        <input
                          type="number"
                          min="0"
                          value={duration[key]}
                          onChange={(e) =>
                            setDuration({ ...duration, [key]: Math.max(0, parseInt(e.target.value, 10) || 0) })
                          }
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="admin-access-actions">
              <button
                className="primary-button full"
                onClick={() =>
                  run(async () => {
                    await adminApi.setUserAccess({
                      uid: user.id,
                      unlimited,
                      duration,
                    });
                    await refresh();
                    setUser(null);
                  })
                }
              >
                <Zap size={16} /> Grant Access
              </button>

              <button
                className="secondary-button full"
                onClick={() =>
                  run(async () => {
                    await adminApi.revokeUserAccess(user.id);
                    await refresh();
                    setUser(null);
                  })
                }
              >
                Revoke Access Immediately
              </button>

              {!user.banned && (
                <button
                  className="secondary-button full"
                  onClick={() =>
                    run(async () => {
                      await adminApi.setUserStatus({
                        uid: user.id,
                        mode: user.disabled ? "restore" : "disable",
                      });
                      await refresh();
                      setUser(null);
                    })
                  }
                >
                  {user.disabled ? "Restore Disabled User" : "Temporarily Disable Account"}
                </button>
              )}

              {!user.banned && (
                <button
                  className="danger-button full"
                  style={{ marginTop: "6px" }}
                  onClick={() => {
                    const confirmed = window.confirm(
                      `⚠️ PERMANENT BAN & COMPLETE DATA PURGE\n\nAre you sure you want to permanently ban "${user.name || user.email}"?\n\nThis action will PERMANENTLY DELETE:\n- User account\n- All QR codes & batches\n- All sales & warranty history\n- All sticker requests & payments\n- All notifications & access records\n\nAll Admin Dashboard statistics and revenue will immediately update. This action is irreversible.`
                    );
                    if (confirmed) {
                      run(async () => {
                        await adminApi.setUserStatus({ uid: user.id, mode: "ban" });
                        await refresh();
                        setUser(null);
                      });
                    }
                  }}
                >
                  <Trash2 size={15} /> Permanently Ban &amp; Delete All Data
                </button>
              )}
            </div>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
function useDisableNumberWheel() {
  useEffect(() => {
    const stopNumberWheel = (event) => {
      const target = event.target;
      if (target && target.tagName === "INPUT" && target.type === "number" && document.activeElement === target) {
        target.blur();
      }
    };
    window.addEventListener("wheel", stopNumberWheel, { passive: true, capture: true });
    return () => window.removeEventListener("wheel", stopNumberWheel, { capture: true });
  }, []);
}

function App() {
  const initialRoute = parseAppRoute();
  const [user, setUser] = useState(undefined),
    [data, setData] = useState(null),
    [view, setView] = useState(initialRoute.view),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(null),
    [product, setProduct] = useState(null),
    [focusQrCode, setFocusQrCode] = useState(""),
    [code, setCode] = useState(scanCode()),
    [sandboxId, setSandboxId] = useState(initialRoute.sandbox || ""),
    [scannerOpen, setScannerOpen] = useState(false),
    [printData, setPrintData] = useState(null),
    [reportRange, setReportRange] = useState(() => defaultRange()),
    [sessionError, setSessionError] = useState(""),
    [booting, setBooting] = useState(false);
  const unreadCount = useMemo(
    () => (data?.notifications || []).filter((note) => !note.readAt).length,
    [data?.notifications],
  );
  const refreshRef = useRef(null);
  const navReadyRef = useRef(false);
  const bootRequestRef = useRef(0);
  const refresh = async ({ fresh = true } = {}) => {
    const next = await api.dashboard(fresh ? { fresh: true } : {});
    setData(next);
    setSessionError("");
    return next;
  };
  refreshRef.current = () => refresh({ fresh: false });

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => {
      setToast(null);
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useDisableNumberWheel();

  useEffect(() => {
    const applyRoute = () => {
      const route = parseAppRoute();
      if (route.admin) return;
      if (route.sandbox) {
        setSandboxId(route.sandbox);
        return;
      }
      setSandboxId("");
      if (window.history.state?.warqScanner) {
        setScannerOpen(true);
      } else {
        setScannerOpen(false);
      }
      if (route.scan) {
        setCode(route.scan);
        return;
      }
      setCode("");
      setView(route.view);
      if (!route.product) {
        setProduct(null);
        setFocusQrCode("");
      }
    };
    const onPopState = () => applyRoute();
    const onHashChange = () => {
      const route = parseAppRoute();
      if (route.sandbox) setSandboxId(route.sandbox);
      else if (route.scan) setCode(route.scan);
      else if (!route.admin) applyRoute();
    };
    window.addEventListener("popstate", onPopState);
    window.addEventListener("hashchange", onHashChange);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);

  useEffect(() => {
    if (!user || !data?.user || !profileComplete(data.user)) return;
    if (scanCode()) return;
    const route = parseAppRoute();
    if (route.admin || route.scan || route.sandbox) return;
    if (!navReadyRef.current) {
      replaceAppRoute(view || "dashboard", Boolean(product));
      navReadyRef.current = true;
    }
  }, [user?.uid, data?.user?.uid, view, Boolean(product)]);

  useEffect(() => {
    const rows = data?.qrs;
    if (!Array.isArray(rows) || !rows.length) return;
    registerQrRecords(rows);
  }, [data?.qrs]);

  const handlePrintSheets = (qrs, title) => {
    if (!qrs || !qrs.length) {
      alert("No QR codes available to print.");
      return;
    }
    setPrintData({ qrs, title: title || "WarQ QR Sticker Sheets", single: false });
  };
  const handlePrintSingle = (qr) => {
    if (!qr) return;
    setPrintData({ qrs: [qr], title: `WarQ Sticker - ${qr.productName || qr.code}`, single: true });
  };
  const handleDownloadQrs = (qrs, name) => {
    downloadAllQrs(qrs, name);
  };
  const handleDownloadSingle = (qr) => {
    downloadQr(qr.code, qr.productName, qr.serial);
  };

  const handleReturnSale = (payload) =>
    run(async () => {
      await api.returnSale(payload);
      await refresh();
    }, "Product marked as returned. Sale totals and warranty were updated.");
  const syncScannedQr = async (qr) => {
    const latest = await refresh();
    const key = qrProductKey(qr);
    return {
      product: latest.products.find((product) => product.id === key) || null,
      stats: latest.stats,
    };
  };
  const run = async (work, notice = "") => {
    setBusy(true);
    setToast(null);
    try {
      const result = await work();
      if (notice) setToast({ message: notice, type: "success" });
      return result;
    } catch (error) {
      setToast({ message: errorText(error), type: "error" });
    } finally {
      setBusy(false);
    }
  };
  const startRegistration = async ({ email, password }) => {
    try {
      await registerWithEmail(email, password);
    } catch (error) {
      if (error?.code !== "auth/email-already-in-use") throw error;
      try {
        const existing = await signInWithEmail(email, password);
        if (existing.user.emailVerified) {
          const issue = new Error("This email already belongs to a verified account. You have been signed in instead.");
          issue.code = "auth/verified-account-exists";
          throw issue;
        }
      } catch (resumeError) {
        if (resumeError?.code !== "auth/invalid-credential") throw resumeError;
        await sendClientPasswordResetEmail(email);
        const issue = new Error("An unfinished registration already uses this email. A secure password-reset email was sent; set a new password, sign in, then verify your email.");
        issue.code = "auth/unverified-account-recovery-sent";
        throw issue;
      }
    }
    await sendClientVerificationEmail();
  };
  const initialize = async (current, { force = false } = {}) => {
    if (!current?.emailVerified) return;
    const requestId = ++bootRequestRef.current;
    setBooting(true);
    setSessionError("");
    let lastError = null;
    try {
      await reloadUser(current);
      const activeUser = auth.currentUser || current;
      if (!activeUser?.emailVerified) return;
      await activeUser.getIdToken(true);
      // Dashboard already ensures the user profile exists; avoid a second auth/API round-trip.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const next = await api.dashboard({ fresh: attempt === 0 });
          if (requestId !== bootRequestRef.current) return;
          setData(next);
          setSessionError("");
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          const retryable =
            error?.code === "server/connection-failed" ||
            error?.code === "resource-exhausted" ||
            error?.code === "server/timeout" ||
            /quota exceeded|temporarily unavailable|Failed to fetch/i.test(String(error?.message || ""));
          if (!retryable || attempt === 2) break;
          await new Promise((resolve) => window.setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
      if (lastError) {
        if (requestId !== bootRequestRef.current) return;
        const message = errorText(lastError);
        setSessionError(message);
        setToast({ message, type: "error" });
        if (force) setData(null);
      }
    } catch (error) {
      if (requestId !== bootRequestRef.current) return;
      const message = errorText(error);
      setSessionError(message);
      setToast({ message, type: "error" });
      if (force) setData(null);
    } finally {
      if (requestId === bootRequestRef.current) setBooting(false);
    }
  };
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (current) => {
      setUser(current);
      if (!current) {
        bootRequestRef.current += 1;
        setData(null);
        setSessionError("");
        setBooting(false);
        setProduct(null);
        setFocusQrCode("");
        return;
      }
      if (!current.emailVerified) {
        setData(null);
        setSessionError("");
        setBooting(false);
        return;
      }
      // Keep existing dashboard visible for the same account while re-syncing.
      // Only force a blank boot screen when we have no usable session data yet.
      initialize(current, { force: false });
    });
    const hash = () => setCode(scanCode());
    window.addEventListener("hashchange", hash);

    try {
      const searchParams = new URLSearchParams(window.location.search);
      const mode = searchParams.get("mode");
      const oobCode = searchParams.get("oobCode");
      const emailAction = searchParams.get("emailAction");
      const verificationToken = searchParams.get("verificationToken");

      if (verificationToken) {
        api.confirmEmailVerification(verificationToken)
          .then(async () => {
            setToast({ message: "Your email has been verified successfully. You can now complete your business profile.", type: "success" });
            if (auth.currentUser) {
              await reloadUser();
              if (auth.currentUser.emailVerified) {
                setUser(auth.currentUser);
                await initialize(auth.currentUser);
              }
            }
          })
          .catch((err) => {
            setToast({ message: errorText(err), type: "error" });
          })
          .finally(() => {
            if (window.history?.replaceState) {
              window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
            }
          });
      } else if (mode === "verifyEmail" && oobCode) {
        applyEmailVerificationCode(oobCode)
          .then(async () => {
            setToast({
              message: "Your email has been verified successfully! You can now complete your business profile.",
              type: "success",
            });
            if (auth.currentUser) {
              await reloadUser();
              setUser(auth.currentUser);
              if (auth.currentUser.emailVerified) {
                await initialize(auth.currentUser);
              }
            }
          })
          .catch((err) => {
            setToast({ message: errorText(err), type: "error" });
          })
          .finally(() => {
            if (window.history?.replaceState) {
              window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
            }
          });
      } else if (emailAction === "verified") {
        setToast({ message: "Your email has been verified. Complete your business profile to continue.", type: "success" });
        if (auth.currentUser) {
          reloadUser()
            .then(() => {
              if (auth.currentUser?.emailVerified) {
                setUser(auth.currentUser);
                initialize(auth.currentUser);
              }
            })
            .catch(() => {
              setToast({ message: "Your email was verified. Please sign in to continue.", type: "success" });
            });
        }
        if (window.history?.replaceState) {
          window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
        }
      }
    } catch {}

    return () => {
      unsub();
      window.removeEventListener("hashchange", hash);
    };
  }, []);
  useEffect(() => {
    if (!user?.uid || !data?.user) return undefined;
    return bindRealtimeSync({
      onSync: () => refreshRef.current?.(),
      intervalMs: 90000,
      syncOnFocus: true,
    });
  }, [user?.uid, data?.user?.uid]);

  // Authenticated sessions must not keep /scan/... open — that route is public-only.
  // Clear it so shopkeepers land in the normal app instead of CustomerWarranty.
  useEffect(() => {
    if (!user || !code) return;
    setCode("");
    setProduct(null);
    setFocusQrCode("");
    const onScanPath =
      /(^|\/)scan\//i.test(window.location.pathname) ||
      /^#\/scan\//.test(window.location.hash);
    if (onScanPath) {
      window.history.replaceState(
        { warq: true, view: "dashboard", product: false },
        "",
        `${BASE_PATH}#/app/dashboard`,
      );
      setView("dashboard");
    }
  }, [user, code]);

  if (user === undefined) return <Loading />;
  if (!user) {
    if (code) {
      return (
        <PublicCustomerWarranty
          code={code}
          onShopkeeperLogin={() => {
            // Leave the public scan URL entirely and open the normal login page.
            setCode("");
            window.history.replaceState({}, document.title, BASE_PATH);
          }}
        />
      );
    }
    return (
      <Landing
        scan={false}
        busy={busy}
        message={toast}
        onLogin={({ email, password }) =>
          run(() => signInWithEmail(email, password))
        }
        onRegister={({ email, password }) =>
          run(
            () => startRegistration({ email, password }),
            "Verification email sent. Please check your inbox or Spam folder.",
          )
        }
        onForgot={(email) =>
          run(() => sendClientPasswordResetEmail(email), "Password reset email sent. Please check your inbox or Spam folder.")
        }
      />
    );
  }
  if (!user.emailVerified)
    return (
      <Verify
        user={user}
        busy={busy}
        message={toast}
        onResend={() =>
          run(() => sendClientVerificationEmail(), "Verification email sent. Please check your inbox or Spam folder.")
        }
        onCheck={() =>
          run(async () => {
            await reloadUser();
            if (!auth.currentUser.emailVerified)
              throw new Error("This email is not verified yet. Please check your inbox or Spam folder, click the verification link, then click here.");
            await auth.currentUser.getIdToken(true);
            await initialize(auth.currentUser, { force: true });
          })
        }
        onLogout={() => run(() => signOutUser())}
      />
    );
  if (!data) {
    if (sessionError) {
      return (
        <SessionBootError
          message={sessionError}
          busy={booting || busy}
          onRetry={() => initialize(user, { force: true })}
          onLogout={() => run(() => signOutUser())}
        />
      );
    }
    return <Loading />;
  }
  // Brief guard while the effect above clears a leftover /scan/... route.
  if (code) return <Loading />;
  if (sandboxId) {
    return (
      <main className="app-shell no-bottom-nav">
        <SandboxCheckout
          paymentId={sandboxId}
          onComplete={() => {
            setSandboxId("");
            setView("subscription");
            replaceAppRoute("subscription");
            refresh().catch(() => {});
          }}
          onCancel={() => {
            setSandboxId("");
            setView("subscription");
            replaceAppRoute("subscription");
          }}
        />
      </main>
    );
  }
  if (data.user.role === "customer") {
    return (
      <CustomerPortal
        user={data.user}
        onLogout={() => run(() => signOutUser())}
      />
    );
  }
  if (!profileComplete(data.user))
    return (
      <main className="app-shell no-bottom-nav">
        <Header
          user={data.user}
          onProfile={() => {
            setView("profile");
            setProduct(null);
            setFocusQrCode("");
          }}
          onNotifications={() => {
            setView("notifications");
            setProduct(null);
            setFocusQrCode("");
          }}
          unreadCount={unreadCount}
          onLogout={() => run(() => signOutUser())}
        />
        <div className="app-content">
          {toast && (
            <div className={`toast ${toast.type === "error" ? "error" : "success"}`}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {toast.type === "error" ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
                <span>{toast.message}</span>
              </div>
              <button onClick={() => setToast(null)} aria-label="Close notification">
                <X size={16} />
              </button>
            </div>
          )}
          <Profile
            data={data}
            required
            busy={busy}
            onSave={(form) =>
              run(async () => {
                const res = await api.updateProfile(form);
                const updatedUser = res?.user || {
                  ...(data?.user || {}),
                  ...form,
                  updatedAt: new Date().toISOString(),
                };
                setData((prev) => (prev ? { ...prev, user: updatedUser } : { user: updatedUser, pricing: null, qrs: [], sales: [], requests: [], notifications: [], accessRequests: [], stats: {} }));
                const latest = await refresh();
                if (latest?.user) {
                  setData(latest);
                }
                setView("dashboard");
                setProduct(null);
                setFocusQrCode("");
                replaceAppRoute("dashboard");
              }, "Business profile saved. QR features are now available.")
            }
            onRead={(id) => run(async () => { await api.markNotificationRead(id); await refresh(); })}
            onDeleteNotification={(id) => run(async () => { await api.deleteNotification(id); await refresh(); }, "Notification deleted.")}
            onClearNotifications={() => run(async () => { await api.clearNotifications(); await refresh(); }, "All notifications cleared.")}
          />
        </div>
      </main>
    );
  const navigation = (target) => {
    setScannerOpen(false);
    setProduct(null);
    setFocusQrCode("");
    setView(target);
    pushAppRoute(target, false);
  };
  const openProduct = (nextProduct, scannedCode = "") => {
    setScannerOpen(false);
    setProduct(nextProduct);
    setFocusQrCode(scannedCode || "");
    pushAppRoute(view || "dashboard", true);
  };
  const closeProduct = () => {
    setProduct(null);
    setFocusQrCode("");
    replaceAppRoute(view || "dashboard", false);
  };
  const page = product ? (
    <EnrichedProductDetail
      product={product}
      data={data}
      focusQrCode={focusQrCode}
      onClose={closeProduct}
      onPrintSheets={handlePrintSheets}
      onPrintSingle={handlePrintSingle}
      onDownloadQrs={handleDownloadQrs}
      onDownloadSingle={handleDownloadSingle}
      onReturnSale={handleReturnSale}
    />
  ) : view === "subscription" ? (
    <Subscription
      user={data.user}
      accessRequest={data.accessRequests?.[0]}
      onPay={(payment) =>
        run(async () => {
          const result = await api.startPayment(payment);
          window.location.assign(result.redirectUrl);
        })
      }
      onRequestAccess={() =>
        run(async () => {
          await api.requestAccess({});
          await refresh();
        }, "Free-access request sent to the administrator.")
      }
      busy={busy}
    />
  ) : view === "requests" ? (
    activeAccess(data.user) ? (
      <Requests
        data={data}
        onCreate={(form) =>
          run(async () => {
            await api.createRequest(form);
            await refresh();
          }, "QR request submitted.")
        }
        onPay={(payment) =>
          run(async () => {
            const result = await api.startStickerPayment(payment);
            window.location.assign(result.redirectUrl);
          })
        }
        onUpgrade={(requestId) =>
          run(async () => {
            await api.upgradeStickerRequest(requestId);
            await refresh();
          }, "Physical sticker order prepared. Complete payment to receive delivery.")
        }
        onPrintSheets={handlePrintSheets}
        onDownloadQrs={handleDownloadQrs}
        onDelete={(requestId) =>
          run(async () => {
            await api.deleteStickerRequest(requestId);
            await refresh();
          }, "Request deleted.")
        }
        busy={busy}
      />
    ) : (
      <Subscription
        user={data.user}
        accessRequest={data.accessRequests?.[0]}
        onPay={(payment) =>
          run(async () => {
            const result = await api.startPayment(payment);
            window.location.assign(result.redirectUrl);
          })
        }
        onRequestAccess={() =>
          run(async () => {
            await api.requestAccess({});
            await refresh();
          }, "Free-access request sent to the administrator.")
        }
        busy={busy}
      />
    )
  ) : view === "qrs" ? (
    <InventoryFolders
      data={data}
      busy={busy}
      onSell={(qrCode, saleDetails) =>
        run(async () => {
          await api.recordSale({ code: qrCode, ...saleDetails });
          await refresh();
        }, "Sale recorded, QR activated, and warranty countdown started.")
      }
      onAddToFolder={(group, addition) =>
        run(async () => {
          const groupIdForQr = (qr) => (qr.groupId || `${qr.requestId}_${String(qr.productId || qr.productName).replace(/[^A-Za-z0-9_-]/g, "_")}`);
          const groupQrs = data.qrs.filter((qr) => groupIdForQr(qr) === group.id);
          const productNames = [...new Set(groupQrs.map((qr) => qr.productName).filter(Boolean))];
          const source = groupQrs.find((qr) => qr.productName === productNames[0]) || groupQrs[0];
          if (!source) throw new Error("The selected product is no longer available in this folder.");
          await api.createRequest({ targetGroupId: group.id, shopName: group.shopName || source.shopName || data.user.shopName, shopAddress: group.shopAddress || source.shopAddress || data.user.shopAddress, products: [{ productName: source.productName, productModel: source.productModel || group.productModel || "", brandName: source.brandName || group.brandName || "", quantity: addition.quantity, defaultPrice: source.defaultPrice ?? "", costPrice: source.costPrice ?? "", warrantyDuration: source.warrantyDuration || {}, notes: source.notes || "" }], fulfillment: "digital" });
          await refresh();
        }, "Additional QR codes are being generated in this folder.")
      }
      onDeleteQr={(qrCode) =>
        run(async () => {
          await api.deleteQr(qrCode);
          await refresh();
        }, "Unused QR code deleted.")
      }
      onDeleteQrs={(qrCodes) =>
        run(async () => {
          await api.deleteQrs(qrCodes);
          await refresh();
        }, "Selected unused QR codes deleted.")
      }
      onDeleteGroup={(groupId) =>
        run(async () => {
          await api.deleteQrGroup(groupId);
          await refresh();
        }, "Unused QR folder deleted.")
      }
      onPrintSheets={handlePrintSheets}
      onPrintSingle={handlePrintSingle}
      onDownloadQrs={handleDownloadQrs}
      onDownloadSingle={handleDownloadSingle}
      onReturnSale={handleReturnSale}
    />
  ) : view === "sales" ? (
    <Sales data={data} onReturnSale={handleReturnSale} />
  ) : view === "report" ? (
    <ReportPage
      data={data}
      range={reportRange}
      onChangeRange={setReportRange}
      onBack={() => navigation("dashboard")}
    />
  ) : view === "chat" ? (
    <ChatBoard onBack={() => navigation("dashboard")} />
  ) : view === "notifications" ? (
    <NotificationsView
      data={data}
      busy={busy}
      onBack={() => navigation("dashboard")}
      onRead={(id) =>
        run(async () => {
          await api.markNotificationRead(id);
          await refresh();
        })
      }
      onDeleteNotification={(id) =>
        run(async () => {
          await api.deleteNotification(id);
          await refresh();
        }, "Notification deleted.")
      }
      onClearNotifications={() =>
        run(async () => {
          await api.clearNotifications();
          await refresh();
        }, "All notifications cleared.")
      }
    />
  ) : view === "profile" ? (
    <Profile
      data={data}
      busy={busy}
      onSave={(form) =>
        run(async () => {
          const res = await api.updateProfile(form);
          const updatedUser = res?.user || {
            ...(data?.user || {}),
            ...form,
            updatedAt: new Date().toISOString(),
          };
          setData((prev) => (prev ? { ...prev, user: updatedUser } : { user: updatedUser, pricing: null, qrs: [], sales: [], requests: [], notifications: [], accessRequests: [], stats: {} }));
          const latest = await refresh();
          if (latest?.user) {
            setData(latest);
          }
          navigation("dashboard");
        }, "Business profile saved. QR features are now available.")
      }
      onRead={(id) =>
        run(async () => {
          await api.markNotificationRead(id);
          await refresh();
        })
      }
      onDeleteNotification={(id) =>
        run(async () => {
          await api.deleteNotification(id);
          await refresh();
        }, "Notification deleted.")
      }
      onClearNotifications={() =>
        run(async () => {
          await api.clearNotifications();
          await refresh();
        }, "All notifications cleared.")
      }
    />
  ) : (
    <Dashboard
      data={data}
      navigate={navigation}
      onOpenProduct={openProduct}
      reportRange={reportRange}
      onReportRangeChange={setReportRange}
      onOpenReport={() => navigation("report")}
      onReturnSale={handleReturnSale}
    />
  );
  return (
    <main className={`app-shell ${view === "chat" ? "is-chat-fullscreen" : ""}`}>
      <GlobalBusyOverlay busy={busy} label="Processing…" />
      {view !== "chat" ? (
        <Header
          user={data.user}
          view={view}
          navigate={navigation}
          onScan={() => {
            setScannerOpen(true);
            window.history.pushState(
              { warq: true, warqScanner: true, view },
              "",
              window.location.hash || appHash(view || "dashboard"),
            );
          }}
          onProfile={() => navigation("profile")}
          onNotifications={() => navigation("notifications")}
          unreadCount={unreadCount}
          onLogout={() => run(() => signOutUser())}
        />
      ) : null}
      <div className={`app-content ${view === "chat" ? "is-chat-fullscreen" : ""}`}>
        {toast && (
          <div className={`toast ${toast.type === "error" ? "error" : "success"}`}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {toast.type === "error" ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
              <span>{toast.message}</span>
            </div>
            <button onClick={() => setToast(null)} aria-label="Close notification">
              <X size={16} />
            </button>
          </div>
        )}
        {page}
        {view === "dashboard" && !product ? <AiPreviewModule /> : null}
      </div>
      {printData && (
        <PrintStudioModal
          printData={printData}
          onClose={() => setPrintData(null)}
          onDownloadZip={downloadAllQrs}
          onDownloadSingle={(qr) => downloadQr(qr.code, qr.productName, qr.serial)}
        />
      )}
      {scannerOpen && (
        <EnrichedQrScanner
          onClose={() => {
            setScannerOpen(false);
            if (window.history.state?.warqScanner) {
              window.history.back();
            }
          }}
          onOpenInventory={() => {
            setScannerOpen(false);
            navigation("qrs");
          }}
          onVerified={syncScannedQr}
          onRecordSale={(qr, saleDetails = {}) =>
            api.recordSale({
              code: qr.code,
              actualPrice: saleDetails.actualPrice,
              ...(saleDetails.customerName ? { customerName: saleDetails.customerName } : {}),
              ...(saleDetails.customerPhone ? { customerPhone: saleDetails.customerPhone } : {}),
              ...(saleDetails.customerAddress ? { customerAddress: saleDetails.customerAddress } : {}),
              ...(saleDetails.customerNotes ? { customerNotes: saleDetails.customerNotes } : {}),
            })
          }
          onReturnSale={handleReturnSale}
          onOpenProduct={(scannedProduct, scannedQr) => {
            setScannerOpen(false);
            setView("dashboard");
            setProduct(scannedProduct);
            setFocusQrCode(scannedQr?.code || "");
            pushAppRoute("dashboard", true);
          }}
        />
      )}
      {view !== "chat" ? (
      <nav className="bottom-nav">
        {[
          ["dashboard", ShoppingBag, "Home"],
          ["requests", PackagePlus, "Requests"],
          ["scanner", ScanLine, "Scan"],
          ["qrs", QrCode, "QRs"],
          ["profile", UserRound, "Profile"],
        ].map(([id, Icon, label]) => (
          <button
            key={id}
            className={
              id === "scanner"
                ? "scan-nav"
                : view === id || (id === "dashboard" && product)
                  ? "active"
                  : ""
            }
            onClick={() => {
              if (id === "scanner") {
                setScannerOpen(true);
                window.history.pushState(
                  { warq: true, warqScanner: true, view },
                  "",
                  window.location.hash || appHash(view || "dashboard"),
                );
                return;
              }
              navigation(id);
            }}
            aria-label={id === "scanner" ? "Scan a QR code" : label}
          >
            <span>
              <Icon />
            </span>
            <small>{label}</small>
          </button>
        ))}
      </nav>
      ) : null}
    </main>
  );
}
function AdminApp() {
  const [user, setUser] = useState(undefined),
    [data, setData] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [printData, setPrintData] = useState(null),
    [tab, setTab] = useState("orders"),
    [booting, setBooting] = useState(false),
    [supportNotice, setSupportNotice] = useState(""),
    [supportWaitingCount, setSupportWaitingCount] = useState(0);
  const refreshRef = useRef(null);
  const bootRequestRef = useRef(0);
  const supportAlertRef = useRef(0);
  const refresh = async () => {
    const next = await adminApi.adminSummary();
    setData(next);
    setError("");
    return next;
  };
  refreshRef.current = refresh;

  const handlePrintSheets = (qrs, title) => {
    if (!qrs || !qrs.length) {
      alert("No QR codes available to print.");
      return;
    }
    setPrintData({ qrs, title: title || "WarQ QR Sticker Sheets", single: false });
  };
  const handleDownloadQrs = (qrs, name) => {
    downloadAllQrs(qrs, name);
  };

  const initializeAdmin = async (current) => {
    if (!current) return;
    const requestId = ++bootRequestRef.current;
    setBooting(true);
    setError("");
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const next = await adminApi.adminSummary();
        if (requestId !== bootRequestRef.current) return;
        setData(next);
        setError("");
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        const retryable =
          err?.code === "server/connection-failed" ||
          err?.code === "resource-exhausted" ||
          err?.code === "server/timeout" ||
          /quota exceeded|temporarily unavailable|Failed to fetch/i.test(String(err?.message || ""));
        if (!retryable || attempt === 2) break;
        await new Promise((resolve) => window.setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
    if (lastError) {
      if (requestId !== bootRequestRef.current) return;
      setError(errorText(lastError));
    }
    if (requestId === bootRequestRef.current) setBooting(false);
  };

  useEffect(
    () =>
      onAuthStateChanged(adminAuth, (current) => {
        setUser(current);
        if (!current) {
          bootRequestRef.current += 1;
          setData(null);
          setError("");
          setBooting(false);
          return;
        }
        initializeAdmin(current);
      }),
    [],
  );
  useDisableNumberWheel();
  useEffect(() => {
    if (!user?.uid || !data) return undefined;
    return bindRealtimeSync({
      onSync: () => refreshRef.current?.(),
      intervalMs: 90000,
      syncOnFocus: true,
    });
  }, [user?.uid, Boolean(data)]);

  useEffect(() => {
    if (!user?.uid || !data) return undefined;
    const pollSupport = async () => {
      try {
        // When Support tab is open, AdminSupportPanel owns the detailed polling.
        if (tab === "support") return;
        const queue = await adminApi.adminSupportQueue();
        const count = Number(queue.waitingCount || 0);
        if (count !== supportAlertRef.current) {
          if (count > supportAlertRef.current) {
            setSupportNotice(`Support: ${count} user${count === 1 ? "" : "s"} waiting for admin chat.`);
          }
          supportAlertRef.current = count;
          setSupportWaitingCount(count);
        }
      } catch {
        // Keep admin panel usable if support poll fails.
      }
    };
    pollSupport();
    return bindRealtimeSync({
      onSync: pollSupport,
      intervalMs: 12000,
      minGapMs: 10000,
      syncOnFocus: true,
    });
  }, [user?.uid, Boolean(data), tab]);
  useEffect(() => {
    if (!supportNotice) return undefined;
    const timer = window.setTimeout(() => setSupportNotice(""), 9000);
    return () => window.clearTimeout(timer);
  }, [supportNotice]);
  const run = async (work) => {
    setBusy(true);
    setError("");
    try {
      return await work();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  if (user === undefined) return <Loading />;
  if (!user)
    return (
      <AdminLogin
        busy={busy}
        error={error}
        onLogin={(credentials) =>
          run(async () => {
            const result = await adminApi.adminPasswordLogin(credentials);
            await signInAdminWithToken(result.customToken);
          })
        }
      />
    );
  if (!data) {
    if (error) {
      return (
        <SessionBootError
          message={error}
          busy={booting || busy}
          onRetry={() => initializeAdmin(user)}
          onLogout={() => run(() => signOutAdmin())}
        />
      );
    }
    return <Loading />;
  }
  return (
    <main className="app-shell no-bottom-nav">
      <GlobalBusyOverlay busy={busy} label="Processing…" />
      <Header
        user={{ name: "Administrator" }}
        admin
        onProfile={() => setTab("profile")}
        onLogout={() => run(() => signOutAdmin())}
      />
      <div className="app-content">
        {error && (
          <div className="toast error">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
            <button onClick={() => setError("")} aria-label="Close notification">
              <X size={16} />
            </button>
          </div>
        )}
        {supportNotice && (
          <div className="toast">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <MessageCircle size={18} />
              <span>{supportNotice}</span>
            </div>
            <button onClick={() => setSupportNotice("")} aria-label="Close notification">
              <X size={16} />
            </button>
          </div>
        )}
        <Admin
          data={data}
          run={run}
          refresh={() => run(refresh)}
          onPrintSheets={handlePrintSheets}
          onDownloadQrs={handleDownloadQrs}
          busy={busy}
          tab={tab}
          setTab={setTab}
          supportWaitingCount={supportWaitingCount}
        />
      </div>
      {printData && (
        <PrintStudioModal
          printData={printData}
          onClose={() => setPrintData(null)}
          onDownloadZip={downloadAllQrs}
          onDownloadSingle={(qr) => downloadQr(qr.code, qr.productName, qr.serial)}
        />
      )}
    </main>
  );
}
function Root() {
  const [admin, setAdmin] = useState(() => parseAppRoute().admin);
  useEffect(() => {
    const sync = () => setAdmin(parseAppRoute().admin);
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);
  return admin ? <AdminApp /> : <App />;
}
class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error) {
    console.error("WarQ interface error", error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="loading-screen">
        <section className="panel session-error">
          <div className="brand-mark"><AlertCircle /></div>
          <h1>WarQ could not load this page</h1>
          <p>Please reload the page. If the problem continues, sign in again from the WarQ home page.</p>
          <button className="primary-button" onClick={() => window.location.reload()}>Reload WarQ</button>
        </section>
      </main>
    );
  }
}
createRoot(document.getElementById("root")).render(<AppErrorBoundary><Root /></AppErrorBoundary>);
mountDemoUi();
ensureSeeded().catch((error) => {
  console.error("WarQ demo data could not be prepared.", error);
});
