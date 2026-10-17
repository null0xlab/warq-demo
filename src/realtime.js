const CHANNEL_NAME = "warq-demo-sync";

const listeners = new Set();

let broadcastSuppressed = false;

const channel =
  typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL_NAME) : null;

if (channel) {
  channel.addEventListener("message", event => {
    if (event?.data?.type !== "warq-mutation") return;
    listeners.forEach(listener => {
      try {
        listener(event.data);
      } catch {
        void 0;
      }
    });
  });
}

export function isRealtimeBroadcastSuppressed() {
  return broadcastSuppressed;
}

export function broadcastRealtimeMutation(name) {
  if (!channel || broadcastSuppressed) return;
  try {
    channel.postMessage({ type: "warq-mutation", name, at: Date.now() });
  } catch {
    void 0;
  }
}

export function bindFirestoreRealtimeSync() {
  return () => {};
}

export function bindRealtimeSync({
  onSync,
  intervalMs = 60000,
  minGapMs = 8000,
  syncOnFocus = true,
} = {}) {
  if (typeof onSync !== "function") return () => {};

  let isSyncing = false;
  let lastSyncAt = 0;
  const gap = Math.max(1000, Number(minGapMs) || 8000);

  const triggerSync = async ({ force = false } = {}) => {
    if (isSyncing) return;
    const now = Date.now();
    if (!force && now - lastSyncAt < gap) return;
    isSyncing = true;
    lastSyncAt = now;
    broadcastSuppressed = true;
    try {
      await Promise.resolve(onSync());
    } catch {
      void 0;
    } finally {
      isSyncing = false;
      broadcastSuppressed = false;
    }
  };

  const onFocusOrVisible = () => {
    if (!syncOnFocus) return;
    if (document.visibilityState === "visible") {
      triggerSync({ force: false });
    }
  };

  if (syncOnFocus) {
    window.addEventListener("focus", onFocusOrVisible);
    document.addEventListener("visibilitychange", onFocusOrVisible);
  }

  const onRemoteMutation = () => {
    triggerSync({ force: true });
  };
  listeners.add(onRemoteMutation);

  let pollInterval = null;
  if (intervalMs > 0) {
    pollInterval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        triggerSync({ force: false });
      }
    }, intervalMs);
  }

  return () => {
    listeners.delete(onRemoteMutation);
    if (syncOnFocus) {
      window.removeEventListener("focus", onFocusOrVisible);
      document.removeEventListener("visibilitychange", onFocusOrVisible);
    }
    if (pollInterval) window.clearInterval(pollInterval);
  };
}
