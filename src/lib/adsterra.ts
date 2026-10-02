/**
 * Adsterra advert configuration.
 *
 * Adsterra runs ALONGSIDE Google AdSense: on every page load each advert slot
 * flips a coin (ADSTERRA_SHARE) and is filled by either network (see
 * AdSenseSlot.tsx). Slots whose kind has no matching Adsterra zone always use
 * AdSense, and unfilled slots keep the placeholder panel.
 *
 * Banner zones (one per size, from the Adsterra dashboard "Banner" code):
 *   31421164 — 468x60   wide banner  → "topic" + "home" slots
 *   31421166 — 728x90   wide banner  → "welcome" slot (guides hero area)
 *   31421165 — 160x600  skyscraper   → "sidebar" slots
 *   31421167 — 300x250  rectangle    → "talk" slot
 *
 * Each dashboard snippet looks like:
 *   <script> atOptions = { 'key' : '<KEY>', 'format' : 'iframe',
 *     'height' : H, 'width' : W, 'params' : {} }; </script>
 *   <script src="https://www.highrevenueformat.com/<KEY>/invoke.js"></script>
 * Copy the key (and the host from the invoke.js src) into the matching zone
 * below. While a zone's key is empty it stays inert and its slots keep using
 * AdSense — no component changes needed.
 */

export interface AdsterraZone {
  id: string;
  size: string;
  width: number;
  height: number;
  /** The atOptions 'key' — empty until the dashboard snippet is pasted in. */
  key: string;
  /** Host from the invoke.js src, e.g. www.highrevenueformat.com. */
  host: string;
}

const ZONE_SIZES = ["468x60", "728x90", "160x600", "300x250"] as const;
export type AdsterraZoneSize = (typeof ZONE_SIZES)[number];
export type AdsterraSlotKind = "topic" | "sidebar" | "home" | "talk" | "welcome";

export const ADSTERRA_ZONES: Record<AdsterraZoneSize, AdsterraZone> = {
  "468x60": { id: "31421164", size: "468x60", width: 468, height: 60, key: "29d36d2e0295dbfee9149c7277c3e70d", host: "www.highrevenueformat.com" },
  "728x90": { id: "31421166", size: "728x90", width: 728, height: 90, key: "5793b222b0759ec871e2814a2edeea73", host: "www.highrevenueformat.com" },
  "160x600": { id: "31421165", size: "160x600", width: 160, height: 600, key: "12ba0d3de4e44823dca06483b91973a6", host: "www.highrevenueformat.com" },
  "300x250": { id: "31421167", size: "300x250", width: 300, height: 250, key: "e754b4361a8e511e2ec376c4f8e5458e", host: "www.highrevenueformat.com" },
};

/** Share of page loads each slot gives to Adsterra when its zone is filled.
 *  1 while AdSense is unapproved (Adsterra takes every slot); drop back to
 *  0.5 when ADSENSE_APPROVED flips on and the two networks share again. */
export const ADSTERRA_SHARE = 1;

const ZONE_BY_SLOT: Record<AdsterraSlotKind, AdsterraZoneSize> = {
  topic: "468x60",
  home: "468x60",
  welcome: "728x90",
  sidebar: "160x600",
  talk: "300x250",
};

/** True once at least one Adsterra zone key is filled in. */
export const ADSTERRA_ENABLED = Object.values(ADSTERRA_ZONES).some(
  (zone) => zone.key.length > 0,
);

/** The zone config for a slot kind, or null when that slot has no Adsterra zone. */
export function adsterraZoneFor(kind: AdsterraSlotKind): AdsterraZone | null {
  const zone = ADSTERRA_ZONES[ZONE_BY_SLOT[kind]];
  return zone.key ? zone : null;
}

/** The banner size reserved for a slot kind, so the container can fit it. */
export function adsterraSizeFor(kind: AdsterraSlotKind): AdsterraZoneSize {
  return ZONE_BY_SLOT[kind];
}

/**
 * Renders Adsterra in an isolated frame. The frame deliberately omits popup
 * and top-navigation permissions, so a creative cannot take over the app
 * window when iOS opens the installed web app.
 */
export function ensureAdsterraBanner(zone: AdsterraZone, mount: HTMLElement) {
  if (!zone.key || typeof document === "undefined") return;
  const frame = document.createElement("iframe");
  frame.title = "Advertisement";
  frame.width = String(zone.width);
  frame.height = String(zone.height);
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("scrolling", "no");
  frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
  frame.style.border = "0";
  frame.style.display = "block";
  frame.style.maxWidth = "100%";
  frame.srcdoc = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;overflow:hidden;display:grid;place-items:center;min-height:${zone.height}px"><script>atOptions={key:${JSON.stringify(zone.key)},format:'iframe',height:${zone.height},width:${zone.width},params:{}};<\/script><script src="https://${zone.host}/${zone.key}/invoke.js"><\/script></body></html>`;
  mount.replaceChildren(frame);
}
