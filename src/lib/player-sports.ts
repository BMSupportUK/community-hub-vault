import { applyChannelLinks, channelInCountry, resolveInCategory, type ChannelLinks } from "./sports-channel-links";
import { parseSportsListingBlock, isClubChannelGuide, fixtureTeams as clubNames } from "./sports-listing-format";
import { safePublicEventTitle } from "./public-guide-safety";
import { ukListingInstant } from "./import-time";

/** `passChannels` lists which of `channels` came only from sports-pass guides (apps group them separately). */
export type PlayerSportsEvent = { sport: string; subcategory: string; competition: string; title: string; date: string | null; time: string; start: number; channels: string[]; passChannels: string[]; teamChannels?: boolean; channelCountry?: Record<string, string>; end?: number; endSource?: "epg" | "estimate" };

/** "EFL : CHAMPIONSHIP: Derby County v Bolton" → "Derby County v Bolton"; keeps mixed-case prefixes ("UFC Fight Night Preview Show: …"). */
export function cardTitle(title: string): string {
  const i = title.lastIndexOf(":");
  if (i <= 0) return title;
  const prefix = title.slice(0, i), rest = title.slice(i + 1).trim();
  // Numbered event brands ("BKFC 96", "UFC 300") stay in the title so search/voice can find them.
  if (/\d/.test(prefix)) return title;
  return !/[a-z]/.test(prefix) && /[A-Z]/.test(prefix) && fixtureTeams(rest) ? rest : title;
}

/** Finished games stay this long (dimmed) before dropping off. */
export const FINISHED_KEEP_MS = 2 * 3600_000;
const WINDOW_BACK = 10 * 3600_000, WINDOW_AHEAD = 7 * 86400_000;
/** Guides list the same game with different kick-off/coverage times (e.g. 19:20 build-up, 19:57, 20:00). */
const SAME_GAME_MS = 90 * 60_000;
const MAX_CHANNELS = 30;
/** Markers that make a different team (women's, youth, reserve sides) — never merge across them. */
const SIDE_MARKERS = new Set(["women", "w", "ladies", "u17", "u18", "u19", "u20", "u21", "u23", "ii", "b", "reserves", "youth"]);
const FILLER = new Set(["fc", "afc", "cf", "sc", "the"]);

function teamTokens(name: string): string[] {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter((t) => t && !FILLER.has(t));
}

