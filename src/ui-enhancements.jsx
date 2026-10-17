import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  BadgeCheck,
  Bell,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Database,
  KeyRound,
  LoaderCircle,
  LogOut,
  Mail,
  MapPin,
  PackagePlus,
  QrCode,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Store,
  Trash2,
  TrendingUp,
  UserRound,
  Users,
  WalletCards,
  X,
  Zap,
} from "lucide-react";
import { BD_DISTRICTS, getUpazilasForDistrict } from "./bd-locations";

const ASSET_BASE = import.meta.env.BASE_URL || "/";

const PAYMENT_BRANDS = {
  bkash: {
    id: "bkash",
    name: "bKash",
    logo: `${ASSET_BASE}assets/payments/bkash-logo.svg`,
    logoWidth: 118,
    logoHeight: 42,
    tagline: "Pay securely from your bKash wallet",
    supportLabel: "bKash helpline",
    supportNumber: "16247",
    website: "https://www.bkash.com/",
    steps: [
      "Select bKash and confirm the payable amount.",
      "You will be redirected to the official bKash checkout page.",
      "Approve the payment in your bKash app or browser session.",
      "Return to WarQ automatically once payment succeeds.",
    ],
  },
  nagad: {
    id: "nagad",
    name: "Nagad",
    logo: `${ASSET_BASE}assets/payments/nagad-logo.png`,
    logoWidth: 118,
    logoHeight: 53,
    tagline: "Pay securely from your Nagad account",
    supportLabel: "Nagad helpline",
    supportNumber: "16167",
    website: "https://nagad.com.bd/",
    steps: [
      "Select Nagad and confirm the payable amount.",
      "You will be redirected to the official Nagad payment gateway.",
      "Complete the payment using your Nagad account.",
      "Return to WarQ automatically once payment succeeds.",
    ],
  },
};

export function PaymentBrandLogo({ provider, compact = false, className = "" }) {
  const brand = PAYMENT_BRANDS[provider];
  if (!brand) return null;
  const width = compact ? Math.round(brand.logoWidth * 0.62) : brand.logoWidth;
  const height = compact ? Math.round(brand.logoHeight * 0.62) : brand.logoHeight;
  return (
    <img
      src={brand.logo}
      alt={`${brand.name} official logo`}
      className={`payment-brand-logo ${className}`.trim()}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  );
}

function CopySupportButton({ label, value }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt(`Copy ${label}:`, value);
    }
  };
  return (
    <button type="button" className="payment-support-copy" onClick={copy}>
      <span className="payment-support-copy-label">{label}</span>
      <strong>{value}</strong>
      {copied ? <Check size={14} /> : <Copy size={14} />}
      <span className="sr-only">{copied ? "Copied" : `Copy ${label}`}</span>
    </button>
  );
}

