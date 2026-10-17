import { useEffect, useState } from "react";

/**
 * Server clock synchronization.
 *
 * Countdowns measure against `warrantyExpiresAt` produced by the SERVER clock.
 * If the device clock drifts (e.g. 10s behind), remaining time would wrongly
 * start at 5:10 for a 5-minute warranty. Every API response carries
 * `serverTime`; we keep the latest offset and evaluate "now" through it so
 * countdowns match the server exactly and never gain extra seconds.
 */
let clockOffsetMs = 0;

export function syncServerClock(serverMs) {
  const server = Number(serverMs);
  if (!Number.isFinite(server) || server <= 0) return;
  const offset = server - Date.now();
  // Sanity guard: ignore absurd offsets (corrupt payload / spoofed clock).
  if (Math.abs(offset) > 5 * 60 * 1000) return;
  clockOffsetMs = offset;
}

/** Current time aligned to the server clock (falls back to device clock). */
export function serverNow() {
  return Date.now() + clockOffsetMs;
}

/**
 * Server-aligned wall-clock time for countdown UIs.
 *
 * Countdowns must always be derived as (expiresAt - now), never by decrementing
 * a stored remaining value. Offline / background / sleep may throttle timers,
 * but elapsed real time still counts because we re-read serverNow() on every
 * tick and immediately on reconnect / tab focus / visibility restore.
 */
export function useWallClockNow(tickMs = 1000) {
  const [nowMs, setNowMs] = useState(() => serverNow());

  useEffect(() => {
    let timerId = 0;

    const sync = () => {
      setNowMs(serverNow());
    };

    const armInterval = () => {
      if (timerId) window.clearInterval(timerId);
      timerId = window.setInterval(sync, tickMs);
    };

    const onResume = () => {
      // Catch up immediately to real elapsed time (no "paused" leftover seconds).
      sync();
      armInterval();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") onResume();
    };

    sync();
    armInterval();

    window.addEventListener("online", onResume);
    window.addEventListener("focus", onResume);
    window.addEventListener("pageshow", onResume);
    document.addEventListener("visibilitychange", onVisibility);
    // Some mobile WebViews emit these when returning from background.
    window.addEventListener("resume", onResume);
    document.addEventListener("resume", onResume);

    return () => {
      if (timerId) window.clearInterval(timerId);
      window.removeEventListener("online", onResume);
      window.removeEventListener("focus", onResume);
      window.removeEventListener("pageshow", onResume);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resume", onResume);
      document.removeEventListener("resume", onResume);
    };
  }, [tickMs]);

  return nowMs;
}

/** Remaining whole seconds until an absolute expiry timestamp (ISO string or ms). */
export function remainingSecondsUntil(expiresAt, nowMs = serverNow()) {
  if (expiresAt == null || expiresAt === "") return 0;
  const target =
    typeof expiresAt === "number" ? expiresAt : new Date(expiresAt).getTime();
  if (!Number.isFinite(target)) return 0;
  return Math.max(0, Math.floor((target - nowMs) / 1000));
}

export function splitCountdownParts(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  return {
    days: Math.floor(seconds / 86400),
    hours: Math.floor((seconds % 86400) / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
    seconds: seconds % 60,
    totalSeconds: seconds,
  };
}