/** The two teams of a "Home v Away" / "Home - Away" title, ignoring any "COMPETITION:" prefix. */
export function fixtureTeams(title: string, context = ""): [string[], string[]] | null {
  // HBO appends competition/session text AFTER the teams, unlike prefixed TV guides.
  const separator = /\s+(?:v|vs\.?|versus|-|–|—|@)\s+/i.exec(title);
  const before = separator ? title.slice(0, separator.index) : title;
  const prefixEnd = before.lastIndexOf(":");
  let body = title.slice(prefixEnd + 1).split(":")[0].trim();
  const aflw = /\baflw\b/i.test(title) || /aussie rules.*women|women.*aussie rules/i.test(context);
  body = body.replace(/\s+(?:AFLW|A-League(?: Women)?|NWSL|The Emirates FA Cup|International Championship|Premier League|Men(?:'s)?(?: Group Stage)?|Main Card|Preliminary)\b.*$/i, "");
  if (aflw) body = body.replace(/\bGeelong Cats\b/i, "Geelong");
  const parts = body.split(/\s+(?:v|vs\.?|versus|-|–|—|@)\s+/i);
  if (parts.length !== 2) return null;
  const a = teamTokens(parts[0]), b = teamTokens(parts[1]);
  if (aflw) { a.push("women"); b.push("women"); }
  return a.length && b.length ? [a, b] : null;
}

/** "Derby" matches "Derby County"; "Arsenal" never matches "Arsenal Women". */
/** One typo in a long name ("ALTRINVHAM" vs "Altrincham") is still the same word. */
function nearWord(x: string, y: string): boolean {
  if (x === y) return true;
  if (x.length < 6 || x.length !== y.length || /\d/.test(x + y)) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i] && ++diff > 1) return false;
  return true;
}

function sameTeam(a: string[], b: string[]): boolean {
  if (!nearWord(a[0], b[0])) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (!short.every((t, i) => long.includes(t) || (i === 0 && nearWord(t, long[0])))) return false;
  return long.every((t) => !SIDE_MARKERS.has(t) || short.includes(t));
}

export function sameFixture(x: string, y: string, xContext = "", yContext = ""): boolean {
  const fx = fixtureTeams(x, xContext), fy = fixtureTeams(y, yContext);
  if (!fx || !fy) return x.toLowerCase().replace(/\b(vs?\.?|versus)\b/g, "v").replace(/[^a-z0-9]+/g, " ").trim()
    === y.toLowerCase().replace(/\b(vs?\.?|versus)\b/g, "v").replace(/[^a-z0-9]+/g, " ").trim();
  return sameTeam(fx[0], fy[0]) && sameTeam(fx[1], fy[1]);
}

/**
 * Shows without a "Home v Away" pair (fight cards, race sessions) are named differently
 * by every guide. Key them by series + event/session so they share one card:
 * "BKFC 96: Cooke v Weir" = "BKFC 96 Glasgow: Prelims"; "Qatar : Moto GP Sprint" =
 * "MotoGP: Round 20: Qatar Sprint Race"; "Sao Paulo : Practice 3" (F1 guide) = "São Paulo Grand Prix Practice 3".
 * Returns "series|session"; an empty session means the guide gave no session (matches any of that series).
 */
export function seriesKey(title: string, context = ""): string | null {
  const t = title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const c = context.toLowerCase();
  const fight = /\b(bkfc|ufc|pfl|cage warriors|oktagon)\s*(?:fight night\s*)?(\d+)\b/.exec(t);
  if (fight) return `${fight[1]}|${fight[2]}`;
  // Snooker: "Snooker International Championship: Final" = "Kyren Wilson - John Higgins International Championship: Final".
  const cue = /\b(international|uk|world|scottish|welsh|english|northern ireland|german|shanghai|wuhan|british|xian) (championship|open|masters)\b(?:\s*:\s*([a-z0-9 -]+))?/.exec(t);
  if (cue && (/\bsnooker\b/.test(`${t} ${c}`) || /\s(?:-|–|v|vs)\s/.test(t))) {
    const stage = (cue[3] ?? "").replace(/[^a-z0-9]+/g, " ").trim();
    return `snooker|${cue[1]} ${cue[2]}|${stage}`;
  }
  if (/\bsupercars\b/.test(`${t} ${c}`)) {
    const race = /\brace\s*(\d+)\b/.exec(t);
    const venue = t.replace(/\bsupercars\b|\bchampionship\b|\brace\s*\d+\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
    if (race && venue) return `supercars|${venue}|race${race[1]}`;
  }
  let series: string | null = null;
  if (/moto\s?gp/.test(t) || (/moto\s?gp/.test(c) && !/\bf1\b|formula|\bmoto\s*[234]\b/.test(t))) series = "motogp";
  else if (/\bf1\b|formula 1|formula one|grand prix/.test(t) || /\bf1\b|formula 1|formula one/.test(c)) series = "f1";
  if (!series) return null;
  if (/formula\s*\d\s*,/.test(t)) return null; // "Formula 3,2,1" magazine show
  const p = /(?:practice|fp)\s*(\d)/.exec(t);
  const session = p ? `p${p[1]}` : /sprint\s*(?:shoot|qual)/.test(t) ? "sprintq" : /sprint/.test(t) ? "sprint"
    : /qual/.test(t) ? "qual" : /\brace\b|grand prix$/.test(t.trim()) ? "race" : "";
  return `${series}|${session}`;
}

function sameSeriesEvent(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [sa, xa] = a.split("|"), [sb, xb] = b.split("|");
  return sa === sb && (sa === "motogp" || sa === "f1" || sa === "snooker") && (!xa || !xb);
}

const isPassGuide = (g: { title: string; category: string | null; parent?: string | null }) =>
  [g.parent, g.category, g.title].some((s) => /sports?\s*pass/i.test(s ?? ""));

/** Turn published guides into a validated event list for BM Player. */
export function playerSportsEvents(
  guides: { title: string; body: string | null; category: string | null; parent?: string | null; links?: ChannelLinks }[],
  nowMs = Date.now(),
  /** Playlist channel names per lower-cased category name, for guides linked to a category. */
  categoryChannels?: Map<string, string[]>,
): PlayerSportsEvent[] {
  type Card = PlayerSportsEvent & { pass: boolean; mainSet: Set<string>; seriesKey: string | null };
  const out: Card[] = [];
  for (const g of guides) {
    const pass = isPassGuide(g);
    const clubGuide = isClubChannelGuide(g.title);
    for (const e of parseSportsListingBlock(g.body ?? "")) {
      if (!safePublicEventTitle(e)) continue;
      const start = ukListingInstant(e.date, e.time);
      if (start == null || start < nowMs - WINDOW_BACK || start > nowMs + WINDOW_AHEAD) continue;
      const links = g.links ?? {};
      const catList = links.category ? categoryChannels?.get(links.category.toLowerCase()) : undefined;
      // Older stored club guides may still carry only the placeholder. Add club names
      // on read as well as save, retaining actual broadcasters for the same fixture.
      const sourceChannels = [...e.channels.filter((c) => !clubGuide || !/^under team channels$/i.test(c))];
      if (clubGuide) {
        const teams = clubNames(cardTitle(e.title));
        for (let i = sourceChannels.length - 1; i >= 0; i--) {
          const c = sourceChannels[i];
          if (c.includes(":") && teams.some((t) => t.toLowerCase() === c.slice(c.lastIndexOf(":") + 1).trim().toLowerCase())) sourceChannels.splice(i, 1);
        }
        if (teams.length === 2) for (const team of teams) if (!sourceChannels.some((c) => c.toLowerCase() === team.toLowerCase())) sourceChannels.push(team);
      }
      const onboard = /^on[- ]board\s*\d*$/i.test(e.title.trim());
      const onboardIdentity = onboard ? `${e.title} ${sourceChannels.join(" ")}` : e.title;
      // Pipe-separated race metadata in HBO on-board rows is not a list of extra TV channels.
      const channelNames = onboard ? sourceChannels.filter(c => !/^moto\s*gp$|^round\s*\d+$|sprint race$/i.test(c.trim())) : sourceChannels;
      const channels = channelNames
        .map((c) => (catList?.length ? resolveInCategory(c, catList, links) ?? applyChannelLinks(c, links) : applyChannelLinks(c, links)))
        .filter(Boolean);
      const ev: Card = { sport: g.parent || g.category || g.title, subcategory: g.parent ? g.category ?? "" : "", competition: g.title, title: cardTitle(e.title), date: e.date, time: e.time, start,
        channels: [], passChannels: [], pass, mainSet: new Set(), seriesKey: null };
      // One card per game: every guide listing the same game adds its channels to that card.
      const context = `${g.title} ${g.category ?? ""} ${g.parent ?? ""}`;
      // On-board rows carry the actual race/session in their supplied channel suffix.
      const key = seriesKey(onboardIdentity, context);
      const existing = out.find((c) => Math.abs(c.start - start) <= SAME_GAME_MS && (sameFixture(c.title, e.title, `${c.sport} ${c.subcategory} ${c.competition}`, context) || sameSeriesEvent(c.seriesKey, key)));
      const target = existing ?? ev;
      const prevKey = existing?.seriesKey ?? null;
      if (!pass) for (const c of channels) target.mainSet.add(c.toLowerCase());
      // Club-feed guides (iFollow, Scottish) list the two clubs; apps then find each club's own channels.
      const club = clubGuide || !!target.teamChannels;
      let merged: string[];
      if (existing && existing.pass && !pass) {
        // A proper competition guide beats a sports-pass listing for the card's name and time.
        const old = existing.channels, keep = existing.mainSet;
        Object.assign(existing, { ...ev, mainSet: keep });
        merged = [...channels, ...old];
      } else merged = [...target.channels, ...channels];
      const seen = new Set<string>();
      target.channels = merged.filter((c) => { const k = c.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, MAX_CHANNELS);
      target.passChannels = target.channels.filter((c) => !target.mainSet.has(c.toLowerCase()));
      if (club) target.teamChannels = true;
      // Keep the most specific session key ("motogp|sprint" over "motogp|").
      target.seriesKey = prevKey && prevKey.split("|")[1] ? prevKey : key ?? prevKey;
      // Verified category membership supplies the country when the exact channel
      // name has no country tag. Unresolved names still need the app's country
      // filter, and tagged names retain it so US Paramount never selects AU.
      // Category brands (EPL, VIP, UFC) are not countries. Sending them as
      // country restrictions makes players discard otherwise real channels.
      const prefix = /^\s*([A-Z]{2,3})\s*\|/i.exec(links.category ?? "")?.[1]?.toUpperCase();
      const categoryCountry = prefix && /^(?:UK|GB|US|USA|AU|AUS|CA|FR|DE|IE|IRE|ZA|NZ|ES|IT|PT|NL|BE|AT|CH|SE|NO|DK|FI|PL|CZ|GR|TR|IN|JP|KR|HK|SG|MY|TH|AE|SA|BR|MX|AR)$/.test(prefix) ? prefix : undefined;
      const country = links.country || categoryCountry;
      if (country) for (const c of channels) {
        const verifiedCategoryCountry = country === categoryCountry && catList?.includes(c);
        if (!verifiedCategoryCountry || channelInCountry(c, country)) (target.channelCountry ??= {})[c] = country;
      }
      if (!existing) out.push(ev);
    }
  }
  return out
    .map(({ pass: _p, mainSet: _m, seriesKey: _k, ...ev }) => ({ ...ev, end: ev.start + typicalLengthMs(`${ev.sport} ${ev.subcategory} ${ev.competition} ${ev.title}`), endSource: "estimate" as const }))
    .filter((ev) => ev.end + FINISHED_KEEP_MS > nowMs)
    .sort((a, b) => a.start - b.start).slice(0, 400);
}

const H = 3600_000;
/** Standard length of a game when no TV guide entry says when it ends. */
export function typicalLengthMs(text: string): number {
  const t = text.toLowerCase();
  if (/cricket|test match/.test(t)) return 8 * H;
  if (/\bufc\b|boxing|\bmma\b|fight night|wrestling|\bwwe\b/.test(t)) return 5 * H;
  if (/darts|snooker/.test(t)) return 4 * H;
  if (/\bnfl\b|american football|sunday ticket/.test(t)) return 3.5 * H;
  if (/tennis/.test(t)) return 3 * H;
  if (/\bf1\b|formula|motorsport|moto ?gp|indycar|nascar|grand prix|racing/.test(t)) return 2.5 * H;
  if (/\bnba\b|\bnhl\b|basketball|hockey|league pass|center ice/.test(t)) return 2.5 * H;
  if (/football|soccer|rugby|premier league|efl|championship|cymru|ifollow|scottish|\bfa\b|uefa|champions league/.test(t)) return 2 * H;
  return 3 * H;
}

/** Overwrite estimates with real TV-guide end times (keyed by channel name, lower-cased) and drop long-finished games. */
export function applyGuideEnds(events: PlayerSportsEvent[], ends: Map<string, { start: number; end: number }[]>, nowMs = Date.now()): PlayerSportsEvent[] {
  return events.map((ev) => {
    for (const c of ev.channels) {
      const hit = ends.get(c.toLowerCase())?.find((p) => p.start <= ev.start + 30 * 60_000 && p.end > ev.start + 30 * 60_000);
      if (hit) return { ...ev, end: hit.end, endSource: "epg" as const };
    }
    return ev;
  }).filter((ev) => (ev.end ?? Infinity) + FINISHED_KEEP_MS > nowMs);
}

/** "live" between start and end, "finished" after end, otherwise "upcoming". */
export function sportsEventState(ev: { start: number; end?: number }, nowMs = Date.now()): "upcoming" | "live" | "finished" {
  if (nowMs < ev.start) return "upcoming";
  return ev.end != null && nowMs >= ev.end ? "finished" : "live";
}
