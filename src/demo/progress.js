const STAGES = [
  { id: "engine", label: "Loading the PostgreSQL engine", weight: 0.05, expected: 280 },
  { id: "cluster", label: "Starting PostgreSQL inside this browser", weight: 0.76, expected: 4600 },
  { id: "schema", label: "Checking the database schema", weight: 0.06, expected: 360 },
  { id: "check", label: "Checking for existing demo data", weight: 0.005 },
  { id: "reset", label: "Clearing old demo records", weight: 0.008 },
  { id: "accounts", label: "Creating the sample accounts", weight: 0.005 },
  { id: "catalogue", label: "Setting up products, sales and warranties", weight: 0.067 },
  { id: "claims", label: "Restoring warranty claims", weight: 0.004 },
  { id: "chat", label: "Loading chat and support history", weight: 0.013 },
  { id: "billing", label: "Restoring subscriptions and orders", weight: 0.006 },
  { id: "inbox", label: "Filling the notification inbox", weight: 0.003 },
  { id: "audit", label: "Writing the activity log", weight: 0.003 },
  { id: "qr", label: "Signing the warranty QR codes", weight: 0.015 },
  { id: "verify", label: "Verifying the demo data", weight: 0.005 },
];

const EXPECTED_KEY = "warq.demo.prep.expected.v1";
const MEASURED_STAGES = STAGES.filter((stage) => stage.expected).map((stage) => stage.id);

const LABELS = new Map(STAGES.map((stage) => [stage.id, stage.label]));
const ORDER = STAGES.map((stage) => stage.id);
const TOTAL_WEIGHT = STAGES.reduce((sum, stage) => sum + stage.weight, 0) || 1;

const OFFSET = {};
const WIDTH = {};
let cursor = 0;
for (const stage of STAGES) {
  OFFSET[stage.id] = cursor;
  WIDTH[stage.id] = stage.weight / TOTAL_WEIGHT;
  cursor += WIDTH[stage.id];
}

function readExpected() {
  const defaults = {};
  for (const stage of STAGES) {
    if (stage.expected) defaults[stage.id] = stage.expected;
  }
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(EXPECTED_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    const merged = { ...defaults };
    for (const id of MEASURED_STAGES) {
      const value = Number(parsed?.[id]);
      if (Number.isFinite(value) && value >= 80 && value <= 60000) merged[id] = value;
    }
    return merged;
  } catch {
    return defaults;
  }
}

let expected = readExpected();

function writeExpected(timings) {
  if (typeof window === "undefined") return;
  const next = { ...expected };
  for (const id of MEASURED_STAGES) {
    const observed = timings[id];
    if (!Number.isFinite(observed) || observed < 80 || observed > 60000) continue;
    next[id] = Math.round(observed * 0.6 + next[id] * 0.4);
  }
  expected = next;
  try {
    window.localStorage.setItem(EXPECTED_KEY, JSON.stringify(next));
  } catch {
    void 0;
  }
}

const listeners = new Set();
const failureListeners = new Set();

const WATCHDOG_IDLE_TICKS = 30;
let watchdogTimer = 0;
let progressCount = 0;
let watchedCount = 0;
let idleTicks = 0;

let state = {
  active: false,
  done: false,
  failed: false,
  reused: false,
  error: "",
  stage: "",
  label: "",
  detail: "",
  percent: 0,
  ratio: 0,
  startedAt: 0,
  stageStartedAt: 0,
  finishedAt: 0,
};

let currentStage = "";
let currentStart = 0;
let timings = {};

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function labelOf(id) {
  return LABELS.get(id) || "";
}

function percentFor(id, ratio) {
  const offset = OFFSET[id] || 0;
  const width = WIDTH[id] || 0;
  const value = (offset + width * Math.max(0, Math.min(1, ratio))) * 100;
  return Math.max(0, Math.min(99, value));
}

export function livePercent(snapshot, now) {
  if (!snapshot) return 0;
  if (snapshot.done) return 100;
  if (!snapshot.active) return snapshot.percent;
  const base = (OFFSET[snapshot.stage] || 0) * 100;
  const width = (WIDTH[snapshot.stage] || 0) * 100;
  const budget = expected[snapshot.stage];
  let ratio = snapshot.ratio;
  if (budget) {
    const elapsed = Math.max(0, (now || Date.now()) - snapshot.stageStartedAt);
    const estimate = Math.min(0.92, elapsed / budget);
    if (estimate > ratio) ratio = estimate;
  }
  return Math.max(0, Math.min(99, base + width * ratio));
}

