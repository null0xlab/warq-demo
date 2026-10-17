import React, { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  LoaderCircle,
  Lock,
  ShieldCheck,
  WalletCards,
  X,
} from "lucide-react";
import { api } from "./api";
import "./sandbox-checkout.css";

const TEST_CARDS = {
  bkash: [
    { number: "01700000000", pin: "1234", result: "Success" },
    { number: "01700000001", pin: "0000", result: "Declined" },
  ],
  nagad: [
    { number: "01800000000", pin: "1234", result: "Success" },
    { number: "01800000001", pin: "0000", result: "Declined" },
  ],
};

const money = (value) =>
  `BDT ${new Intl.NumberFormat("en-BD", { maximumFractionDigits: 2 }).format(Number(value || 0))}`;

function normalizePayment(payload) {
  if (!payload) return null;
  const source = payload.payment && typeof payload.payment === "object" ? payload.payment : payload;
  if (!source || typeof source !== "object") return null;
  return {
    id: source.id || source.paymentId || "",
    amount: source.amount ?? source.total ?? 0,
    provider: String(source.provider || source.method || "bkash").toLowerCase(),
    kind: source.kind || source.purpose || "subscription",
    planLabel:
      source.planLabel ||
      source.planName ||
      source.packageName ||
      source.plan ||
      source.label ||
      "WarQ access",
    status: source.status || "pending",
    reference: source.reference || source.trxId || source.transactionId || "",
  };
}

function normalizeTestCards(payload, provider) {
  const source = payload && payload.testCards ? payload.testCards : null;
  const fallback = TEST_CARDS[provider] || TEST_CARDS.bkash;
  if (!source) return fallback;
  const list = [];
  if (source.success) list.push({ number: source.success.number, pin: source.success.pin, result: "Success" });
  if (source.failure) list.push({ number: source.failure.number, pin: source.failure.pin, result: "Declined" });
  return list.length ? list : fallback;
}

export default function SandboxCheckout({ paymentId, onComplete, onCancel }) {
  const [loading, setLoading] = useState(true);
  const [payment, setPayment] = useState(null);
  const [testCards, setTestCards] = useState(TEST_CARDS.bkash);
  const [loadError, setLoadError] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [failure, setFailure] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const payload = await api.getSandboxPayment(paymentId);
      const next = normalizePayment(payload);
      if (!next) throw new Error("This sandbox payment could not be found.");
      setPayment(next);
      setTestCards(normalizeTestCards(payload, next.provider));
    } catch (error) {
      setLoadError(error?.message || "Unable to load this sandbox payment.");
    } finally {
      setLoading(false);
    }
  }, [paymentId]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (event) => {
    event.preventDefault();
    setFailure("");
    setResult(null);
    if (!/^\d{11}$/.test(accountNumber.trim())) {
      setFailure("Enter an 11-digit sandbox mobile number (for example 01700000000).");
      return;
    }
    if (!/^\d{4}$/.test(pin.trim())) {
      setFailure("Enter the 4-digit sandbox PIN (the test cards use 1234).");
      return;
    }
    setBusy(true);
    try {
      const payload = await api.completeSandboxPayment({
        paymentId,
        testCard: { number: accountNumber.trim(), pin: pin.trim() },
      });
      if (payload && payload.success === false) {
        setFailure(payload.message || "The sandbox payment was declined. Use a success test card.");
        return;
      }
      const next = normalizePayment(payload) || payment;
      const status = String((payload && payload.status) || (next && next.status) || "paid").toLowerCase();
      if (status === "failed" || status === "declined") {
        setFailure((payload && payload.message) || "The sandbox payment was declined.");
        return;
      }
      setResult({ ...(next || {}), amount: (next && next.amount) || payment?.amount, planLabel: payment?.planLabel });
    } catch (error) {
      setFailure(error?.message || "The sandbox payment could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  const fillCard = (card) => {
    setAccountNumber(card.number);
    setPin(card.pin);
    setFailure("");
  };

  return (
    <section className="sandbox-page">
      <div className="sandbox-banner">
        <ShieldCheck size={16} />
        Sandbox — no real payment. Test cards only; nothing is charged and no money moves.
      </div>

      <div className="sandbox-card">
        <header className="sandbox-head">
          <div>
            <p className="sandbox-kicker">
              <Lock size={13} /> Secure checkout (sandbox)
            </p>
            <h1>Complete your WarQ payment</h1>
          </div>
          <button className="sandbox-close" onClick={onCancel} aria-label="Cancel and return to WarQ">
            <X size={18} />
          </button>
        </header>

        {loading ? (
          <div className="sandbox-loading">
            <LoaderCircle className="spin" size={24} />
            <span>Loading sandbox payment…</span>
          </div>
        ) : loadError ? (
          <div className="sandbox-error">
            <AlertTriangle size={20} />
            <div>
              <strong>Payment unavailable</strong>
              <p>{loadError}</p>
            </div>
            <button className="secondary-button" onClick={onCancel}>
              Return to WarQ
            </button>
          </div>
        ) : result ? (
          <div className="sandbox-success">
            <CheckCircle2 size={40} />
            <h2>Sandbox payment approved</h2>
            <p>
              {money(result.amount ?? payment?.amount)} paid for <strong>{result.planLabel || payment?.planLabel}</strong>.
              This was a simulated transaction — no real money moved.
            </p>
            {result.reference ? <p className="sandbox-ref">Reference: {result.reference}</p> : null}
            <button className="primary-button" onClick={onComplete}>
              Return to WarQ
            </button>
          </div>
        ) : (
          <form className="sandbox-form" onSubmit={submit}>
            <div className="sandbox-amount">
              <span>Amount due</span>
              <strong>{money(payment?.amount)}</strong>
              <small>{payment?.planLabel}</small>
            </div>

            <div className="sandbox-providers">
              <div className="sandbox-provider is-active" aria-label="Payment provider">
                <WalletCards size={16} />
                {payment?.provider === "nagad" ? "Nagad" : "bKash"}
              </div>
            </div>

            <label className="sandbox-field">
              Mobile account number
              <input
                inputMode="numeric"
                autoComplete="off"
                value={accountNumber}
                placeholder="01700000000"
                onChange={(event) => setAccountNumber(event.target.value.replace(/[^\d]/g, "").slice(0, 11))}
              />
            </label>

            <label className="sandbox-field">
              PIN
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                placeholder="1234"
                onChange={(event) => setPin(event.target.value.replace(/[^\d]/g, "").slice(0, 4))}
              />
            </label>

            <div className="sandbox-testcards">
              <p>
                <CreditCard size={14} /> Sandbox test cards
              </p>
              <div className="sandbox-testcard-grid">
                {testCards.map((card) => (
                  <button
                    key={card.number}
                    type="button"
                    className="sandbox-testcard"
                    onClick={() => fillCard(card)}
                  >
                    <span>{card.number}</span>
                    <small>PIN {card.pin}</small>
                    <em className={card.result === "Success" ? "is-ok" : "is-no"}>{card.result}</em>
                  </button>
                ))}
              </div>
            </div>

            {failure ? (
              <div className="sandbox-failure" role="alert">
                <AlertTriangle size={18} />
                <span>{failure}</span>
              </div>
            ) : null}

            <div className="sandbox-actions">
              <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="primary-button" disabled={busy}>
                {busy ? <LoaderCircle className="spin" size={16} /> : <Lock size={16} />}
                {busy ? "Processing…" : `Pay ${money(payment?.amount)}`}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
