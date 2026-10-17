import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ADMIN_ID,
  ADMIN_PASSWORD,
  DEMO_ACCOUNTS,
  DEMO_PASSWORD,
  ensureSeeded,
  reseedEverything,
} from "./seed.js";
import {
  auth,
  adminAuth,
  onAuthStateChanged,
  onDemoAuthEvent,
  signInAdminWithPassword,
  signInDemoUid,
  signOutAdmin,
  signOutUser,
} from "./auth.js";

const STARTED_KEY = "warq.demo.judge.started.v1";
const STEPS_KEY = "warq.demo.judge.steps.v1";
const EVENTS_KEY = "warq.demo.judge.events.v1";

const ROLE_LABELS = {
  admin: "Administrator",
  shopkeeper: "Shopkeeper",
  customer: "Customer",
};

const JUDGE_STEPS = [
  {
    id: "role",
    title: "Start as a shopkeeper",
    detail: "Pick a shopkeeper from the role switcher and land on the dashboard.",
    match: route => route.view === "dashboard" && route.role === "shopkeeper",
  },
  {
    id: "create",
    title: "Create a QR warranty",
    detail: "Requests tab: add a product, customer and warranty, then generate the QR folder.",
    match: route => route.view === "requests" || route.view === "qrs",
  },
  {
    id: "public",
    title: "Open the public warranty page",
    detail: "Scan or open a code: the customer page needs no account and shows the live countdown.",
    match: route => route.scan || route.publicScan,
  },
  {
    id: "claim",
    title: "Submit a warranty claim",
    detail: "Customer portal: scan a code or type it, then submit a claim.",
    match: route => route.view === "claims" || route.claimSubmitted,
  },
  {
    id: "review",
    title: "Review the claim as the shop",
    detail: "Sales / Claims panel or the admin Claims tab: approve, reject or resolve.",
    match: route => route.view === "sales" || route.view === "claims",
  },
  {
    id: "chat",
    title: "Try the Chat Board",
    detail: "Ask the WarQ assistant a warranty question, then open Chat with Admin.",
    match: route => route.view === "chat",
  },
  {
    id: "billing",
    title: "Run the sandbox payment",
    detail: "Subscription tab: choose a plan, pay with a test card. No real money moves.",
    match: route => route.view === "subscription" || route.sandbox,
  },
  {
    id: "admin",
    title: "Check the admin console",
    detail: "Admin: users, orders, pricing, claims, support queue and platform analytics.",
    match: route => route.admin,
  },
];

const TRANSPARENCY_ROWS = [
  ["Sign in / register / logout", "Firebase Auth + email links", "Real forms and validation over PBKDF2-SHA256 account records kept in this browser. Verification and reset codes are generated locally and shown on screen."],
  ["Shop, QR, sales and warranty data", "Express server + PostgreSQL", "The same PostgreSQL schema runs inside the browser on PGlite (Postgres 18 compiled to WebAssembly) and persists to IndexedDB."],
  ["Warranty QR scanning", "Server-issued code looked up in PostgreSQL", "Works two ways: the code is looked up in the local database, and every printed QR also carries a compressed warranty payload plus checksum so the page renders even with no database at all."],
  ["Chat Board assistant", "OpenRouter via the server", "Calls an optional AI proxy when one is configured; otherwise a deterministic local assistant answers from your own data. The reply is labelled with its source."],
  ["Support chat / admin queue", "Server + PostgreSQL polling", "Same conversation model in the local database, refreshed across tabs with a BroadcastChannel instead of long polling."],
  ["Subscriptions, invoices and limits", "bKash / Nagad merchants", "Real plans, limits and invoice history with a sandbox checkout and test cards. Every payment is labelled 'Sandbox – no real payment'."],
  ["Notifications", "Server fan-out", "Same notification records and read state, created locally."],
  ["Report exports (Excel, DOCX, PDF, CSV)", "Server-side Python generators", "Generated in the browser with JSZip and pdf-lib using the same report layout."],
  ["Admin analytics", "Server aggregation", "Computed in the browser from the same seeded dataset."],
];

