/**
 * Real TV guide listings (published XMLTV guides) for BM Player's Live TV guide.
 * Pure helpers shared by the importer, the player `guide` action and tests.
 */

export const EPG_SOURCE = "https://epgshare01.online/epgshare01/epg_ripper_";

/** Playlist category prefix ("UK | Sky Sports" → "UK") → published guide feeds for that country. */
export const COUNTRY_FEEDS: Record<string, string[]> = {
  UK: ["UK1"], IRE: ["IE1", "UK1"], IE: ["IE1", "UK1"], EPL: ["UK1"], EFL: ["UK1"],
  US: ["US2", "US_SPORTS1"], CA: ["CA2"], AU: ["AU1"], NZ: ["NZ1"],
  DE: ["DE1"], IT: ["IT1"], FR: ["FR1"], ES: ["ES1"], PT: ["PT1"], PL: ["PL1"], NL: ["NL1"],
  GR: ["GR1"], RO: ["RO1"], IN: ["IN1"], PK: ["PK1"], ZA: ["ZA1"], DK: ["DK1"], TR: ["TR1"],
  PH: ["PH1"], TH: ["TH1"], SE: ["SE1"], NO: ["NO1"], UKR: ["UA1"], CZ: ["CZ1"], BE: ["BE2"],
  AT: ["AT1"], CH: ["CH1"], MX: ["MX1"], BR: ["BR1"], AR: ["AR1"], AE: ["AE1"], SA: ["SA1"],
};

const SKIP_CATEGORY = /^(24\/7|radio|for adults|todays live|vip)\b/i;

/** "UK | Sky Sports" → "UK"; null when the category isn't a country we have a guide for. */
export function categoryCountry(category: string): string | null {
  const m = /^\s*([A-Za-z]{2,4})\s*\|/.exec(category || "");
  const c = m?.[1].toUpperCase();
  return c && COUNTRY_FEEDS[c] ? c : null;
}

/** Feeds to search for one playlist channel (most specific first). */
export function feedsFor(name: string, category: string): string[] {
  if (SKIP_CATEGORY.test(category || "")) return [];
  if (categoryCountry(category) === "US" && /\blocals?\b/i.test(category)) return ["US_LOCALS1", "US2"];
  const out: string[] = [];
  const c = categoryCountry(category);
  if (c) out.push(...COUNTRY_FEEDS[c]);
  return [...new Set(out)];
}

const QUALITY = /^(f?hd|uhd|sd|4k|8k|hevc|h\.?26[45]|raw|\d{2,3}\s*fps|vip|backup|alt|multi|nowtv|catchupbackup|ᴴᴰ|ᶠᴴᴰ|ᵁᴴᴰ|ᴿᴬᵂ)$/i;

/** Lower-case alphanumerics with quality/country tags removed; "+1" kept as "plus1". */
export function normName(s: string): string {
  let n = (s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  n = n.replace(/\.(uk|us|ca|au|ie|de|it|fr|es|pt|pl|nl|gr|ro|in|za|dk|tr|[a-z]{2})$/i, "");
  n = n.replace(/\+\s*(\d)/g, " plus$1").replace(/\+/g, " plus ").replace(/&/g, " and ");
  n = n.replace(/[._]/g, " ").replace(/\([^)]*\)|\[[^\]]*\]/g, " ");
  const words = n.split(/[^a-z0-9]+/).filter((w) => w && !QUALITY.test(w)).map((w) => (w === "sport" ? "sports" : w));
  if (words.length > 1 && words[words.length - 1] === "uk") words.pop();
  let j = words.join("");
  // Guide abbreviations ("SkySpMainEvHD", "Cartoon Netwrk", "U and Dave").
  j = j.replace(/(f|u)?hd$/, "").replace(/^uand(?=.)/, "").replace(/^skysp(?!orts)/, "skysports").replace(/^skysportspl$/, "skysportspremierleague")
    .replace(/mainev(?!ent)/, "mainevent").replace(/fball/, "football").replace(/boxoff(?!ice)/, "boxoffice").replace(/(netwrk|net)$/, "network");
  return j;
}

