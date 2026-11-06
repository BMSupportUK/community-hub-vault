// Shared, browser-safe rules for the iPhone/iPad web BM Player.

/** iPhone, iPod or iPad — including iPads that report themselves as a Mac (touch screen + Macintosh). */
export function isAppleMobile(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true;
  return /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

/** Safari can only play these film/episode files directly; everything else is hidden (no website conversion). */
const PLAYABLE_VOD = new Set(["mp4", "m4v", "mov"]);
export function playableVod(ext: string | null | undefined): boolean {
  return PLAYABLE_VOD.has(String(ext || "").trim().toLowerCase());
}

const enc = encodeURIComponent;
const root = (dns: string) => dns.replace(/\/+$/, "");

/** Live TV is always asked for in m3u8, the only live format Safari plays. */
export function liveUrl(dns: string, user: string, pass: string, id: string) {
  return `${root(dns)}/live/${enc(user)}/${enc(pass)}/${enc(id)}.m3u8`;
}
export function vodUrl(dns: string, user: string, pass: string, kind: "film" | "episode", id: string, ext: string) {
  return `${root(dns)}/${kind === "film" ? "movie" : "series"}/${enc(user)}/${enc(pass)}/${enc(id)}.${ext.toLowerCase()}`;
}
/** Xtream timeshift in UK time, requested as m3u8 so Safari can play it. */
export function catchupUrl(dns: string, user: string, pass: string, id: string, start: number, end: number) {
  const mins = Math.max(1, Math.ceil(((end > start ? end : start + 3_600_000) - start) / 60_000));
  const f = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(start)).map((x) => [x.type, x.value]));
  return `${root(dns)}/timeshift/${enc(user)}/${enc(pass)}/${mins}/${f.year}-${f.month}-${f.day}:${f.hour}-${f.minute}/${enc(id)}.m3u8`;
}

/** Only secure provider addresses can play inside the secure website. */
export function secureDns(dns: string) {
  return /^https:\/\//i.test(dns.trim());
}

/** Same reconnect timing as the other players (stream-recovery.cjs): 1/2/4/8/10s, 8 tries. */
export const STALL_RECONNECT_MS = 12_000;
export const MAX_TRIES = 8;
export function backoffMs(attempt: number) {
  return Math.min(10_000, 1000 * 2 ** Math.max(0, attempt));
}
