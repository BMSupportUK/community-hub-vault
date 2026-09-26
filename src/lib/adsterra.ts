/**
 * Adsterra fallback advert configuration.
 *
 * Adsterra is the no-site-review fallback network: if the AdSense application
 * is declined, paste the banner zone script src from each Adsterra zone into
 * the constants below and the whole site switches over — no component changes.
 * While every value is empty, behaviour is exactly as before (AdSense only,
 * or the placeholder panel when AdSense is unfilled).
 *
 * The Adsterra dashboard banner snippet looks like:
 *   <script async data-cfasync="false"
 *     src="//pl123456.profitablecpmrate.com/<key>/invoke.js"></script>
 * Copy the src value (with or without the leading //) into the matching slot.
 * If the snippet ships an extra container div or inline options, we finalise
 * the embed here with the real snippet — the slots already reserve the space.
 */

export const ADSTERRA_TOPIC_SRC = "";
export const ADSTERRA_SIDEBAR_SRC = "";
export const ADSTERRA_HOME_SRC = "";
export const ADSTERRA_TALK_SRC = "";
export const ADSTERRA_WELCOME_SRC = "";

const SLOT_SRCS = {
  topic: ADSTERRA_TOPIC_SRC,
  sidebar: ADSTERRA_SIDEBAR_SRC,
  home: ADSTERRA_HOME_SRC,
  talk: ADSTERRA_TALK_SRC,
  welcome: ADSTERRA_WELCOME_SRC,
} as const;

export type AdsterraSlotKind = keyof typeof SLOT_SRCS;

/** True once at least one Adsterra zone is filled. */
export const ADSTERRA_ENABLED = Object.values(SLOT_SRCS).some((src) => src.length > 0);

/** The zone src for a slot kind, or "" when that slot has no Adsterra zone. */
export function adsterraZoneFor(kind: AdsterraSlotKind): string {
  return SLOT_SRCS[kind] ?? "";
}

const injected = new Set<string>();

/**
 * Injects the Adsterra zone loader script into the slot's mount element.
 * Runs once per zone per page; the mount element owns the rendering.
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
