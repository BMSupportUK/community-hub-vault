/**
 * Google AdSense configuration.
 *
 * Set ADSENSE_CLIENT_ID to your publisher ID (ca-pub-...) and
 * ADSENSE_TOPIC_SLOT to the ad unit's data-ad-slot once the AdSense
 * account is approved and the ad unit is created in AdSense.
 * While either is empty, a placeholder panel is rendered instead.
 */
export const ADSENSE_CLIENT_ID = "ca-pub-7730881064868843";
export const ADSENSE_TOPIC_SLOT = "3497999055";
export const ADSENSE_SIDEBAR_SLOT = "6260280806";

export const ADSENSE_ENABLED =
  ADSENSE_CLIENT_ID.length > 0 &&
  (ADSENSE_TOPIC_SLOT.length > 0 || ADSENSE_SIDEBAR_SLOT.length > 0);

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

let requested = false;

/** Injects the AdSense loader script once per page. */
export function ensureAdSenseScript() {
  if (!ADSENSE_ENABLED || typeof document === "undefined") return;
  if (requested) return;
  requested = true;
  const s = document.createElement("script");
  s.async = true;
  s.crossOrigin = "anonymous";
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`;
  document.head.appendChild(s);
}

/** Asks AdSense to fill the most recently rendered empty slot. */
export function pushAd() {
  if (!ADSENSE_ENABLED) return;
  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  } catch {
    // AdSense not ready yet (script blocked or still loading) — leave the slot empty.
  }
}