/** Name candidates for a playlist channel, best first ("BBC One | FHD |" → "bbcone"). */
export function playlistCandidates(name: string, epgId?: string | null): string[] {
  const parts = (name || "").split("|").map((p) => p.trim()).filter((p) => p && !QUALITY.test(p.replace(/\s+/g, "")));
  // Drop a leading country tag ("UK | Sky Sports Main Event").
  if (parts.length > 1 && /^[A-Za-z]{2,3}$/.test(parts[0]) && COUNTRY_FEEDS[parts[0].toUpperCase()]) parts.shift();
  const out = [normName(parts.join(" ")), normName(parts[0] ?? "")];
  // US locals: "FOX: MI | Grand Rapids | WXMI" → the call sign.
  // Local station callsigns can appear anywhere, not just in a final pipe segment.
  const calls = name.toUpperCase().match(/\b[KW][A-Z]{2,3}(?:-(?:TV|DT|LD|CD))?\b/g) ?? [];
  for (const call of calls) out.unshift(normName(call.replace(/-(TV|DT)$/, "")), normName(call));
  if (epgId) out.push(normName(epgId));
  return [...new Set(out.filter((c) => c.length >= 2))];
}

export type EpgChannel = { id: string; names: string[] };

/** "BBC One | FHD |" → "BBC One": drops trailing quality-only segments so 24/7 channels aren't mistaken for event feeds. */
export function stripQualityTail(name: string): string {
  const parts = (name || "").split("|");
  while (parts.length > 1 && (!parts[parts.length - 1].trim() || QUALITY.test(parts[parts.length - 1].replace(/\s+/g, "")))) {
    // Keep a bare trailing "|" when the segment before it is a numbered event feed ("UFC 04 |").
    const prev = parts[parts.length - 2].trim();
    if (!parts[parts.length - 1].trim() && /\d\s*$/.test(prev) && parts.length === 2) break;
    parts.pop();
  }
  return parts.join("|").trim();
}

/** Index of normalised names → guide channel id (first listed wins). */
export function buildIndex(channels: EpgChannel[]): Map<string, string> {
  const idx = new Map<string, string>();
  for (const c of channels) for (const n of [...c.names, c.id]) {
    const k = normName(n);
    if (k.length >= 2 && !idx.has(k)) idx.set(k, c.id);
  }
  // Main digital station aliases (WSB-TV in playlist, WSB-DT in XMLTV).
  // Never alias numbered subchannels or low-power LD/CD stations to the main feed.
  for (const c of channels) for (const name of c.names) {
    if (/^[KW][A-Z]{2,3}-(DT|TV)$/i.test(name)) {
      const key = normName(name.replace(/-(DT|TV)$/i, ""));
      if (!idx.has(key)) idx.set(key, c.id);
    }
  }
  return idx;
}

/** Guides that only list regional/renamed versions: playlist name → guide name to use. */
const NAME_ALIASES: Record<string, string> = { bbcone: "bbconelon", espn1: "espn", nbcsports: "nbcsports" };

export function matchChannel(name: string, idx: Map<string, string>, epgId?: string | null): string | null {
  const cands = playlistCandidates(name, epgId);
  for (const c of cands) { const id = idx.get(c); if (id) return id; }
  for (const c of cands) { const a = NAME_ALIASES[c]; const id = a ? idx.get(a) : undefined; if (id) return id; }
  return null;
}

/** "20261107000000 +0000" → epoch ms. */
export function xmltvTime(s: string): number {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-])?(\d{2})?(\d{2})?/.exec((s || "").trim());
  if (!m) return NaN;
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  const off = m[7] ? (m[7] === "-" ? -1 : 1) * ((+(m[8] ?? 0)) * 60 + +(m[9] ?? 0)) : 0;
  return utc - off * 60_000;
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
export function xmlText(s: string): string {
  return (s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    if (e[0] === "#") { const cp = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(cp) ? String.fromCodePoint(cp) : ""; }
    return ENT[e.toLowerCase()] ?? "";
  }).trim();
}

export type EpgProgramme = { channel: string; start: number; stop: number; title: string; desc: string };

/**
 * Streaming XMLTV reader: feed text chunks, get whole <channel>/<programme> elements back.
 * Keeps only an unfinished element in memory, so 70 MB guides parse without loading them whole.
 */