function snapshot() {
  return { ...state };
}

function emit() {
  if (state.active) progressCount += 1;
  const value = snapshot();
  for (const listener of listeners) {
    try {
      listener(value);
    } catch {
      void 0;
    }
  }
}

function startWatchdog() {
  if (typeof window === "undefined" || watchdogTimer) return;
  progressCount = 0;
  watchedCount = 0;
  idleTicks = 0;
  watchdogTimer = window.setInterval(() => {
    if (!state.active) {
      idleTicks = 0;
      return;
    }
    if (progressCount !== watchedCount) {
      watchedCount = progressCount;
      idleTicks = 0;
      return;
    }
    idleTicks += 1;
    if (idleTicks >= WATCHDOG_IDLE_TICKS) {
      failPreparation(
        new Error(
          "Preparing the demo data stalled and did not finish. The database engine may not have downloaded, so check the connection and try again.",
        ),
      );
    }
  }, 1000);
}

function stopWatchdog() {
  if (typeof window === "undefined" || !watchdogTimer) return;
  window.clearInterval(watchdogTimer);
  watchdogTimer = 0;
}

function closeCurrent() {
  if (currentStage && currentStart) {
    timings[currentStage] = (timings[currentStage] || 0) + Math.max(0, nowMs() - currentStart);
  }
  currentStage = "";
  currentStart = 0;
}

function openStage(id) {
  currentStage = id;
  currentStart = nowMs();
  state = { ...state, stageStartedAt: Date.now() };
}

export function beginPreparation() {
  if (state.active || state.done) return;
  state = {
    active: true,
    done: false,
    failed: false,
    reused: false,
    error: "",
    stage: "",
    label: "",
    detail: "",
    percent: 0,
    ratio: 0,
    startedAt: Date.now(),
    stageStartedAt: Date.now(),
    finishedAt: 0,
  };
  currentStage = "";
  currentStart = 0;
  timings = {};
  startWatchdog();
  emit();
}

export function setStage(id, detail = "") {
  if (!state.active) return;
  closeCurrent();
  openStage(id);
  state = { ...state, stage: id, label: labelOf(id), detail, percent: percentFor(id, 0), ratio: 0 };
  emit();
}

export function reportProgress(id, ratio) {
  if (!state.active) return;
  const clamped = Math.max(0, Math.min(1, Number(ratio) || 0));
  if (currentStage !== id) {
    closeCurrent();
    openStage(id);
  }
  state = { ...state, stage: id, label: labelOf(id), percent: percentFor(id, clamped), ratio: clamped };
  if (clamped >= 1) closeCurrent();
  emit();
}

export function completeStage(id, detail) {
  reportProgress(id, 1);
  if (detail !== undefined) {
    state = { ...state, detail };
    emit();
  }
}

export function finishPreparation(options = {}) {
  if (!state.active) return;
  closeCurrent();
  stopWatchdog();
  const reused = Boolean(options.reused);
  const last = ORDER[ORDER.length - 1];
  state = {
    ...state,
    active: false,
    done: true,
    failed: false,
    reused,
    error: "",
    stage: reused ? state.stage : last,
    label: reused ? state.label : labelOf(last),
    detail: options.detail !== undefined ? options.detail : state.detail,
    percent: 100,
    ratio: 1,
    finishedAt: Date.now(),
  };
  if (!reused) writeExpected(timings);
  emit();
}

export function failPreparation(error) {
  if (!state.active && state.failed) return;
  closeCurrent();
  stopWatchdog();
  const message =
    (error && typeof error.message === "string" && error.message) ||
    "The demo data could not be prepared in this browser.";
  state = { ...state, active: false, done: false, failed: true, error: message };
  emit();
  for (const listener of failureListeners) {
    try {
      listener(message);
    } catch {
      void 0;
    }
  }
}

export function onPreparationFailed(listener) {
  failureListeners.add(listener);
  return () => failureListeners.delete(listener);
}

export function getProgress() {
  return snapshot();
}

export function getPreparationTimings() {
  return { ...timings };
}

export function subscribeProgress(listener) {
  listeners.add(listener);
  try {
    listener(snapshot());
  } catch {
    void 0;
  }
  return () => listeners.delete(listener);
}

if (typeof window !== "undefined") {
  window.__warqDemoPrep = () => ({
    ...snapshot(),
    live: livePercent(state, Date.now()),
    timings: getPreparationTimings(),
    expected: { ...expected },
  });
}
