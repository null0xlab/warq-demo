import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { bindRealtimeSync } from "./realtime";
import { decodeRecord } from "./demo/qr-payload.js";
import { listCustomerWarranties, lookupWarrantyByCode } from "./demo/customer.js";

const CATEGORIES = [
  ["repair", "Repair"],
  ["replacement", "Replacement"],
  ["refund", "Refund"],
  ["other", "Other"],
];

const STATE_LABELS = {
  active: "Active",
  expiring: "Expiring soon",
  expired: "Expired",
  voided: "Warranty voided",
  no_warranty: "No warranty",
  pending_activation: "Not activated",
  unknown: "Unknown",
};

const CLAIM_STATUS_STEPS = ["submitted", "reviewing", "approved", "resolved"];

function durationText(duration) {
  if (!duration) return "No warranty";
  const labels = [
    ["months", "Month"],
    ["days", "Day"],
    ["hours", "Hour"],
    ["minutes", "Minute"],
    ["seconds", "Second"],
  ];
  const parts = labels
    .filter(([key]) => duration[key])
    .map(([key, label]) => `${duration[key]} ${label}${duration[key] === 1 ? "" : "s"}`);
  return parts.length ? `${parts.join(" ")} warranty` : "No warranty";
}

function dateText(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function countdownText(expiresAt, nowMs) {
  if (!expiresAt) return "";
  const remaining = new Date(expiresAt).getTime() - nowMs;
  if (remaining <= 0) return "Expired";
  const days = Math.floor(remaining / 86400000);
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"} left`;
  const hours = Math.floor(remaining / 3600000);
  if (hours >= 1) return `${hours} hour${hours === 1 ? "" : "s"} left`;
  const minutes = Math.max(1, Math.floor(remaining / 60000));
  return `${minutes} minute${minutes === 1 ? "" : "s"} left`;
}

function stateOf(warranty, nowMs) {
  if (!warranty) return "unknown";
  if (warranty.state === "active" && warranty.warrantyExpiresAt) {
    const remaining = new Date(warranty.warrantyExpiresAt).getTime() - nowMs;
    if (remaining > 0 && remaining < 7 * 86400000) return "expiring";
  }
  return warranty.state;
}

function parseScannedText(text) {
  const raw = String(text || "").trim();
  const payloadMatch = raw.match(/[?&]d=([^&#\s]+)/);
  if (payloadMatch) return { payload: decodeURIComponent(payloadMatch[1]) };
  const pathMatch = raw.match(/\/scan\/([^/?#\s]+)/i);
  if (pathMatch) return { code: decodeURIComponent(pathMatch[1]).toUpperCase() };
  const hashMatch = raw.match(/#\/scan\/([^/?#\s]+)/);
  if (hashMatch) return { code: decodeURIComponent(hashMatch[1]).toUpperCase() };
  if (/^WQ-[A-Z0-9-]+$/i.test(raw)) return { code: raw.toUpperCase() };
  return { code: raw.toUpperCase() };
}

function WarrantyCard({ warranty, nowMs, onClaim, onOpen }) {
  const state = stateOf(warranty, nowMs);
  const canClaim = state === "active" || state === "expiring";
  return (
    <article className="cp-card">
      <header>
        <div>
          <p className="cp-shop">{warranty.shopName || "WarQ partner shop"}</p>
          <h3>{warranty.productName}</h3>
          {warranty.productModel ? <p className="cp-model">{warranty.productModel}</p> : null}
        </div>
        <span className={`cp-badge cp-badge-${state}`}>{STATE_LABELS[state] || state}</span>
      </header>
      <dl className="cp-facts">
        <div>
          <dt>Code</dt>
          <dd>{warranty.code}</dd>
        </div>
        <div>
          <dt>Purchased</dt>
          <dd>{dateText(warranty.soldAt)}</dd>
        </div>
        <div>
          <dt>Coverage</dt>
          <dd>{durationText(warranty.warrantyDuration)}</dd>
        </div>
        <div>
          <dt>Expires</dt>
          <dd>
            {dateText(warranty.warrantyExpiresAt)}
            {warranty.warrantyExpiresAt && state !== "expired" && state !== "voided"
              ? ` · ${countdownText(warranty.warrantyExpiresAt, nowMs)}`
              : ""}
          </dd>
        </div>
      </dl>
      <div className="cp-card-actions">
        <button className="cp-btn-ghost" onClick={() => onOpen(warranty.code)}>
          Open public page
        </button>
        <button className="cp-btn" onClick={() => onClaim(warranty)} disabled={!canClaim}>
          {canClaim ? "Submit claim" : "Claim unavailable"}
        </button>
      </div>
    </article>
  );
}

export default function CustomerPortal({ user, onLogout }) {
  const [tab, setTab] = useState("warranties");
  const [warranties, setWarranties] = useState([]);
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [manualCode, setManualCode] = useState("");
  const [scanned, setScanned] = useState(null);
  const [scanError, setScanError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [claimForm, setClaimForm] = useState({ category: "repair", description: "" });
  const [openClaim, setOpenClaim] = useState(null);
  const scannerRef = useRef(null);
  const scannerHostRef = useRef(null);

  const refresh = useCallback(async () => {
    const identity = { uid: user.uid, email: user.email };
    const [nextWarranties, nextClaims] = await Promise.all([
      listCustomerWarranties(identity.email),
      api.getClaims().then(result => result?.claims || []),
    ]);
    setWarranties(nextWarranties);
    setClaims(nextClaims);
  }, [user.uid, user.email]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    refresh()
      .catch(error => {
        if (active) setToast({ tone: "error", message: error?.message || "Could not load your warranties." });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 7000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    return bindRealtimeSync({ onSync: refresh, intervalMs: 20000, minGapMs: 4000 });
  }, [refresh]);

  useEffect(() => {
    return () => {
      const instance = scannerRef.current;
      scannerRef.current = null;
      if (instance) instance.stop().catch(() => {});
    };
  }, []);

  const stopScanner = useCallback(async () => {
    const instance = scannerRef.current;
    scannerRef.current = null;
    setScanning(false);
    if (instance) {
      try {
        await instance.stop();
        instance.clear();
      } catch {
        void 0;
      }
    }
  }, []);

  const resolveCode = useCallback(async input => {
    const parsed = typeof input === "string" ? parseScannedText(input) : input;
    if (parsed.payload) {
      try {
        const record = await decodeRecord(parsed.payload);
        if (record?.code) {
          const local = await lookupWarrantyByCode(record.code);
          return local || { ...record, state: record.warrantyStatus || (record.activated ? "active" : "pending_activation") };
        }
      } catch {
        void 0;
      }
    }
    const code = String(parsed.code || "").trim().toUpperCase();
    if (!code) throw new Error("Enter or scan a WarQ code.");
    const local = await lookupWarrantyByCode(code);
    if (local) return local;
    const publicResult = await api.getPublicQr(code);
    const qr = publicResult?.qr;
    if (!qr) throw new Error(`No warranty found for ${code}.`);
    return {
      code: qr.code,
      productName: qr.productName || "",
      productModel: qr.productModel || "",
      brandName: qr.brandName || "",
      shopName: qr.shopName || "",
      status: qr.status || "generated",
      state: qr.warrantyStatus || "unknown",
      activated: Boolean(qr.activated),
      soldAt: qr.purchaseAt || qr.activatedAt || null,
      warrantyExpiresAt: qr.warrantyExpiresAt || null,
      warrantyDuration: qr.warrantyDuration || null,
      actualPrice: qr.actualPrice ?? null,
      customerName: user.name || "",
      customerPhone: user.mobile || "",
      customerEmail: user.email || "",
    };
  }, [user.name, user.mobile, user.email]);

  const handleScanned = useCallback(
    async text => {
      try {
        const warranty = await resolveCode(text);
        setScanned(warranty);
        setScanError("");
        setClaimForm({ category: "repair", description: "" });
        await stopScanner();
      } catch (error) {
        setScanError(error?.message || "That code could not be read.");
      }
    },
    [resolveCode, stopScanner],
  );

  const startScanner = useCallback(async () => {
    setScanError("");
    setScanned(null);
    setScanning(true);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const instance = new Html5Qrcode(scannerHostRef.current, { verbose: false });
      scannerRef.current = instance;
      await instance.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        decodedText => {
          handleScanned(decodedText);
        },
        () => {},
      );
    } catch (error) {
      setScanning(false);
      setScanError(
        error?.message?.includes("permission") || error?.name === "NotAllowedError"
          ? "Camera access was blocked. Allow the camera or type the code instead."
          : "Could not start the camera on this device. Type the code instead.",
      );
    }
  }, [handleScanned]);

  const submitClaim = useCallback(async () => {
    const target = scanned || openClaim;
    if (!target) return;
    if (!claimForm.description.trim() || claimForm.description.trim().length < 10) {
      setToast({ tone: "error", message: "Describe the problem in at least 10 characters." });
      return;
    }
    setBusy("claim");
    try {
      await api.submitClaim({
        qrCode: target.code,
        category: claimForm.category,
        description: claimForm.description.trim(),
        customerName: user.name || target.customerName || "",
        customerPhone: user.mobile || target.customerPhone || "",
        customerEmail: user.email || target.customerEmail || "",
      });
      await refresh();
      setScanned(null);
      setOpenClaim(null);
      setClaimForm({ category: "repair", description: "" });
      setManualCode("");
      setTab("claims");
      setToast({ tone: "success", message: `Claim submitted for ${target.code}. Track it in My claims.` });
    } catch (error) {
      setToast({ tone: "error", message: error?.message || "Could not submit the claim." });
    } finally {
      setBusy("");
    }
  }, [scanned, openClaim, claimForm, user, refresh]);

  const claimTarget = scanned || openClaim;

  const stats = useMemo(() => {
    const active = warranties.filter(item => ["active", "expiring"].includes(stateOf(item, nowMs))).length;
    const expired = warranties.filter(item => stateOf(item, nowMs) === "expired").length;
    const openClaims = claims.filter(claim => ["submitted", "reviewing"].includes(claim.status)).length;
    return { active, expired, openClaims };
  }, [warranties, claims, nowMs]);

  const renderWarranties = () => {
    if (loading) return <p className="cp-empty">Loading your warranties…</p>;
    if (!warranties.length) {
      return (
        <div className="cp-empty">
          <p>No warranties are linked to {user.email} yet.</p>
          <p>Scan a WarQ sticker, or ask your shop to record the sale with this email address.</p>
          <button className="cp-btn" onClick={() => setTab("scan")}>
            Scan a code
          </button>
        </div>
      );
    }
    return (
      <div className="cp-list">
        {warranties.map(warranty => (
          <WarrantyCard
            key={warranty.code}
            warranty={warranty}
            nowMs={nowMs}
            onClaim={target => {
              setOpenClaim(target);
              setScanned(null);
              setClaimForm({ category: "repair", description: "" });
            }}
            onOpen={code => {
              window.open(`${window.location.origin}${window.location.pathname}#/scan/${encodeURIComponent(code)}`, "_blank", "noopener");
            }}
          />
        ))}
      </div>
    );
  };

  const renderScan = () => (
    <div className="cp-scan">
      <div className="cp-panel">
        <h3>Scan a warranty sticker</h3>
        <p className="cp-hint">
          Use the camera, or type the code printed under the QR. The page works even when the shop&apos;s
          database is not reachable because every QR carries its own signed payload.
        </p>
        <div className="cp-scan-actions">
          {scanning ? (
            <button className="cp-btn-ghost" onClick={stopScanner}>
              Stop camera
            </button>
          ) : (
            <button className="cp-btn" onClick={startScanner}>
              Start camera
            </button>
          )}
        </div>
        <div ref={scannerHostRef} className={scanning ? "cp-scanner is-on" : "cp-scanner"} />
        {scanError ? <p className="cp-error">{scanError}</p> : null}
        <form
          className="cp-manual"
          onSubmit={event => {
            event.preventDefault();
            handleScanned(manualCode);
          }}
        >
          <label htmlFor="cp-manual-code">WarQ code</label>
          <div className="cp-manual-row">
            <input
              id="cp-manual-code"
              value={manualCode}
              onChange={event => setManualCode(event.target.value)}
              placeholder="WQ-DHK-P1-0001"
              autoComplete="off"
            />
            <button className="cp-btn" type="submit">
              Look up
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  const renderClaims = () => {
    if (!claims.length) {
      return (
        <div className="cp-empty">
          <p>You have not submitted any claims yet.</p>
          <button className="cp-btn" onClick={() => setTab("scan")}>
            Submit a claim
          </button>
        </div>
      );
    }
    return (
      <div className="cp-list">
        {claims.map(claim => (
          <article className="cp-card" key={claim.id}>
            <header>
              <div>
                <p className="cp-shop">{claim.qr?.shopName || "WarQ partner shop"}</p>
                <h3>{claim.qr?.productName || claim.qrCode}</h3>
                <p className="cp-model">
                  Claim {claim.code} · {claim.category}
                </p>
              </div>
              <span className={`cp-badge cp-badge-claim-${claim.status}`}>{claim.status}</span>
            </header>
            <p className="cp-claim-text">{claim.description}</p>
            {claim.resolutionNote ? <p className="cp-claim-note">{claim.resolutionNote}</p> : null}
            <ol className="cp-timeline">
              {(claim.timeline || []).map((entry, index) => (
                <li key={`${claim.id}-${index}`}>
                  <span>{entry.status}</span>
                  <small>{dateText(entry.at)}{entry.note ? ` · ${entry.note}` : ""}</small>
                </li>
              ))}
              {claim.status === "rejected" ? (
                <li className="is-rejected">
                  <span>rejected</span>
                  <small>Not covered by the warranty policy.</small>
                </li>
              ) : null}
            </ol>
          </article>
        ))}
      </div>
    );
  };

  return (
    <main className="cp-shell">
      <style>{CUSTOMER_PORTAL_CSS}</style>
      <header className="cp-header">
        <div className="cp-brand">
          <strong>WarQ</strong>
          <span>Customer portal</span>
        </div>
        <div className="cp-identity">
          <div>
            <strong>{user.name || "Customer"}</strong>
            <small>{user.email}</small>
          </div>
          <button className="cp-btn-ghost" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </header>

      {toast ? <div className={`cp-toast cp-toast-${toast.tone}`}>{toast.message}</div> : null}

      <section className="cp-stats">
        <div>
          <strong>{warranties.length}</strong>
          <span>Warranties</span>
        </div>
        <div>
          <strong>{stats.active}</strong>
          <span>In force</span>
        </div>
        <div>
          <strong>{stats.expired}</strong>
          <span>Expired</span>
        </div>
        <div>
          <strong>{stats.openClaims}</strong>
          <span>Open claims</span>
        </div>
      </section>

      <nav className="cp-tabs" aria-label="Customer portal sections">
        {[
          ["warranties", "My warranties"],
          ["scan", "Scan & claim"],
          ["claims", "My claims"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "is-active" : ""}
            onClick={() => setTab(id)}
            aria-current={tab === id ? "page" : undefined}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="cp-content">
        {tab === "warranties" ? renderWarranties() : null}
        {tab === "scan" ? renderScan() : null}
        {tab === "claims" ? renderClaims() : null}
      </div>

      {claimTarget ? (
        <div className="cp-modal" role="dialog" aria-modal="true" aria-label="Submit a warranty claim">
          <div className="cp-modal-card">
            <header>
              <div>
                <h2>Warranty claim</h2>
                <p className="cp-hint">
                  {claimTarget.productName} · {claimTarget.code} · {claimTarget.shopName || "shop"}
                </p>
              </div>
              <button
                className="cp-close"
                aria-label="Close"
                onClick={() => {
                  setOpenClaim(null);
                  setScanned(null);
                }}
              >
                ×
              </button>
            </header>
            <label htmlFor="cp-claim-category">Problem type</label>
            <select
              id="cp-claim-category"
              value={claimForm.category}
              onChange={event => setClaimForm({ ...claimForm, category: event.target.value })}
            >
              {CATEGORIES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <label htmlFor="cp-claim-description">What went wrong?</label>
            <textarea
              id="cp-claim-description"
              rows={5}
              value={claimForm.description}
              onChange={event => setClaimForm({ ...claimForm, description: event.target.value })}
              placeholder="Describe the fault, when it started, and how the product is used."
            />
            <dl className="cp-facts">
              <div>
                <dt>Name</dt>
                <dd>{user.name || "—"}</dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{user.mobile || "—"}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{user.email || "—"}</dd>
              </div>
            </dl>
            <footer>
              <button
                className="cp-btn-ghost"
                onClick={() => {
                  setOpenClaim(null);
                  setScanned(null);
                }}
              >
                Cancel
              </button>
              <button className="cp-btn" onClick={submitClaim} disabled={busy === "claim"}>
                {busy === "claim" ? "Submitting…" : "Submit claim"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      <footer className="cp-footer">
        Warranty records are served from this demo browser session. No real customer data is used.
      </footer>
    </main>
  );
}

const CUSTOMER_PORTAL_CSS = `
.cp-shell{min-height:100vh;background:#f5f7fb;color:#0f172a;font:400 15px/1.5 system-ui,Segoe UI,Roboto,sans-serif;padding-bottom:32px}
.cp-header{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;padding:16px 20px;background:#0b1220;color:#e6edf7}
.cp-brand strong{font-size:20px;letter-spacing:.02em}
.cp-brand span{display:block;font-size:12px;color:#93a7c9;text-transform:uppercase;letter-spacing:.14em}
.cp-identity{display:flex;align-items:center;gap:12px}
.cp-identity strong{display:block;font-size:14px}
.cp-identity small{display:block;font-size:12px;color:#93a7c9}
.cp-content{max-width:1040px;margin:0 auto;padding:16px 20px 0}
.cp-stats{max-width:1040px;margin:18px auto 0;padding:0 20px;display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px}
.cp-stats>div{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px}
.cp-stats strong{display:block;font-size:22px}
.cp-stats span{display:block;font-size:12px;color:#64748b}
.cp-tabs{max-width:1040px;margin:18px auto 0;padding:0 20px;display:flex;gap:8px;flex-wrap:wrap}
.cp-tabs button{border:1px solid #d8e0ea;background:#fff;color:#334155;border-radius:999px;padding:9px 16px;font-size:14px;font-weight:600;cursor:pointer}
.cp-tabs button.is-active{background:#1d4ed8;border-color:#1d4ed8;color:#fff}
.cp-list{display:grid;gap:14px}
.cp-card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:16px;box-shadow:0 1px 2px rgba(15,23,42,.04)}
.cp-card>header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.cp-card h3{margin:2px 0 0;font-size:17px}
.cp-shop{margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#64748b}
.cp-model{margin:2px 0 0;font-size:13px;color:#64748b}
.cp-badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:700;white-space:nowrap;background:#e2e8f0;color:#334155}
.cp-badge-active{background:#dcfce7;color:#166534}
.cp-badge-expiring{background:#fef3c7;color:#92400e}
.cp-badge-expired{background:#fee2e2;color:#991b1b}
.cp-badge-voided{background:#e2e8f0;color:#475569}
.cp-badge-no_warranty,.cp-badge-pending_activation{background:#e0e7ff;color:#3730a3}
.cp-badge-claim-submitted{background:#e0e7ff;color:#3730a3}
.cp-badge-claim-reviewing{background:#fef3c7;color:#92400e}
.cp-badge-claim-approved,.cp-badge-claim-resolved{background:#dcfce7;color:#166534}
.cp-badge-claim-rejected{background:#fee2e2;color:#991b1b}
.cp-facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px 16px;margin:14px 0 0}
.cp-facts dt{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b}
.cp-facts dd{margin:2px 0 0;font-size:14px}
.cp-card-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
.cp-btn{background:#1d4ed8;color:#fff;border:1px solid #1d4ed8;border-radius:10px;padding:10px 16px;font-size:14px;font-weight:600;cursor:pointer}
.cp-btn:hover:not(:disabled){background:#1e40af}
.cp-btn:disabled{opacity:.55;cursor:default}
.cp-btn-ghost{background:transparent;border:1px solid #cbd5e1;color:#1e293b;border-radius:10px;padding:10px 16px;font-size:14px;font-weight:600;cursor:pointer}
.cp-btn-ghost:hover{border-color:#1d4ed8;color:#1d4ed8}
.cp-empty{background:#fff;border:1px dashed #cbd5e1;border-radius:14px;padding:22px;display:grid;gap:10px;justify-items:start;color:#475569}
.cp-panel{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:18px}
.cp-panel h3{margin:0 0 6px}
.cp-hint{margin:0;color:#64748b;font-size:13px}
.cp-scan-actions{margin:14px 0}
.cp-scanner{display:none;margin:12px 0;border-radius:12px;overflow:hidden}
.cp-scanner.is-on{display:block;min-height:240px;background:#0b1220}
.cp-manual{margin-top:16px;display:grid;gap:6px}
.cp-manual label{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#64748b}
.cp-manual-row{display:flex;gap:8px;flex-wrap:wrap}
.cp-manual input{flex:1 1 200px;padding:11px 12px;border:1px solid #cbd5e1;border-radius:10px;font-size:14px}
.cp-error{margin:12px 0 0;color:#b91c1c;font-size:14px}
.cp-claim-text{margin:12px 0 0;font-size:14px}
.cp-claim-note{margin:8px 0 0;font-size:13px;color:#166534}
.cp-timeline{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:6px}
.cp-timeline li{display:grid;gap:2px;padding-left:12px;border-left:2px solid #e2e8f0}
.cp-timeline li span{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#1d4ed8}
.cp-timeline li small{color:#64748b;font-size:12px}
.cp-timeline li.is-rejected span{color:#b91c1c}
.cp-toast{position:sticky;top:0;z-index:20;margin:12px auto 0;max-width:1040px;padding:12px 16px;border-radius:10px;font-size:14px;font-weight:600}
.cp-toast-success{background:#dcfce7;color:#166534}
.cp-toast-error{background:#fee2e2;color:#991b1b}
.cp-modal{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:40;display:flex;align-items:center;justify-content:center;padding:18px;overflow-y:auto}
.cp-modal-card{background:#fff;border-radius:16px;padding:20px;max-width:560px;width:100%;display:grid;gap:8px;max-height:92vh;overflow-y:auto}
.cp-modal-card header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.cp-modal-card h2{margin:0;font-size:20px}
.cp-modal-card label{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin-top:6px}
.cp-modal-card select,.cp-modal-card textarea{padding:11px 12px;border:1px solid #cbd5e1;border-radius:10px;font-size:14px;font-family:inherit}
.cp-modal-card footer{display:flex;justify-content:flex-end;gap:10px;margin-top:10px}
.cp-close{background:transparent;border:1px solid #cbd5e1;border-radius:8px;width:32px;height:32px;font-size:20px;line-height:1;cursor:pointer}
.cp-footer{max-width:1040px;margin:22px auto 0;padding:0 20px;color:#64748b;font-size:12px}
@media (max-width:520px){
  .cp-header{padding:14px 14px}
  .cp-content,.cp-stats,.cp-tabs,.cp-footer{padding-left:14px;padding-right:14px}
  .cp-identity{gap:8px}
}
`;