export class XmltvReader {
  private buf = "";
  private progs = false;
  push(chunk: string, onChannel: (c: EpgChannel) => void, onProgramme: (p: EpgProgramme) => void, wantsProgramme?: (channel: string) => boolean) {
    this.buf += chunk;
    let at = 0;
    for (;;) {
      // XMLTV lists every channel before the programmes, so stop looking for channels after the first programme.
      const p = this.buf.indexOf("<programme ", at);
      const c = this.progs ? -1 : this.buf.indexOf("<channel ", at);
      if (p >= 0 && (c < 0 || p < c)) this.progs = true;
      const open = c < 0 ? p : p < 0 ? c : Math.min(c, p);
      if (open < 0) { at = Math.max(at, this.buf.length - 12); break; }
      const isProg = open === p;
      const close = this.buf.indexOf(isProg ? "</programme>" : "</channel>", open);
      const selfClose = this.buf.indexOf(">", open);
      if (selfClose < 0) { at = open; break; }
      if (this.buf[selfClose - 1] === "/") { at = selfClose + 1; continue; }
      if (close < 0) { at = open; break; }
      const el = this.buf.slice(open, close);
      at = close + 1;
      const head = this.buf.slice(open, selfClose);
      if (isProg) {
        const ch = /channel="([^"]*)"/.exec(head)?.[1], st = /start="([^"]*)"/.exec(head)?.[1], sp = /stop="([^"]*)"/.exec(head)?.[1];
        if (!ch || !st || !sp) continue;
        if (wantsProgramme && !wantsProgramme(xmlText(ch))) continue;
        onProgramme({
          channel: xmlText(ch), start: xmltvTime(st), stop: xmltvTime(sp),
          title: xmlText(/<title[^>]*>([\s\S]*?)<\/title>/.exec(el)?.[1] ?? ""),
          desc: xmlText(/<desc[^>]*>([\s\S]*?)<\/desc>/.exec(el)?.[1] ?? ""),
        });
      } else {
        const id = /id="([^"]*)"/.exec(head)?.[1];
        if (!id) continue;
        const names = [...el.matchAll(/<display-name[^>]*>([\s\S]*?)<\/display-name>/g)].map((m) => xmlText(m[1])).filter(Boolean);
        onChannel({ id: xmlText(id), names });
      }
    }
    this.buf = this.buf.slice(at);
  }
}

/** Xtream-style listing rows (base64 title/description, seconds) so apps reuse their existing parsers. */
export type ListingRow = { id: string; title: string; description: string; start_timestamp: number; stop_timestamp: number };

const b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = ""; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

export function toListing(p: { start: number; stop: number; title: string; desc?: string }): ListingRow {
  const st = Math.floor(p.start / 1000);
  return { id: String(st), title: b64(p.title || "Programme"), description: b64(p.desc ?? ""), start_timestamp: st, stop_timestamp: Math.floor(p.stop / 1000) };
}

export const NO_EVENT = "No event scheduled";
/** Without a real finish time, an event slot runs this long. */
export const EVENT_DEFAULT_MS = 3 * 3600_000;

/** Ordinary TV EPG does not depend on building the complete sports feed. */
export function needsSportsEvents(channel: string, official: boolean, eventOnly: boolean): boolean {
  return !official && (eventOnly || /\b(coupang|dazn|ufc|fight\s*pass|bkfc|monomax|peacock|paramount|apple|mls|nba|nfl|nhl|rugby\s*pass|tennis|triller|hbo|max|ifollow)\b/i.test(channel));
}

/**
 * Sports Pass / event-only channel listings from the website Sports Guide: one slot per event on
 * that channel, "No event scheduled" filling the gaps across [from, to).
 */
export function eventListings(
  channel: string,
  events: { title: string; start: number; end?: number; channels: string[]; competition?: string }[],
  from: number, to: number,
): { start: number; stop: number; title: string; desc: string }[] {
  const key = channel.trim().toLowerCase();
  const mine = events
    .filter((e) => e.channels.some((c) => c.trim().toLowerCase() === key))
    .map((e) => ({ start: e.start, stop: e.end && e.end > e.start ? e.end : e.start + EVENT_DEFAULT_MS, title: e.title, desc: e.competition ?? "" }))
    .filter((e) => e.stop > from && e.start < to)
    .sort((a, b) => a.start - b.start);
  const out: { start: number; stop: number; title: string; desc: string }[] = [];
  let at = from;
  for (const e of mine) {
    const start = Math.max(e.start, at);
    if (start >= e.stop) continue;
    if (start > at) out.push({ start: at, stop: start, title: NO_EVENT, desc: "" });
    out.push({ ...e, start });
    at = e.stop;
  }
  if (at < to) out.push({ start: at, stop: to, title: NO_EVENT, desc: "" });
  return out;
}

/** Sports Guide events take their time slot; real-guide programmes fill the rest. */
export function overlayEvents<T extends { start: number; stop: number; title: string }>(real: T[], events: T[]): T[] {
  if (!events.length) return real;
  const keep = real.filter((p) => !events.some((e) => p.start < e.stop && p.stop > e.start));
  return [...keep, ...events].sort((a, b) => a.start - b.start);
}
