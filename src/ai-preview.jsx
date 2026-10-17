import React, { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Eye,
  Info,
  LoaderCircle,
  RefreshCcw,
  Sparkles,
} from "lucide-react";
import { api } from "./api";
import "./ai-preview.css";

const TONE_ICON = {
  positive: CheckCircle2,
  warning: AlertTriangle,
  neutral: Info,
};

function normalizeInsights(payload) {
  if (!payload) return null;
  const source = payload.insights && typeof payload.insights === "object" ? payload.insights : payload;
  if (!Array.isArray(source.cards)) return null;
  return {
    summary: source.summary || "",
    cards: source.cards,
    recommendations: Array.isArray(source.recommendations) ? source.recommendations : [],
    generatedAt: source.generatedAt || "",
    provider: payload.provider || payload.source || source.provider || "offline",
    model: payload.model || source.model || "",
  };
}

function StatusBadge({ status }) {
  const isImplemented = String(status || "").toLowerCase() === "implemented";
  return (
    <span className={isImplemented ? "ai-badge ai-badge-live" : "ai-badge ai-badge-preview"}>
      {isImplemented ? <CheckCircle2 size={12} /> : <Eye size={12} />}
      {isImplemented ? "Implemented" : "Preview"}
    </span>
  );
}

export default function AiPreviewModule() {
  const [state, setState] = useState({ loading: true, error: "", data: null });

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const payload = await api.getAiInsights();
      const data = normalizeInsights(payload);
      if (!data) throw new Error("The AI insights module returned no data.");
      setState({ loading: false, error: "", data });
    } catch (error) {
      setState({ loading: false, error: error?.message || "Insights are unavailable right now.", data: null });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const live = state.data
    ? String(state.data.provider).toLowerCase() !== "offline"
    : false;

  return (
    <section className="panel ai-preview" aria-label="AI Preview">
      <div className="ai-preview-head">
        <div className="ai-preview-title">
          <span className="ai-preview-mark">
            <BrainCircuit size={18} />
          </span>
          <div>
            <h3>
              AI Preview <span className="ai-preview-tag">WarQ intelligence</span>
            </h3>
            <p>
              Decision support built from your own QR, sales and claim records. Cards marked{" "}
              <strong>Implemented</strong> are computed deterministically from live data; cards marked{" "}
              <strong>Preview</strong> are clearly-labelled heuristic projections, not promises.
            </p>
          </div>
        </div>
        <button className="secondary-button" onClick={load} disabled={state.loading}>
          {state.loading ? <LoaderCircle className="spin" size={16} /> : <RefreshCcw size={16} />}
          Refresh
        </button>
      </div>

      <p className="ai-preview-source">
        <Sparkles size={14} />
        {state.data
          ? `Source: ${live ? `AI proxy${state.data.model ? ` (${state.data.model})` : ""}` : "in-browser model"} — ${
              state.data.generatedAt ? new Date(state.data.generatedAt).toLocaleString() : "just now"
            }`
          : "Source: pending"}
      </p>

      {state.error ? (
        <div className="ai-preview-error">
          <AlertTriangle size={18} />
          <span>{state.error}</span>
        </div>
      ) : null}

      {state.loading && !state.data ? (
        <div className="ai-preview-loading">
          <LoaderCircle className="spin" size={22} />
          <span>Analysing your warranty data…</span>
        </div>
      ) : null}

      {state.data ? (
        <>
          {state.data.summary ? <p className="ai-preview-summary">{state.data.summary}</p> : null}
          <div className="ai-preview-grid">
            {state.data.cards.map((card) => {
              const Icon = TONE_ICON[card.tone] || Info;
              return (
                <article key={card.id} className={`ai-card ai-card-${card.tone || "neutral"}`}>
                  <header>
                    <span className="ai-card-title">
                      <Icon size={15} />
                      {card.title}
                    </span>
                    <StatusBadge status={card.status} />
                  </header>
                  <strong>{card.headline}</strong>
                  <p>{card.detail}</p>
                  {card.metric ? <span className="ai-card-metric">{card.metric}</span> : null}
                </article>
              );
            })}
          </div>
          {state.data.recommendations.length ? (
            <div className="ai-preview-recs">
              <h4>Recommended actions</h4>
              <ul>
                {state.data.recommendations.map((line, index) => (
                  <li key={index}>{line.replace(/\*\*/g, "")}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
