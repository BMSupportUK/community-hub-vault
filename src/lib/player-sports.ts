import { applyChannelLinks, resolveInCategory, type ChannelLinks } from "./sports-channel-links";
import { parseSportsListingBlock } from "./sports-listing-format";
import { safePublicEventTitle } from "./public-guide-safety";
import { ukListingInstant } from "./import-time";

/** `passChannels` lists which of `channels` came only from sports-pass guides (apps group them separately). */
export type PlayerSportsEvent = { sport: string; subcategory: string; competition: string; title: string; date: string | null; time: string; start: number; channels: string[]; passChannels: string[]; teamChannels?: boolean; channelCountry?: Record<string, string> };

/** "EFL : CHAMPIONSHIP: Derby County v Bolton" → "Derby County v Bolton"; keeps mixed-case prefixes ("UFC Fight Night Preview Show: …"). */
export function cardTitle(title: string): string {
  const i = title.lastIndexOf(":");
  if (i <= 0) return title;
  const prefix = title.slice(0, i), rest = title.slice(i + 1).trim();
  return !/[a-z]/.test(prefix) && /[A-Z]/.test(prefix) && fixtureTeams(rest) ? rest : title;
}

const WINDOW_BACK = 6 * 3600_000, WINDOW_AHEAD = 7 * 86400_000;
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
export function fixtureTeams(title: string): [string[], string[]] | null {
  const body = title.includes(":") ? title.slice(title.lastIndexOf(":") + 1) : title;
  const parts = body.split(/\s+(?:v|vs\.?|versus|-|–|—|@)\s+/i);
  if (parts.length !== 2) return null;
  const a = teamTokens(parts[0]), b = teamTokens(parts[1]);
  return a.length && b.length ? [a, b] : null;
}

/** "Derby" matches "Derby County"; "Arsenal" never matches "Arsenal Women". */
function sameTeam(a: string[], b: string[]): boolean {
  if (a[0] !== b[0]) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (!short.every((t) => long.includes(t))) return false;
  return long.every((t) => !SIDE_MARKERS.has(t) || short.includes(t));
}

export function sameFixture(x: string, y: string): boolean {
  const fx = fixtureTeams(x), fy = fixtureTeams(y);
  if (!fx || !fy) return x.toLowerCase().replace(/\b(vs?\.?|versus)\b/g, "v").replace(/[^a-z0-9]+/g, " ").trim()
    === y.toLowerCase().replace(/\b(vs?\.?|versus)\b/g, "v").replace(/[^a-z0-9]+/g, " ").trim();
  return sameTeam(fx[0], fy[0]) && sameTeam(fx[1], fy[1]);
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
  type Card = PlayerSportsEvent & { pass: boolean; mainSet: Set<string> };
  const out: Card[] = [];
  for (const g of guides) {
    const pass = isPassGuide(g);
    const clubGuide = [g.parent, g.category, g.title].some((x) => /ifollow|scot/i.test(x ?? ""));
    for (const e of parseSportsListingBlock(g.body ?? "")) {
      if (!safePublicEventTitle(e)) continue;
      const start = ukListingInstant(e.date, e.time);
      if (start == null || start < nowMs - WINDOW_BACK || start > nowMs + WINDOW_AHEAD) continue;
      const links = g.links ?? {};
      const catList = links.category ? categoryChannels?.get(links.category.toLowerCase()) : undefined;
      const channels = e.channels
        .map((c) => (catList?.length ? resolveInCategory(c, catList, links) ?? applyChannelLinks(c, links) : applyChannelLinks(c, links)))
        .filter(Boolean);
      const ev: Card = { sport: g.parent || g.category || g.title, subcategory: g.parent ? g.category ?? "" : "", competition: g.title, title: cardTitle(e.title), date: e.date, time: e.time, start,
        channels: [], passChannels: [], pass, mainSet: new Set() };
      // One card per game: every guide listing the same game adds its channels to that card.
      const existing = out.find((c) => Math.abs(c.start - start) <= SAME_GAME_MS && sameFixture(c.title, e.title));
      const target = existing ?? ev;
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
      if (links.country) for (const c of channels) (target.channelCountry ??= {})[c] = links.country;
      if (!existing) out.push(ev);
    }
  }
  return out.sort((a, b) => a.start - b.start).slice(0, 400).map(({ pass: _p, mainSet: _m, ...ev }) => ev);
}
