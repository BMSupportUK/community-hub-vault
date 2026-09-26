/**
 * Adsterra advert configuration.
 *
 * Adsterra now runs ALONGSIDE Google AdSense: on every page load each advert
 * slot flips a coin and is filled by either network (see AdSenseSlot.tsx,
 * ADSTERRA_SHARE). Slots whose kind has no matching Adsterra zone always use
 * AdSense, and unfilled slots keep the placeholder panel.
 *
 * Banner zones (one per size, from the Adsterra dashboard):
 *   31421164 — 468x60   wide banner  → "topic" + "home" slots
 *   31421166 — 728x90   wide banner  → "welcome" slot (guides hero area)
 *   31421165 — 160x600  skyscraper   → "sidebar" slots
 *   31421167 — 300x250  rectangle    → "talk" slots
 *
 * The dashboard banner snippet looks like:
 *   <script async data-cfasync="false"
 *     src="//pl31421164.profitablecpmrate.com/<key>/invoke.js"></script>
 * Paste the full src value (with or without the leading //) for each zone into
 * SRC_BY_SIZE below. While a value is empty that zone stays inert and its
 * slots keep using AdSense — no component changes needed.
 */

export const ADSTERRA_ZONES = {
  "468x60": { id: "31421164", src: "" },
  "728x90": { id: "31421166", src: "" },
  "160x600": { id: "31421165", src: "" },
  "300x250": { id: "31421167", src: "" },
} as const;

export type AdsterraZoneSize = keyof typeof ADSTERRA_ZONES;
export type AdsterraSlotKind = "topic" | "sidebar" | "home" | "talk" | "welcome";

/** Share of page loads each slot gives to Adsterra when its zone is filled. */
export const ADSTERRA_SHARE = 0.5;

const ZONE_BY_SLOT: Record<AdsterraSlotKind, AdsterraZoneSize> = {
  topic: "468x60",
  home: "468x60",
  welcome: "728x90",
  sidebar: "160x600",
  talk: "300x250",
};

/** True once at least one Adsterra zone src is filled in. */
export const ADSTERRA_ENABLED = Object.values(ADSTERRA_ZONES).some(
  (zone) => zone.src.length > 0,
);

/** The invoke.js src for a slot kind, or "" when that slot has no Adsterra zone. */
export function adsterraZoneFor(kind: AdsterraSlotKind): string {
  return ADSTERRA_ZONES[ZONE_BY_SLOT[kind]]?.src ?? "";
}

/** The banner size reserved for a slot kind, so the container can fit it. */
export function adsterraSizeFor(kind: AdsterraSlotKind): AdsterraZoneSize {
  return ZONE_BY_SLOT[kind];
}

const injected = new Set<string>();

/** True when this zone's loader already ran on the current page. */
export function isAdsterraZoneInjected(src: string): boolean {
  return injected.has(src);
}

/**
 * Injects the Adsterra zone loader script into the slot's mount element.
 * Runs once per zone per page; a second slot on the same page reuses the
 * already-injected zone rather than loading it twice.
 */
export function ensureAdsterraScript(src: string, mount: HTMLElement) {
  if (!src || typeof document === "undefined") return;
  if (injected.has(src)) return;
  injected.add(src);
  const s = document.createElement("script");
  s.async = true;
  s.dataset.cfasync = "false";
  s.src = src.startsWith("//") ? `https:${src}` : src;
  mount.appendChild(s);
}