export function PaymentCheckoutGuide({ provider }) {
  const brand = PAYMENT_BRANDS[provider];
  if (!brand) return null;
  return (
    <div className={`payment-checkout-guide ${brand.id}-guide`}>
      <div className="payment-checkout-guide-head">
        <ShieldCheck size={16} />
        <div>
          <strong>How {brand.name} payment works</strong>
          <small>Official secure gateway — no manual send-money step required</small>
        </div>
      </div>
      <ol className="payment-checkout-steps">
        {brand.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <div className="payment-support-row">
        <CopySupportButton label={brand.supportLabel} value={brand.supportNumber} />
        <a href={brand.website} target="_blank" rel="noopener noreferrer" className="payment-brand-link">
          Visit {brand.name} official site
        </a>
      </div>
    </div>
  );
}

export function PaymentProviderPicker({
  provider,
  onChange,
  compact = false,
  showGuide = false,
}) {
  return (
    <div className={`payment-provider-shell ${compact ? "compact" : ""}`}>
      <div className={`provider-options ${compact ? "compact" : ""}`}>
        {Object.values(PAYMENT_BRANDS).map((brand) => {
          const selected = provider === brand.id;
          return (
            <button
              key={brand.id}
              type="button"
              className={`provider-card ${brand.id}-card ${selected ? "selected" : ""}`}
              onClick={() => onChange(brand.id)}
              aria-pressed={selected}
            >
              <div className="provider-card-main">
                <div className="provider-logo-frame">
                  <PaymentBrandLogo provider={brand.id} compact={compact} />
                </div>
                <div className="provider-info">
                  <strong>{brand.name}</strong>
                  <small>{compact ? brand.tagline.replace("Pay securely from your ", "") : brand.tagline}</small>
                  {!compact && (
                    <span className="provider-support-hint">
                      Need help? Call {brand.supportNumber}
                    </span>
                  )}
                </div>
              </div>
              <div className={`provider-radio ${selected ? "checked" : ""}`} aria-hidden="true">
                <CheckCircle2 size={18} />
              </div>
            </button>
          );
        })}
      </div>
      {showGuide && !compact && <PaymentCheckoutGuide provider={provider} />}
    </div>
  );
}

export function LoadingButton({
  busy = false,
  loadingText = "Processing…",
  keepLabel = false,
  children,
  className = "primary-button",
  disabled,
  ...props
}) {
  const showSpinner = busy || undefined;
  return (
    <button
      className={`${className} ${busy ? "is-busy" : ""}`.trim()}
      disabled={busy || disabled}
      aria-busy={showSpinner}
      {...props}
    >
      {busy ? (
        keepLabel ? (
          <>
            <LoaderCircle className="spin button-spinner" size={16} aria-hidden="true" />
            <span className="button-spinner-label">{children}</span>
          </>
        ) : (
          <>
            <LoaderCircle className="spin" size={16} /> {loadingText}
          </>
        )
      ) : (
        children
      )}
    </button>
  );
}

export function GlobalBusyOverlay({ busy, label = "Processing…" }) {
  if (!busy) return null;
  return (
    <div className="global-busy-overlay" aria-live="polite" role="status">
      <div className="global-busy-card">
        <LoaderCircle className="spin" size={28} />
        <strong>{label}</strong>
      </div>
    </div>
  );
}

export function LocationPicker({ district, upazila, onDistrictChange, onUpazilaChange }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const filteredDistricts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return BD_DISTRICTS;
    return BD_DISTRICTS.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.division.toLowerCase().includes(q),
    );
  }, [query]);

  const selectedMeta = BD_DISTRICTS.find(
    (item) => item.name.toLowerCase() === String(district || "").trim().toLowerCase(),
  );
  const resolvedDistrict = selectedMeta?.name || "";
  const upazilas = getUpazilasForDistrict(resolvedDistrict);
  const resolvedUpazila = upazilas.find(
    (name) => name.toLowerCase() === String(upazila || "").trim().toLowerCase(),
  ) || "";

  useEffect(() => {
    const onDoc = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const handleSelectDistrict = (districtName) => {
    // Changing district clears upazila — user must pick a valid area explicitly.
    onDistrictChange?.(districtName);
    onUpazilaChange?.("");
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="location-picker-grid">
      <div className="location-picker-field" ref={wrapRef}>
        <div className="location-picker-label">
          <MapPin size={14} aria-hidden="true" />
          <span>District *</span>
        </div>
        <button
          type="button"
          className={`location-picker-trigger ${resolvedDistrict || district ? "filled" : ""}`}
          onClick={() => setOpen((value) => !value)}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          {resolvedDistrict || district ? (
            <>
              <strong>{resolvedDistrict || district}</strong>
              <small>{selectedMeta?.division || "Bangladesh"} Division</small>
            </>
          ) : (
            <span>Search and select your district</span>
          )}
        </button>
        {open && (
          <div className="location-picker-panel">
            <div className="location-search">
              <Search size={16} />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search district or division…"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            <div className="location-options">
              {filteredDistricts.map((item) => (
                <button
                  type="button"
                  key={item.name}
                  className={`location-option ${(resolvedDistrict || district) === item.name ? "selected" : ""}`}
                  onClick={() => handleSelectDistrict(item.name)}
                >
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.division} Division</small>
                  </span>
                  {(resolvedDistrict || district) === item.name && <Check size={16} />}
                </button>
              ))}
              {!filteredDistricts.length && (
                <p className="location-empty">No district matched your search.</p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="location-picker-field">
        <div className="location-picker-label" id="location-upazila-label">
          <MapPin size={14} aria-hidden="true" />
          <span>Upazila *</span>
        </div>
        <select
          id="location-upazila-select"
          aria-labelledby="location-upazila-label"
          required
          value={resolvedUpazila}
          onChange={(e) => onUpazilaChange?.(e.target.value)}
          disabled={!resolvedDistrict}
          className="location-select"
        >
          <option value="">
            {resolvedDistrict ? "Select upazila / thana" : "Choose a district first"}
          </option>
          {upazilas.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function HeaderMenu({
  user,
  onProfile,
  onLogout,
  admin = false,
  onNotifications,
  unreadCount = 0,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const displayName = admin ? "Administrator" : user?.name || "WarQ user";
  const displaySubtitle = admin ? "Super Admin Console" : user?.shopName || user?.email || "";

  return (
    <div className="header-menu-wrap" ref={ref}>
      <button
        type="button"
        className="avatar"
        onClick={() => setOpen((value) => !value)}
        title={displayName}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {displayName.slice(0, 1).toUpperCase()}
      </button>
      {!admin && unreadCount > 0 && (
        <span className="avatar-unread-badge" aria-hidden="true" />
      )}
      {open && (
        <div className="header-menu" role="menu">
          <div className="header-menu-user">
            <strong>{displayName}</strong>
            <small>{displaySubtitle}</small>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onProfile?.();
            }}
          >
            {admin ? <ShieldCheck size={16} /> : <UserRound size={16} />}
            <span>{admin ? "Admin Profile & Info" : "Profile & Settings"}</span>
          </button>
          {!admin && onNotifications && (
            <button
              type="button"
              role="menuitem"
              className="menu-notifications"
              onClick={() => {
                setOpen(false);
                onNotifications();
              }}
            >
              <Bell size={16} />
              <span>Notifications</span>
              {unreadCount > 0 && (
                <span className="header-menu-badge">{unreadCount}</span>
              )}
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="danger"
            onClick={() => {
              setOpen(false);
              onLogout?.();
            }}
          >
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      )}
    </div>
  );
}

export function AdminAnnouncementComposer({ users = [], busy, onSend }) {
  const [audience, setAudience] = useState("single");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((user) =>
      [user.name, user.email, user.shopName, user.mobile, user.id]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [users, query]);

  const toggleUser = (id) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const selectVisible = () => {
    setSelectedIds((current) => [
      ...new Set([...current, ...filteredUsers.map((user) => user.id)]),
    ]);
  };

  const submit = async (e) => {
    if (e) e.preventDefault();
    if (!message.trim()) return;
    if (audience === "single" && !selectedIds.length) return;
    await onSend({
      audience: audience === "all" ? "all" : "single",
      recipientIds: audience === "all" ? undefined : selectedIds,
      title: title.trim(),
      message: message.trim(),
    });
    setTitle("");
    setMessage("");
    setSelectedIds([]);
    setQuery("");
  };

  return (
    <article className="panel announcement-composer">
      <div className="announcement-composer-head">
        <div>
          <span className="eyebrow">
            <Bell size={14} /> ANNOUNCEMENTS &amp; NOTIFICATIONS
          </span>
          <h2>Send a notification</h2>
          <p>Broadcast system announcements to all merchants or target specific accounts in real-time.</p>
        </div>
      </div>

      <div className="announcement-audience-tabs">
        <button
          type="button"
          className={audience === "all" ? "active" : ""}
          onClick={() => setAudience("all")}
        >
          <Users size={15} /> All merchants ({users.length})
        </button>
        <button
          type="button"
          className={audience === "single" ? "active" : ""}
          onClick={() => setAudience("single")}
        >
          <UserRound size={15} /> Specific merchants {selectedIds.length > 0 ? `(${selectedIds.length})` : ""}
        </button>
      </div>

      {audience === "single" && (
        <div className="announcement-user-picker">
          <div className="announcement-user-toolbar">
            <div className="announcement-search-wrap">
              <Search size={15} className="search-icon-muted" />
<input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search merchants by name, email, shop, phone..."
                aria-label="Search merchants by name, email, shop, or phone"
              />
              {query && (
                <button
                  type="button"
                  className="announcement-search-clear"
                  onClick={() => setQuery("")}
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <div className="announcement-toolbar-actions">
              <button type="button" className="secondary-button small" onClick={selectVisible}>
                Select visible ({filteredUsers.length})
              </button>
              {selectedIds.length > 0 && (
                <button type="button" className="text-button danger" onClick={() => setSelectedIds([])}>
                  Clear selection
                </button>
              )}
            </div>
          </div>
          <div className="announcement-user-list">
            {filteredUsers.map((user) => {
              const checked = selectedIds.includes(user.id);
              return (
                <label key={user.id} className={`announcement-user-row ${checked ? "selected" : ""}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleUser(user.id)}
                  />
                  <span className="avatar small">{(user.name || user.shopName || "U").slice(0, 1).toUpperCase()}</span>
                  <span className="announcement-user-meta">
                    <strong>{user.name || "Unnamed Merchant"}</strong>
                    <small>
                      {[user.shopName, user.email, user.mobile].filter(Boolean).join(" · ") || user.id}
                    </small>
                  </span>
                  {checked && <Check size={16} className="checked-tick" />}
                </label>
              );
            })}
            {!filteredUsers.length && (
              <p className="location-empty">No merchants matched your search.</p>
            )}
          </div>
          <p className="announcement-selected-count">
            <strong>{selectedIds.length}</strong> of {users.length} merchants selected
          </p>
        </div>
      )}

      <label>
        Notification Title (Optional)
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. System Maintenance / Important Update"
        />
      </label>
      <label>
        Notification Message *
        <textarea
          required
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Write your announcement or notice here…"
        />
      </label>

      <LoadingButton
        busy={busy}
        loadingText="Sending notification…"
        disabled={!message.trim() || (audience === "single" && !selectedIds.length)}
        onClick={submit}
        className="primary-button"
      >
        <Send size={16} />{" "}
        {audience === "all"
          ? `Broadcast to all ${users.length} merchants`
          : `Send to ${selectedIds.length || 0} selected merchant${selectedIds.length === 1 ? "" : "s"}`}
      </LoadingButton>
    </article>
  );
}

export function AdminSentNotificationsList({
  notifications = [],
  users = [],
  onDelete,
  busy,
}) {
  const [filterQuery, setFilterQuery] = useState("");

  const formatTime = (value) => {
    if (!value) return "—";
    try {
      return new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value));
    } catch {
      return String(value);
    }
  };

  const filtered = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return notifications;
    return notifications.filter((item) =>
      [item.title, item.message, item.recipientId, item.audience]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [notifications, filterQuery]);

  const userMap = useMemo(() => {
    const map = new Map();
    users.forEach((u) => {
      if (u && u.id) map.set(u.id, u);
    });
    return map;
  }, [users]);

return (
    <article className="panel admin-sent-notifications">
      <div className="notification-panel-head">
        <div className="notification-panel-heading-text">
          <span className="eyebrow">
            <Clock size={13} /> SENT BROADCASTS &amp; NOTIFICATIONS
          </span>
          <h2>Notification History ({notifications.length})</h2>
          <p>Review all previously sent admin notices and real-time user communications.</p>
        </div>
        {notifications.length > 0 && (
          <div className="announcement-search-wrap notification-panel-search">
            <Search size={14} className="search-icon-muted" />
            <input
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Search sent notices..."
              aria-label="Search sent notices"
            />
            {filterQuery && (
              <button
                type="button"
                className="announcement-search-clear"
                onClick={() => setFilterQuery("")}
                title="Clear"
                aria-label="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>
        )}
      </div>

      {filtered.length > 0 ? (
        <div className="admin-notification-list notification-list-scroll">
          {filtered.map((item) => {
            const recipientUser = userMap.get(item.recipientId);
            const isBroadcast = item.audience === "all";
            return (
              <div key={item.id} className="admin-notification-item">
                <div className="admin-notif-left">
                  <div className="admin-notif-icon">
                    <Bell size={16} />
                  </div>
                  <div className="admin-notif-content">
                    <div className="admin-notif-title-row">
                      <strong>{item.title || "Message from WarQ"}</strong>
                      <span className={`pill ${isBroadcast ? "primary" : "neutral"}`}>
                        {isBroadcast ? "Broadcast (All)" : "Direct Message"}
                      </span>
                      {item.readAt ? (
                        <span className="pill success" title={`Read at ${formatTime(item.readAt)}`}>
                          Read
                        </span>
                      ) : (
                        <span className="pill warning">Delivered</span>
                      )}
                    </div>
                    <p className="admin-notif-body">{item.message}</p>
                    <div className="admin-notif-meta">
                      <span>Sent: {formatTime(item.createdAt)}</span>
                      {!isBroadcast && (
                        <span>
                          Recipient: <strong>{recipientUser?.name || recipientUser?.shopName || item.recipientId}</strong>
                          {recipientUser?.mobile ? ` (${recipientUser.mobile})` : ""}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {onDelete && (
                  <button
                    type="button"
                    className="small-action danger-action"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm("Delete this notification record?")) {
                        onDelete(item.id);
                      }
                    }}
                    title="Delete notification"
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty notification-empty">
          <Bell size={32} color="#94a3b8" />
          <strong>No notifications found</strong>
          <p>Sent notifications and merchant messages will appear here.</p>
        </div>
      )}
    </article>
  );
}

export function AdminProfileView({ data, onLogout }) {
  const money = (val) =>
    new Intl.NumberFormat("en-BD", { maximumFractionDigits: 2 }).format(Number(val || 0));

  return (
    <article className="panel admin-profile-panel">
      {/* Header */}
      <div className="admin-profile-hero">
        <div className="admin-profile-avatar-large">
          <ShieldCheck size={38} />
        </div>
        <div className="admin-profile-hero-info">
          <div className="admin-badge-row">
            <span className="pill primary">
              <ShieldCheck size={12} /> Super Administrator
            </span>
            <span className="pill success">
              <span className="pulse-dot"></span> Active Console Session
            </span>
          </div>
          <h2>WarQ Administrator</h2>
          <p>Full administrative authority over QR generation, user access, pricing, and system security.</p>
        </div>
      </div>

      {/* System Status Grid */}
      <div className="admin-system-grid">
        <div className="admin-system-card">
          <div className="system-card-icon green">
            <Database size={18} />
          </div>
          <div className="system-card-text">
            <span>Database Status</span>
            <strong>Connected · Firestore Rules Enforced</strong>
            <small>Browser direct writes blocked; Trusted Admin SDK active</small>
          </div>
        </div>

        <div className="admin-system-card">
          <div className="system-card-icon blue">
            <Activity size={18} />
          </div>
          <div className="system-card-text">
            <span>Real-Time Engine</span>
            <strong>Active · Reactive Snapshot Sync</strong>
            <small>Live updates for orders, notifications, and merchant access</small>
          </div>
        </div>

        <div className="admin-system-card">
          <div className="system-card-icon purple">
            <KeyRound size={18} />
          </div>
          <div className="system-card-text">
            <span>Authentication Architecture</span>
            <strong>Custom Token Isolated Session</strong>
            <small>Exempt from standard merchant email verification restrictions</small>
          </div>
        </div>

        <div className="admin-system-card">
          <div className="system-card-icon orange">
            <Store size={18} />
          </div>
          <div className="system-card-text">
            <span>System Summary</span>
            <strong>{data?.users?.length || 0} Registered Merchants</strong>
            <small>BDT {money(data?.globalStats?.subscriptionRevenue || data?.globalStats?.totalRevenue || 0)} Total Revenue</small>
          </div>
        </div>
      </div>

      {/* Security Actions & Logout */}
      <div className="admin-profile-actions-box">
        <div className="admin-profile-actions-info">
          <h3>Admin Session Management</h3>
          <p>When you finish administrative tasks, log out to ensure console security.</p>
        </div>
        <button
          type="button"
          className="danger-button admin-logout-btn"
          onClick={onLogout}
        >
          <LogOut size={16} /> Sign Out from Admin Console
        </button>
      </div>
    </article>
  );
}
