// Finds the pre-match press conference video on the official Middlesbrough FC
// YouTube channel for a given fixture. Uses the public channel RSS feed (no API
// key needed) and matches the video title against the opponent name.

const MFC_CHANNEL_ID = "UCdXWsJhkXzx5hFJGcxjy_5Q";
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${MFC_CHANNEL_ID}`;
const LOOKBACK_MS = 12 * 24 * 60 * 60 * 1000; // press conferences land a few days out

export type PressConference = {
  id: string;
  title: string;
  url: string;
  published: string | null;
};

const NOISE = new Set([
  "fc",
  "afc",
  "cf",
  "the",
  "club",
  "football",
  "association",
  "and",
  "city",
  "town",
  "united",
  "utd",
  "county",
  "rovers",
  "athletic",
  "albion",
  "wanderers",
  "hotspur",
  "forest",
]);

function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !NOISE.has(t));
}

function isBoro(name: string): boolean {
  return /middlesbrough|boro/i.test(name);
}

/** Opponent name for a Boro fixture (falls back to the away team). */
export function opponentOf(fx: { home_team: string; away_team: string }): string {
  return isBoro(fx.home_team) ? fx.away_team : fx.home_team;
}

function acronym(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  return words.map((w) => w[0]).join("");
}

function matchesOpponent(title: string, opponent: string): boolean {
  const t = title.toLowerCase();
  const oppTokens = tokens(opponent);
  const titleTokens = tokens(title);
  // Club acronyms as used in official titles ("QPR" for Queens Park Rangers).
  const acro = acronym(opponent);
  if (acro.length >= 3 && titleTokens.includes(acro)) return true;
  if (!oppTokens.length) return false;
  if (oppTokens.some((tok) => t.includes(tok))) return true;
  // Handle abbreviated club names in titles ("West Brom" ⊂ "West Bromwich Albion").
  return titleTokens.some((tt) => oppTokens.some((ot) => ot.startsWith(tt) || tt.startsWith(ot)));
}


/**
 * Returns the press conference video for this fixture, or null when the club
 * has not published one.
 */
export async function findPressConference(fx: {
  home_team: string;
  away_team: string;
  kickoff_at: string;
}): Promise<PressConference | null> {
  let xml = "";
  try {
    const res = await fetch(FEED_URL, { headers: { accept: "application/atom+xml" } });
    if (!res.ok) return null;
    xml = await res.text();
  } catch {
    return null;
  }

  const kickoff = Date.parse(fx.kickoff_at);
  const opponent = opponentOf(fx);
  const entries = xml.split("<entry>").slice(1);
  const candidates: PressConference[] = [];

  for (const entry of entries) {
    const id = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
    const title = decodeXml(entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "");
    const published = entry.match(/<published>([^<]+)<\/published>/)?.[1] ?? null;
    if (!id || !title) continue;
    if (!/press\s*conference|presser/i.test(title)) continue;
    if (!matchesOpponent(title, opponent)) continue;
    if (published && Number.isFinite(kickoff)) {
      const at = Date.parse(published);
      if (Number.isFinite(at) && (at < kickoff - LOOKBACK_MS || at > kickoff + 2 * 60 * 60 * 1000)) continue;
    }
    candidates.push({ id, title, url: `https://www.youtube.com/watch?v=${id}`, published });
  }

  candidates.sort((a, b) => Date.parse(b.published ?? "") - Date.parse(a.published ?? ""));
  return candidates[0] ?? null;
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
