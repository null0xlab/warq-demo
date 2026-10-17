import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Info,
  LoaderCircle,
  QrCode,
  Send,
  ShieldCheck,
  ShoppingBag,
  Timer,
  Wrench,
  X,
} from "lucide-react";
import { api } from "./api";
import { readOfflineQrRecord } from "./demo/qr-payload.js";
import {
  remainingSecondsUntil,
  splitCountdownParts,
  useWallClockNow,
} from "./wall-clock";

const money = (value) =>
  new Intl.NumberFormat("en-BD", { maximumFractionDigits: 2 }).format(
    Number(value || 0),
  );

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
    return d.toLocaleString();
  }
};

function warrantyText(duration) {
  if (!duration) return "No Warranty";
  const parts = [];
  if (duration.months) parts.push(`${duration.months} Month${duration.months === 1 ? "" : "s"}`);
  if (duration.days) parts.push(`${duration.days} Day${duration.days === 1 ? "" : "s"}`);
  if (duration.hours) parts.push(`${duration.hours} Hour${duration.hours === 1 ? "" : "s"}`);
  if (duration.minutes) parts.push(`${duration.minutes} Minute${duration.minutes === 1 ? "" : "s"}`);
  if (duration.seconds) parts.push(`${duration.seconds} Second${duration.seconds === 1 ? "" : "s"}`);
  return parts.length ? `${parts.join(" ")} Warranty` : "No Warranty";
}

function errorText(error) {
  return error?.message || "Something went wrong. Please try again.";
}

function PublicLiveCountdown({ expiresAt }) {
  const nowTime = useWallClockNow();
  const diffSec = remainingSecondsUntil(expiresAt, nowTime);
  const isExpired = diffSec <= 0;
  const { days, hours, minutes, seconds } = splitCountdownParts(diffSec);

  if (isExpired) {
    return (
      <div className="countdown-display-card expired">
        <div className="countdown-card-header">
          <AlertTriangle size={20} />
          <span>Warranty Expired</span>
        </div>
        <p className="countdown-subtext">
          {expiresAt
            ? `Warranty coverage expired on ${dateTimeWithDay(expiresAt)}`
            : "Warranty coverage has expired."}
        </p>
      </div>
    );
  }

  return (
    <div className="countdown-display-card active">
      <div className="countdown-card-header">
        <Timer size={20} className="spin-slow" />
        <span>Live Remaining Warranty Countdown</span>
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
        {expiresAt ? `Valid until ${dateTimeWithDay(expiresAt)}` : "Active warranty coverage."}
      </p>
    </div>
  );
}

function statusCopy(qr) {
  if (qr.status === "returned" || qr.warrantyStatus === "voided") {
    return {
      tone: "expired",
      title: "Warranty Voided",
      text: "This product was returned, so its warranty is no longer valid.",
      Icon: AlertTriangle,
    };
  }
  if (!qr.activated) {
    return {
      tone: "neutral",
      title: "Not Activated Yet",
      text: "This product has not been activated by the seller. Warranty coverage starts after activation.",
      Icon: Clock,
    };
  }
  if (!qr.warrantyDuration) {
    return {
      tone: "neutral",
      title: "No Warranty",
      text: "This product was sold without warranty coverage.",
      Icon: Info,
    };
  }
  // Only show Expired when a real expiration timestamp exists and has passed.
  // Missing expiry must not be treated as expired.
  if (qr.warrantyStatus === "expired" && qr.warrantyExpiresAt) {
    return {
      tone: "expired",
      title: "Warranty Expired",
      text: "This product no longer has a valid warranty.",
      Icon: AlertTriangle,
    };
  }
  return {
    tone: "active",
    title: "Active Warranty",
    text: "This product has an active warranty.",
    Icon: CheckCircle2,
  };
}

