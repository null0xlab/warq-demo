# WarQ Demo — Production → Demo Mapping

This document maps every server-dependent capability of the production WarQ
application to the replacement used in the static judge demo. It exists so a
reviewer can see, at a glance, which behaviours are **identical**, which are
**simulated**, and where fidelity is intentionally reduced.

Legend for **Fidelity**:

- **Identical** — same code path, same data model, same UX outcome; only the host changes.
- **Equivalent** — same behaviour and schema, reimplemented in the browser instead of the server.
- **Simulated** — a deliberate stand-in that keeps the flow honest and visibly labelled.
- **Browser-only** — no production counterpart; added so the demo can stand alone (disclosed as an extension).
- **Not replicated** — cannot run without paid infrastructure or a real merchant account.

| Feature | Current dependency | Why it needs a server | Demo replacement | Fidelity |
| --- | --- | --- | --- | --- |
| Sign in / register / logout | Firebase Auth (email + password, email verification) | Credential verification, token minting and session persistence need a trusted authority | Real forms and validation over PBKDF2‑SHA256 account records in `localStorage`; profiles stay in the Postgres `users` table. Sessions persist across reloads. | Equivalent |
| Email verification | Firebase transactional email | Email delivery requires an SMTP/Firebase outbound service | A 6‑digit code is generated and shown on screen in the **Judge guide → Demo‑only messages** log, labelled demo. `confirmEmailVerification` consumes it exactly like the server token. | Simulated |
| Forgot password | Firebase password‑reset email + `oobCode` | Needs outbound email to deliver the reset link | Reset code generated locally and surfaced on screen, labelled demo. Seeded accounts keep working; `completePasswordReset` re‑hashes the password with PBKDF2. | Simulated |
| Administrator sign‑in | Server `adminPasswordLogin` + Firebase custom token | Password check and custom‑token minting must not be client‑side in production | Same endpoint contract; the demo token format is the string `demo-admin.<uid>`. Login attempts still rate‑limit via the `admin_login_attempts` table. | Equivalent |
| Role guards (Admin / Shopkeeper / Customer) | Server authorisation on every endpoint | Prevention of privilege escalation requires a server | The ported `handleApi` re‑implements the original authorisation checks (access model, ownership, admin-only) against the in‑browser database. | Equivalent |
| Shop, QR, sales and warranty data | Express API + PostgreSQL | Shared, multi‑user persistence across devices | The **same PostgreSQL schema** runs inside the browser on PGlite (PostgreSQL 18 compiled to WebAssembly) and persists to IndexedDB (`idb://warq-demo`). The Firestore‑compat repository (`db.collection().doc()…`) is the original server file, ported. | Equivalent |
| Dashboard aggregation | Server `getDashboard` | Aggregates across all shops | The original aggregation logic runs in the browser over the local schema. | Equivalent |
| Generate QR sticker packs | Server `generateQrs` / `createStickerRequest` | Batch insert and code allocation | Same endpoints and code grammar (`WQ-<SHOP>-P#-####`) executed locally. | Equivalent |
| QR code images | `qrcode` library (client already) | None — was already client‑side | Unchanged; the encoded URL now also carries a compressed payload (see below). | Identical |
| Public warranty page from a scan | Server `getPublicQr` + subscription gate | The lookup must work on any device with no account | Two layers: (1) the local database is queried exactly like the server, including the subscription gate; (2) every printed QR embeds a deflate‑compressed warranty payload plus a CRC‑32 integrity checksum, so the page renders with **no database at all**. | Equivalent + Browser-only |
| QR scan (camera) | `html5-qrcode` (client already) | None | Unchanged; also offers manual code entry. | Identical |
| Submit a warranty claim | *Not in the original product* | Would need a claim table and endpoints | Added `claims` table + `submitClaim` / `getClaims` / `getClaim` / `updateClaimStatus` endpoints and a customer portal. Clearly disclosed as a demo extension. | Browser-only |
| Track a claim status | *Not in the original product* | Same as above | Claim timeline rendered in the customer portal and the admin Claims tab. | Browser-only |
| Realtime chat across tabs | Server polling (`chat-support.js`) | Multi‑user fan‑out | Same conversation model and records in the local DB; cross‑tab updates are pushed with a `BroadcastChannel` instead of HTTP polling. | Equivalent |
| Support chat / admin queue | Server `support_*` endpoints | Routing between customer and admin | Same endpoints and thread statuses; image attachments are stored as data URLs in the local DB instead of object storage. | Equivalent |
| Chat Board AI assistant | OpenRouter via the production server (`/api/ai`) | Keeps the API key off the client and proxies the model | Ships with a deterministic local assistant that answers from the shop's own data, and calls an optional external AI endpoint only if `VITE_AI_PROXY_URL` is configured. Every reply is labelled with its source. | Simulated (offline) / Equivalent (external endpoint) |
| AI insights ("AI Preview" module) | *Not in the original product* | Would need aggregation + a model | Deterministic cards computed from local QR/sales/claim data, each badged **Implemented** (computed) or **Preview** (heuristic projection). | Browser-only |
| Subscriptions, plans and limits | Server `startPayment` + bKash/Nagad merchants | Payment capture requires a merchant account and webhooks | Real plans, entitlement enforcement and invoice history. Checkout is a sandbox simulator with test cards and a permanent **“Sandbox — no real payment”** banner. | Simulated |
| Invoice history | Server `payments` table | Persistence | Same `payments` table and records; invoices listed in the Subscription screen. | Equivalent |
| Notifications | Server fan‑out | Delivery to a user's devices | Same notification records, read state and lifecycle, created locally. | Equivalent |
| Admin analytics | Server aggregation over all shops | Global visibility | Computed in the browser from the same seeded dataset (3 shops, 40 sold warranties, claims, chat). | Equivalent |
| Report exports (Excel / DOCX / PDF / CSV) | Server‑side Python generators | Server‑side document tooling | Generated entirely in the browser: `excel`/`docx` with the original JSZip builders, `pdf` with a browser port (`pdf-lib` + `fontkit`). The three server `exportProfessional*` endpoints were removed from the client. | Equivalent |
| Sticker pricing settings | Server `system/settings` | Shared config | Same `system_settings` table and `setStickerPricing` endpoint. | Equivalent |
| SMS / WhatsApp notifications | External providers | Real messaging requires paid gateways | Not sent. Support WhatsApp link is a `wa.me` deep link opened by the user's own client. | Not replicated |
| Payment gateway redirect | bKash / Nagad hosted checkout | Real merchant credentials | Sandbox checkout route `#/sandbox/<paymentId>`. | Simulated |
| Email delivery | Firebase / SMTP | Outbound email service | Codes and notices are shown on screen, labelled demo. | Simulated |
| Google Lens / third‑party scanner | Public HTTPS URL | A real domain is needed for a printed QR to resolve | Deployed to GitHub Pages. The compressed payload keeps even a dead link readable. | Equivalent |

## What is identical at the code level

- The PostgreSQL DDL (`schema.js`) is the production schema plus the `claims`, `admin_login_attempts` and `email_verification_tokens` tables.
- The Firestore‑compatible repository (`firestore.js`) is a port of the server's `db/postgres.js`.
- The route handlers in `backend.js` are ports of `server/index.js` and `server/chat-support.js`, kept as close to verbatim as the browser allows.
- The entire React client (`main.jsx`, `chat-board.jsx`, `report-*`, `ui-enhancements.jsx`, CSS) is the production UI with only routing/base‑path and data‑layer seams changed.

## What is simulated (and always labelled in the UI)

- OTP / verification / reset codes → shown on screen in the Judge guide.
- Payments → sandbox checkout with test cards and a “Sandbox — no real payment” banner.
- AI replies with no proxy configured → deterministic local assistant, labelled by source.
