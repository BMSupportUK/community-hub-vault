/**
 * Google Analytics 4 (gtag.js), browser-only.
 *
 * The measurement ID comes from the linked Google Analytics connector and is
 * safe to use in the browser — a measurement ID is public by design.
 */
const measurementId = import.meta.env
  .VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY as string | undefined;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let initialized = false;

/** Loads gtag.js once. Safe to call from the root component's effect. */
export function initAnalytics() {
  if (typeof window === "undefined" || initialized) return;
  if (!measurementId) {
    console.warn("[analytics] Google Analytics measurement ID not configured");
    return;
  }
  initialized = true;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer!.push(args);
  };
  window.gtag("js", new Date());
  window.gtag("config", measurementId);
}

/**
 * Sends a page view for client-side navigation. gtag's `config` call already
 * records the initial load, so callers should skip the first render.
 */
export function trackPageView(path: string) {
  if (typeof window === "undefined" || !measurementId || !window.gtag) return;
  window.gtag("event", "page_view", { page_path: path });
}