function PublicClaimPanel({ qr }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    category: "repair",
    description: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState(null);

  const setField = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (!form.customerName.trim()) return setError("Please enter your name.");
    if (!form.description.trim() || form.description.trim().length < 10) {
      return setError("Please describe the issue in at least 10 characters.");
    }
    setBusy(true);
    try {
      const result = await api.submitClaim({
        qrCode: qr.code,
        code: qr.code,
        customerName: form.customerName.trim(),
        customerPhone: form.customerPhone.trim(),
        customerEmail: form.customerEmail.trim(),
        category: form.category,
        description: form.description.trim(),
        source: "public-warranty",
      });
      const claim = result?.claim || result;
      setReceipt({
        code: claim?.code || claim?.id || "submitted",
        status: claim?.status || "submitted",
      });
      setOpen(false);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  if (receipt) {
    return (
      <div className="public-claim-receipt">
        <CheckCircle2 size={22} />
        <div>
          <strong>Warranty claim submitted</strong>
          <p>
            Your claim reference is <code>{receipt.code}</code> and its current status is{" "}
            <strong>{receipt.status}</strong>. Keep this reference to track the claim from the customer portal.
          </p>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="public-warranty-actions public-claim-cta">
        <button type="button" className="primary-button" onClick={() => setOpen(true)}>
          <Wrench size={16} /> Raise a warranty claim
        </button>
      </div>
    );
  }

  return (
    <form className="public-claim-form" onSubmit={submit}>
      <div className="public-claim-head">
        <h3>
          <Wrench size={16} /> Raise a warranty claim
        </h3>
        <button type="button" className="text-button" onClick={() => setOpen(false)} aria-label="Close claim form">
          <X size={16} />
        </button>
      </div>
      <div className="public-claim-grid">
        <label>
          Your name
          <input value={form.customerName} onChange={setField("customerName")} placeholder="Full name" />
        </label>
        <label>
          Mobile number
          <input value={form.customerPhone} onChange={setField("customerPhone")} placeholder="01XXXXXXXXX" inputMode="tel" />
        </label>
        <label>
          Email (optional)
          <input value={form.customerEmail} onChange={setField("customerEmail")} placeholder="you@example.com" inputMode="email" />
        </label>
        <label>
          Claim type
          <select value={form.category} onChange={setField("category")}>
            <option value="repair">Repair</option>
            <option value="replacement">Replacement</option>
            <option value="refund">Refund</option>
            <option value="service">Service</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="wide">
          Describe the issue
          <textarea
            value={form.description}
            onChange={setField("description")}
            rows={3}
            placeholder="Tell the shop what happened and when the problem started."
          />
        </label>
      </div>
      {error ? <p className="public-claim-error">{error}</p> : null}
      <div className="public-warranty-actions">
        <button type="submit" className="primary-button" disabled={busy}>
          {busy ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}
          {busy ? "Submitting…" : "Submit claim"}
        </button>
      </div>
    </form>
  );
}

/**
 * Public customer-facing warranty page opened from a QR scan (Google Lens,
 * camera, or any third-party scanner). No WarQ account required. Data is only
 * returned when the shopkeeper's subscription is active.
 */
export function PublicCustomerWarranty({ code, onShopkeeperLogin }) {
  const [qr, setQr] = useState(null);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [busy, setBusy] = useState(true);
  const [offline, setOffline] = useState(false);
  const [checksumOk, setChecksumOk] = useState(true);

  const load = async () => {
    setBusy(true);
    setError("");
    setErrorCode("");
    setOffline(false);
    setChecksumOk(true);
    try {
      const result = await api.getPublicQr(code);
      setQr(result.qr);
    } catch (err) {
      const fallback = await readOfflineQrRecord();
      if (fallback?.record) {
        setQr(fallback.record);
        setOffline(true);
        setChecksumOk(fallback.checksumOk !== false);
        return;
      }
      setQr(null);
      setError(errorText(err));
      setErrorCode(err?.code || "");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load();
  }, [code]);

  if (busy && !qr) {
    return (
      <main className="public-warranty-page">
        <section className="panel warranty-card enhanced-warranty-card public-warranty-card">
          <div className="public-warranty-loading">
            <LoaderCircle className="spin" size={28} />
            <p>Loading product warranty…</p>
          </div>
        </section>
      </main>
    );
  }

  if (error) {
    const subscriptionBlocked =
      errorCode === "permission-denied" ||
      /subscription/i.test(error);
    const notFound =
      errorCode === "not-found" ||
      /not found|invalid/i.test(error);

    return (
      <main className="public-warranty-page">
        <section className="panel warranty-card enhanced-warranty-card public-warranty-card">
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
              <ShieldCheck size={14} /> PRODUCT WARRANTY
            </span>
          </div>
          <div className={`warranty-hero-banner ${subscriptionBlocked || notFound ? "expired" : "neutral"}`}>
            <div className="status-hero-icon">
              <AlertTriangle size={32} />
            </div>
            <div className="status-hero-text">
              <h2>
                {subscriptionBlocked
                  ? "Unavailable"
                  : notFound
                    ? "Invalid QR Code"
                    : "Unable to Load"}
              </h2>
              <p>{error}</p>
            </div>
          </div>
          <div className="public-warranty-actions">
            <button type="button" className="primary-button" onClick={load}>
              Try again
            </button>
            {onShopkeeperLogin && (
              <button type="button" className="secondary-button" onClick={onShopkeeperLogin}>
                Shopkeeper sign in
              </button>
            )}
          </div>
        </section>
      </main>
    );
  }

  if (!qr) return null;

  const banner = statusCopy(qr);
  const BannerIcon = banner.Icon;
  const hasWarranty = Boolean(qr.warrantyDuration);
  const showCountdown =
    hasWarranty &&
    qr.activated &&
    qr.status !== "returned" &&
    qr.warrantyStatus !== "voided" &&
    Boolean(qr.warrantyExpiresAt);

  return (
    <main className="public-warranty-page">
      <section className="panel warranty-card enhanced-warranty-card public-warranty-card">
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
            <ShieldCheck size={14} /> PRODUCT WARRANTY
          </span>
        </div>

        {offline && (
          <div className={`warranty-hero-banner ${checksumOk ? "neutral" : "expired"}`}>
            <div className="status-hero-icon">
              {checksumOk ? <Info size={28} /> : <AlertTriangle size={28} />}
            </div>
            <div className="status-hero-text">
              <h2>{checksumOk ? "Verified from the QR sticker" : "QR payload check failed"}</h2>
              <p>
                {checksumOk
                  ? "This page was rendered from the signed data inside the QR code itself — no server or database was needed."
                  : "The QR payload did not match its integrity checksum. Details below may be incomplete; ask the shop to reprint the sticker."}
              </p>
            </div>
          </div>
        )}

        {banner.title !== "Warranty Expired" && banner.title !== "Active Warranty" && (
          <div className={`warranty-hero-banner ${banner.tone}`}>
            <div className="status-hero-icon">
              <BannerIcon size={32} />
            </div>
            <div className="status-hero-text">
              <h2>{banner.title}</h2>
              <p>{banner.text}</p>
            </div>
          </div>
        )}

        {showCountdown && <PublicLiveCountdown expiresAt={qr.warrantyExpiresAt} />}

        <div className="warranty-section-box">
          <h3 className="section-box-title">
            <ShoppingBag size={16} /> Product Information
          </h3>
          <div className="warranty-meta-grid">
            <div>
              <span>Product Name</span>
              <strong>{qr.productName || "—"}</strong>
            </div>
            <div>
              <span>Product Model</span>
              <strong>{qr.productModel || "—"}</strong>
            </div>
            {qr.brandName && (
              <div>
                <span>Brand</span>
                <strong>{qr.brandName}</strong>
              </div>
            )}
            {qr.activated && (
              <div>
                <span>Actual Purchase Price</span>
                <strong>
                  {qr.actualPrice == null ? "Not recorded" : `BDT ${money(qr.actualPrice)}`}
                </strong>
              </div>
            )}
            {qr.shopName && (
              <div className="wide">
                <span>Sold By</span>
                <strong>{qr.shopName}</strong>
              </div>
            )}
          </div>
        </div>

        {qr.activated && (
          <div className="warranty-section-box">
            <h3 className="section-box-title">
              <Calendar size={16} /> Purchase &amp; Warranty
            </h3>
            <div className="warranty-meta-grid">
              <div className="wide">
                <span>Purchase Date &amp; Time</span>
                <strong>{dateTimeWithDay(qr.purchaseAt || qr.activatedAt)}</strong>
              </div>
              {hasWarranty && (
                <>
                  <div className={qr.warrantyExpiresAt ? undefined : "wide"}>
                    <span>Warranty Duration</span>
                    <strong>{warrantyText(qr.warrantyDuration)}</strong>
                  </div>
                  {qr.warrantyExpiresAt && (
                    <div>
                      <span>Warranty Expiration Date &amp; Time</span>
                      <strong>{dateTimeWithDay(qr.warrantyExpiresAt)}</strong>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {qr.activated && qr.status !== "returned" && qr.warrantyStatus !== "voided" && (
          <PublicClaimPanel qr={qr} />
        )}

        <p className="public-warranty-footnote">
          Verified by WarQ. No account required to view this page.
        </p>
        {onShopkeeperLogin && (
          <div className="public-warranty-actions">
            <button type="button" className="text-button" onClick={onShopkeeperLogin}>
              Shopkeeper? Sign in to manage this QR
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
