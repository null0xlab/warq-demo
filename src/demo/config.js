const env = import.meta.env || {};

export const BASE_PATH = ((env.BASE_URL || "/")).replace(/\/+$/, "") + "/";

export const DEMO_MODE = env.VITE_DEMO_MODE !== "false";

export const AI_PROXY_URL = (env.VITE_AI_PROXY_URL || "").trim();

export const APP_ORIGIN = typeof window === "undefined" ? "" : window.location.origin;

export function appUrl(relative) {
  const clean = String(relative || "").replace(/^\/+/, "");
  return `${BASE_PATH}${clean}`;
}

export function absoluteUrl(relative) {
  return `${APP_ORIGIN}${appUrl(relative)}`;
}

export function sandboxPayUrl(paymentId) {
  return `${APP_ORIGIN}${BASE_PATH}#/sandbox/${encodeURIComponent(paymentId)}`;
}

export function isSecureContextAvailable() {
  if (typeof window === "undefined") return false;
  return Boolean(window.isSecureContext && window.crypto && window.crypto.subtle);
}