const SUGGESTED_FIRST = "shopkeeper-1";

function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    void 0;
  }
}

export function readDemoRoute() {
  const hash = window.location.hash || "";
  const path = window.location.pathname || "";
  const route = {
    hash,
    view: "",
    admin: false,
    sandbox: "",
    publicScan: /\/scan\//i.test(path) || /#\/scan\//i.test(hash),
    scan: /\/scan\//i.test(path) || /#\/scan\//i.test(hash),
    role: "",
  };
  if (hash === "#/admin" || hash.startsWith("#/admin/")) {
    route.admin = true;
  }
  const sandbox = hash.match(/^#\/sandbox\/([^/?#]+)/);
  if (sandbox) route.sandbox = decodeURIComponent(sandbox[1]);
  const app = hash.match(/^#\/app\/([a-z]+)/);
  if (app) route.view = app[1];
  return route;
}

function useDemoRoute() {
  const [route, setRoute] = useState(() => readDemoRoute());
  useEffect(() => {
    const update = () => setRoute(readDemoRoute());
    window.addEventListener("hashchange", update);
    window.addEventListener("popstate", update);
    window.addEventListener("warq:demo-route", update);
    return () => {
      window.removeEventListener("hashchange", update);
      window.removeEventListener("popstate", update);
      window.removeEventListener("warq:demo-route", update);
    };
  }, []);
  return route;
}

function useSession() {
  const [state, setState] = useState(() => ({
    user: auth.currentUser,
    admin: adminAuth.currentUser,
  }));
  useEffect(() => {
    const offUser = onAuthStateChanged(auth, user => setState(prev => ({ ...prev, user })));
    const offAdmin = onAuthStateChanged(adminAuth, admin => setState(prev => ({ ...prev, admin })));
    return () => {
      offUser();
      offAdmin();
    };
  }, []);
  return state;
}

function roleOf(session) {
  if (session.admin) return "admin";
  if (!session.user) return "";
  return session.user.uid.startsWith("demo-cust") ? "customer" : "shopkeeper";
}

function currentAccount(session) {
  if (session.admin) return DEMO_ACCOUNTS.find(account => account.role === "admin") || null;
  if (!session.user) return null;
  return DEMO_ACCOUNTS.find(account => account.uid === session.user.uid) || null;
}

export function DemoUi() {
  const route = useDemoRoute();
  const session = useSession();
  const role = roleOf(session);
  const account = currentAccount(session);
  const [panelOpen, setPanelOpen] = useState(false);
  const [showIntro, setShowIntro] = useState(() => !readJson(STARTED_KEY, false));
  const [showTransparency, setShowTransparency] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(null);
  const [events, setEvents] = useState(() => readJson(EVENTS_KEY, []));
  const [done, setDone] = useState(() => readJson(STEPS_KEY, {}));

  useEffect(() => {
    let alive = true;
    ensureSeeded()
      .then(() => {
        if (alive) setReady(true);
      })
      .catch((error) => {
        if (alive) {
          setNotice({
            tone: "error",
            title: "Demo data could not be prepared",
            message: error?.message || "Reload the page to try again.",
          });
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  const completed = useMemo(() => {
    const next = { ...done };
    JUDGE_STEPS.forEach(step => {
      if (!next[step.id] && step.match({ ...route, role })) next[step.id] = true;
    });
    if (role) next.role = true;
    return next;
  }, [done, route, role]);

  useEffect(() => {
    if (JSON.stringify(completed) !== JSON.stringify(done)) {
      setDone(completed);
      writeJson(STEPS_KEY, completed);
    }
  }, [completed, done]);

  useEffect(() => {
    const off = onDemoAuthEvent(event => {
      if (event?.type === "otp") {
        const entry = {
          at: Date.now(),
          title: `Demo ${event.purpose === "password-reset" ? "reset" : "verification"} code for ${event.email}`,
          message: `Code ${event.code}`,
        };
        setEvents(prev => {
          const next = [entry, ...prev].slice(0, 8);
          writeJson(EVENTS_KEY, next);
          return next;
        });
        setNotice({ tone: "info", ...entry });
      }
      if (event?.type === "notice") {
        const entry = { at: Date.now(), title: event.title, message: event.message };
        setEvents(prev => {
          const next = [entry, ...prev].slice(0, 8);
          writeJson(EVENTS_KEY, next);
          return next;
        });
        setNotice({ tone: event.tone || "info", ...entry });
      }
    });
    return off;
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 9000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const startDemo = useCallback(() => {
    writeJson(STARTED_KEY, true);
    setShowIntro(false);
  }, []);

  const switchTo = useCallback(
    async target => {
      setBusy(target.key);
      try {
        await ensureSeeded();
        if (target.role === "admin") {
          await signOutUser();
          await signInAdminWithPassword(ADMIN_ID, ADMIN_PASSWORD);
          window.location.hash = "#/admin";
        } else {
          await signOutAdmin();
          await signInDemoUid(target.uid);
          window.location.hash = target.entry || "#/app/dashboard";
        }
        window.dispatchEvent(new Event("warq:demo-route"));
      } catch (error) {
        setNotice({ tone: "error", title: "Could not switch role", message: error?.message || "Try resetting the demo data." });
      } finally {
        setBusy("");
      }
    },
    [],
  );

  const resetDemo = useCallback(async () => {
    setBusy("reset");
    try {
      await signOutUser();
      await signOutAdmin();
      await reseedEverything();
      writeJson(STEPS_KEY, {});
      writeJson(EVENTS_KEY, []);
      writeJson(STARTED_KEY, false);
      window.location.hash = "#/";
      window.location.reload();
    } catch (error) {
      setNotice({ tone: "error", title: "Reset failed", message: error?.message || "Could not reset the demo data." });
      setBusy("");
    }
  }, []);

  const total = JUDGE_STEPS.length;
  const doneCount = JUDGE_STEPS.filter(step => completed[step.id]).length;

  return (
    <>
      <style>{DEMO_UI_CSS}</style>

      {notice && (
        <div className="wq-toast" role="status" data-tone={notice.tone}>
          <strong>{notice.title}</strong>
          <span>{notice.message}</span>
        </div>
      )}

      {showIntro && !role && (
        <div className="wq-gate" role="dialog" aria-modal="true" aria-label="Start the WarQ demo">
          <div className="wq-gate-card">
            <p className="wq-kicker">WarQ live demo</p>
            <h1>WarQ turns any product into a verifiable digital warranty.</h1>
            <p className="wq-lead">
              Shops issue a QR sticker per product, record the sale in seconds, and customers open the
              warranty page by scanning with no app and no account. This is a fully working demo — every
              record lives in your browser, nothing is charged and no real customer data is used.
            </p>
            <div className="wq-gate-actions">
              {DEMO_ACCOUNTS.filter(item => item.key === SUGGESTED_FIRST).map(item => (
                <button
                  key={item.key}
                  className="wq-btn-primary"
                  disabled={Boolean(busy) || !ready}
                  onClick={async () => {
                    await switchTo(item);
                    startDemo();
                  }}
                >
                  {ready ? "Start demo as a shopkeeper" : "Preparing demo data…"}
                </button>
              ))}
              <button className="wq-btn-ghost" onClick={startDemo} disabled={Boolean(busy) || !ready}>
                Skip and explore the sign-in page
              </button>
            </div>
            <p className="wq-fineprint">
              Seeded logins: shopkeepers <code>rahman@warq.demo</code>, <code>ctg@warq.demo</code>,{" "}
              <code>sylhet@warq.demo</code>, customers <code>nusrat@warq.demo</code>,{" "}
              <code>tanvir@warq.demo</code> — password <code>{DEMO_PASSWORD}</code>. Administrator{" "}
              <code>{ADMIN_ID}</code> — password <code>{ADMIN_PASSWORD}</code>.
            </p>
          </div>
        </div>
      )}

      {panelOpen && (
        <div className="wq-scrim" onClick={() => setPanelOpen(false)} aria-hidden="true" />
      )}

      <aside className={panelOpen ? "wq-panel is-open" : "wq-panel"} aria-hidden={!panelOpen}>
        <header className="wq-panel-head">
          <div>
            <p className="wq-kicker">Judge guide</p>
            <h2>{doneCount} of {total} steps done</h2>
          </div>
          <button className="wq-close" onClick={() => setPanelOpen(false)} aria-label="Close judge guide">
            ×
          </button>
        </header>

        <section className="wq-block">
          <h3>Current role</h3>
          <p className="wq-role">
            {account ? (
              <>
                <span className={`wq-chip wq-chip-${account.role}`}>{ROLE_LABELS[account.role]}</span>
                {account.label}
              </>
            ) : (
              <span>Not signed in</span>
            )}
          </p>
          <p className="wq-hint">Switching role does not require signing out manually.</p>
          <div className="wq-role-grid">
            {DEMO_ACCOUNTS.map(item => {
              const active = account?.key === item.key;
              return (
                <button
                  key={item.key}
                  className={active ? "wq-role-btn is-active" : "wq-role-btn"}
                  disabled={Boolean(busy) || !ready || active}
                  onClick={() => switchTo(item)}
                  title={item.description}
                >
                  {active ? "● " : ""}
                  {item.label}
                </button>
              );
            })}
          </div>
        </section>

        <section className="wq-block">
          <h3>Demo checklist</h3>
          <ol className="wq-steps">
            {JUDGE_STEPS.map(step => (
              <li key={step.id} className={completed[step.id] ? "is-done" : ""}>
                <span className="wq-tick" aria-hidden="true">{completed[step.id] ? "✓" : ""}</span>
                <div>
                  <strong>{step.title}</strong>
                  <small>{step.detail}</small>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="wq-block">
          <h3>Demo controls</h3>
          <div className="wq-actions">
            <button className="wq-btn-ghost" onClick={() => setShowTransparency(true)}>
              Production vs Demo
            </button>
            <button className="wq-btn-danger" onClick={resetDemo} disabled={busy === "reset"}>
              {busy === "reset" ? "Resetting…" : "Reset demo data"}
            </button>
            <button
              className="wq-btn-ghost"
              onClick={() => {
                writeJson(STEPS_KEY, {});
                setDone({});
              }}
            >
              Clear checklist
            </button>
          </div>
          <p className="wq-hint">
            Reset rebuilds the seeded shops, customers, warranties, claims and chat history. It never leaves
            your browser.
          </p>
        </section>

        {events.length > 0 && (
          <section className="wq-block">
            <h3>Demo-only messages</h3>
            <ul className="wq-events">
              {events.map((event, index) => (
                <li key={`${event.at}-${index}`}>
                  <strong>{event.title}</strong>
                  <span>{event.message}</span>
                </li>
              ))}
            </ul>
            <p className="wq-hint">
              Real WarQ sends these by email or SMS. Here they are surfaced on screen and clearly labelled
              demo-only.
            </p>
          </section>
        )}
      </aside>

      <button
        className="wq-launcher"
        onClick={() => setPanelOpen(open => !open)}
        aria-expanded={panelOpen}
        aria-label="Open the judge guide"
      >
        <span className="wq-launcher-count">{doneCount}/{total}</span>
        <span className="wq-launcher-text">Judge guide</span>
      </button>

      {showTransparency && (
        <div className="wq-modal" role="dialog" aria-modal="true" aria-label="Production versus demo">
          <div className="wq-modal-card">
            <header>
              <h2>Production vs Demo</h2>
              <button className="wq-close" onClick={() => setShowTransparency(false)} aria-label="Close">
                ×
              </button>
            </header>
            <p className="wq-lead">
              WarQ in production runs an Express API, PostgreSQL and Firebase Auth. This demo keeps the same
              interface, flows and database schema but replaces the server with code that runs entirely in
              your browser. Nothing here is billed and nothing leaves this device.
            </p>
            <div className="wq-table-wrap">
              <table className="wq-table">
                <thead>
                  <tr>
                    <th>Feature</th>
                    <th>Production</th>
                    <th>This demo</th>
                  </tr>
                </thead>
                <tbody>
                  {TRANSPARENCY_ROWS.map(row => (
                    <tr key={row[0]}>
                      <td>{row[0]}</td>
                      <td>{row[1]}</td>
                      <td>{row[2]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <footer>
              <button className="wq-btn-primary" onClick={() => setShowTransparency(false)}>
                Back to the demo
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}

const DEMO_UI_CSS = `
.wq-launcher{position:fixed;right:16px;bottom:88px;z-index:60;display:inline-flex;align-items:center;gap:8px;padding:10px 14px;border-radius:999px;border:1px solid #1f2a44;background:#0b1220;color:#e6edf7;font:600 14px/1 system-ui,Segoe UI,Roboto,sans-serif;box-shadow:0 10px 30px rgba(2,8,20,.45);cursor:pointer}
.wq-launcher:hover{background:#132041}
.wq-launcher-count{display:inline-flex;align-items:center;justify-content:center;min-width:34px;height:22px;border-radius:999px;background:#1d4ed8;color:#fff;font-size:12px;padding:0 6px}
.wq-panel{position:fixed;top:0;right:0;bottom:0;width:min(420px,100vw);z-index:70;background:#0b1220;color:#e6edf7;border-left:1px solid #1f2a44;transform:translateX(102%);transition:transform .22s ease;overflow-y:auto;padding:18px 18px 40px;font:400 14px/1.5 system-ui,Segoe UI,Roboto,sans-serif}
.wq-panel.is-open{transform:none}
.wq-panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.wq-panel h2{margin:2px 0 0;font-size:18px}
.wq-panel h3{margin:0 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:.08em;color:#8aa2c8}
.wq-kicker{margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.14em;color:#7dd3fc}
.wq-close{background:transparent;border:1px solid #26344f;color:#e6edf7;border-radius:8px;width:32px;height:32px;font-size:20px;line-height:1;cursor:pointer}
.wq-block{margin-top:20px;padding-top:16px;border-top:1px solid #1b2740}
.wq-role{margin:0 0 6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.wq-chip{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600;background:#1e293b;color:#c7d2fe;border:1px solid #334155}
.wq-chip-admin{background:#3b0764;color:#f5d0fe;border-color:#6b21a8}
.wq-chip-customer{background:#064e3b;color:#a7f3d0;border-color:#047857}
.wq-hint{margin:8px 0 0;font-size:12px;color:#8aa2c8}
.wq-role-grid{display:grid;gap:8px;margin-top:10px}
.wq-role-btn{text-align:left;padding:10px 12px;border-radius:10px;border:1px solid #26344f;background:#111c33;color:#e6edf7;font-size:13px;cursor:pointer}
.wq-role-btn:hover:not(:disabled){border-color:#3b82f6;background:#152341}
.wq-role-btn:disabled{opacity:.6;cursor:default}
.wq-role-btn.is-active{border-color:#22c55e;background:#0f2a1d}
.wq-steps{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.wq-steps li{display:flex;gap:10px;align-items:flex-start;padding:10px;border-radius:10px;background:#0f1a2e;border:1px solid #1b2740}
.wq-steps li.is-done{background:#0f2a1d;border-color:#1c6b45}
.wq-steps strong{display:block;font-size:13px}
.wq-steps small{display:block;color:#8aa2c8;font-size:12px;margin-top:2px}
.wq-tick{width:20px;height:20px;flex:0 0 20px;border-radius:6px;border:1px solid #3b4a68;display:inline-flex;align-items:center;justify-content:center;font-size:13px;color:#4ade80}
.wq-steps li.is-done .wq-tick{border-color:#22c55e}
.wq-actions{display:flex;flex-wrap:wrap;gap:8px}
.wq-btn-primary,.wq-btn-ghost,.wq-btn-danger{border-radius:10px;padding:10px 14px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid transparent}
.wq-btn-primary{background:#2563eb;color:#fff}
.wq-btn-primary:hover{background:#1d4ed8}
.wq-btn-ghost{background:transparent;border-color:#26344f;color:#e6edf7}
.wq-btn-ghost:hover{border-color:#3b82f6}
.wq-btn-danger{background:#7f1d1d;color:#fee2e2;border-color:#b91c1c}
.wq-btn-danger:hover{background:#991b1b}
.wq-events{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.wq-events li{background:#0f1a2e;border:1px solid #1b2740;border-radius:8px;padding:8px 10px;font-size:12px}
.wq-events strong{display:block;color:#fcd34d}
.wq-scrim{position:fixed;inset:0;background:rgba(3,7,18,.55);z-index:65}
.wq-toast{position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:90;max-width:min(560px,92vw);background:#0b1220;color:#e6edf7;border:1px solid #26344f;border-left:4px solid #38bdf8;border-radius:10px;padding:10px 14px;display:grid;gap:2px;font:400 13px/1.45 system-ui,Segoe UI,Roboto,sans-serif;box-shadow:0 12px 34px rgba(2,8,20,.5)}
.wq-toast[data-tone="success"]{border-left-color:#22c55e}
.wq-toast[data-tone="error"]{border-left-color:#ef4444}
.wq-toast[data-tone="info"]{border-left-color:#f59e0b}
.wq-gate{position:fixed;inset:0;z-index:80;background:radial-gradient(1200px 600px at 20% 0%,#16224a 0%,#070c18 60%);display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto}
.wq-gate-card{max-width:760px;width:100%;background:#0b1220;border:1px solid #1f2a44;border-radius:18px;padding:26px;color:#e6edf7;font:400 15px/1.6 system-ui,Segoe UI,Roboto,sans-serif;box-shadow:0 24px 60px rgba(2,8,20,.55)}
.wq-gate-card h1{margin:6px 0 12px;font-size:clamp(22px,4vw,32px);line-height:1.2}
.wq-lead{margin:0 0 14px;color:#c7d2fe}
.wq-gate-actions{display:flex;flex-wrap:wrap;gap:10px;margin:16px 0}
.wq-fineprint{font-size:12px;color:#8aa2c8;margin:0}
.wq-fineprint code{background:#111c33;border:1px solid #26344f;border-radius:6px;padding:1px 5px;color:#e6edf7}
.wq-modal{position:fixed;inset:0;z-index:95;background:rgba(3,7,18,.7);display:flex;align-items:center;justify-content:center;padding:18px;overflow-y:auto}
.wq-modal-card{max-width:960px;width:100%;background:#0b1220;border:1px solid #1f2a44;border-radius:16px;padding:22px;color:#e6edf7;font:400 14px/1.55 system-ui,Segoe UI,Roboto,sans-serif;max-height:90vh;overflow-y:auto}
.wq-modal-card header{display:flex;align-items:center;justify-content:space-between;gap:12px}
.wq-modal-card h2{margin:0;font-size:20px}
.wq-table-wrap{overflow-x:auto;border:1px solid #1b2740;border-radius:10px}
.wq-table{width:100%;border-collapse:collapse;font-size:13px;min-width:720px}
.wq-table th,.wq-table td{text-align:left;padding:10px 12px;border-bottom:1px solid #1b2740;vertical-align:top}
.wq-table th{background:#0f1a2e;color:#8aa2c8;text-transform:uppercase;letter-spacing:.06em;font-size:11px}
.wq-table tr:last-child td{border-bottom:none}
.wq-modal-card footer{margin-top:16px;display:flex;justify-content:flex-end}
@media (max-width:520px){
  .wq-launcher{bottom:78px;right:10px;padding:8px 12px}
  .wq-launcher-text{display:none}
  .wq-gate-card{padding:18px}
}
`;

let mounted = false;

export function mountDemoUi() {
  if (mounted || typeof document === "undefined") return;
  mounted = true;
  const host = document.createElement("div");
  host.id = "warq-demo-ui";
  document.body.appendChild(host);
  createRoot(host).render(<DemoUi />);
}
