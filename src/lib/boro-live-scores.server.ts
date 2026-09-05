// Server-only live score + cup-fixture syncer for the Boro 26/27 predictions
// page. We poll ESPN's public scoreboard across the Championship + the
// domestic cups so live scores and newly-drawn cup ties show up without
// admin intervention. ESPN is keyless and updates in near real time.

import { espnJson, espnDateRange } from "@/lib/espn-fetch";

const ESPN_COMPETITIONS: Array<{ slug: string; name: string }> = [
  { slug: "eng.2", name: "Championship" },
  { slug: "eng.fa", name: "FA Cup" },
  { slug: "eng.league_cup", name: "Carabao Cup" },
  { slug: "eng.trophy", name: "EFL Trophy" },
];

export type EspnBoroMatch = {
  competition: string;
  home: string;
  away: string;
  kickoffMs: number;
  venue: string | null;
  status: string;
  minute: number | null;
  minuteAdded: number | null;
  homeScore: number | null;
  awayScore: number | null;
  homeReds: number;
  awayReds: number;
};

export type BoroFixtureRow = {
  id: string;
  competition: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  venue: string | null;
  home_score: number | null;
  away_score: number | null;
  status: string | null;
  minute: number | null;
  minute_added: number | null;
  home_reds?: number | null;
  away_reds?: number | null;
};

function norm(s: string | null | undefined) {
  return (s ?? "")
    .toLowerCase()
    .replace(/\bfc\b|\bafc\b|\bf\.c\.\b/g, "")
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isBoro(name: string) {
  return /\bmiddles(?:brough|borough)\b|\bboro\b/i.test(name);
}

function nameMatches(a: string, b: string) {
  const na = norm(a);
  const nb = norm(b);
  if (na === nb) return true;
  // Handle "Middlesbrough" vs "Middlesbrough FC" etc — norm already strips
  // those, but cover short/long names of cup opponents too.
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}

function parseMinute(displayClock?: string, rawClock?: number, state?: string) {
  if (state !== "in") return { minute: null, minuteAdded: null };
  const [baseStr, addedStr] = (displayClock ?? "").split("+");
  const base = parseInt(baseStr ?? "", 10);
  const added = parseInt(addedStr ?? "", 10);
  const minute = Number.isFinite(base)
    ? base
    : typeof rawClock === "number" && rawClock > 0
      ? Math.max(1, Math.ceil(rawClock / 60))
      : null;
  return { minute, minuteAdded: Number.isFinite(added) ? added : null };
}

type EspnJson = {
  events?: Array<{
    date?: string;
    competitions?: Array<{
      venue?: { fullName?: string };
      status?: {
        clock?: number;
        displayClock?: string;
        type?: { state?: string; name?: string };
      };
      competitors?: Array<{
        id?: string;
        homeAway?: string;
        score?: string;
        team?: { id?: string; displayName?: string; shortDisplayName?: string };
      }>;
      details?: Array<{
        type?: { id?: string; text?: string };
        team?: { id?: string };
      }>;
    }>;
  }>;
};

/**
 * Pull every Middlesbrough match ESPN currently has across the configured
 * competitions for a ±1 day window. Returned matches may be scheduled,
 * in-play or finished.
 */
export async function fetchEspnBoroLive(): Promise<EspnBoroMatch[]> {
  const debug = (globalThis as { __espnDebug?: { ok: number; bad: number; total: number } }).__espnDebug = { ok: 0, bad: 0, total: 0 };
  // Two date-range snapshots per competition: a tight live window (so an
  // in-play match is always picked up) and a long forward window for freshly
  // drawn cup ties. Workers cap each request at 50 subrequests, and the old
  // month-by-month loop burned all 50 on ESPN alone — every fetch then failed.
  const now = Date.now();
  const ranges = [
    espnDateRange(now - 2 * 86_400_000, now + 3 * 86_400_000),
    espnDateRange(now, now + 300 * 86_400_000),
  ];

  const urls: Array<{ url: string; competition: string }> = [];
  for (const c of ESPN_COMPETITIONS) {
    for (const range of ranges) {
      urls.push({
        url: `https://site.api.espn.com/apis/site/v2/sports/soccer/${c.slug}/scoreboard?dates=${range}&limit=400`,
        competition: c.name,
      });
    }
  }

  const responses = await Promise.all(
    urls.map(({ url, competition }) =>
      espnJson<EspnJson>(url).then((json) => {
        debug.total += 1;
        if (json) debug.ok += 1;
        else debug.bad += 1;
        return { json: (json ?? { events: [] }) as EspnJson, competition };
      }),
    ),
  );

  const byKey = new Map<string, EspnBoroMatch>();
  for (const { json, competition } of responses) {
    for (const e of json.events ?? []) {
      const comp = e.competitions?.[0];
      if (!comp || !e.date) continue;
      const home = comp.competitors?.find((c) => c.homeAway === "home");
      const away = comp.competitors?.find((c) => c.homeAway === "away");
      const homeName = home?.team?.displayName ?? "";
      const awayName = away?.team?.displayName ?? "";
      if (!homeName || !awayName) continue;
      if (!isBoro(homeName) && !isBoro(awayName)) continue;
      const state = comp.status?.type?.state ?? "pre";
      const typeName = comp.status?.type?.name ?? "";
      const status =
        state === "post"
          ? "FINISHED"
          : state === "in"
            ? typeName === "STATUS_HALFTIME"
              ? "PAUSED"
              : "IN_PLAY"
            : "SCHEDULED";
      const parsed = parseMinute(comp.status?.displayClock, comp.status?.clock, state);
      const homeTeamId = home?.team?.id ?? home?.id ?? "";
      const awayTeamId = away?.team?.id ?? away?.id ?? "";
      let homeReds = 0;
      let awayReds = 0;
      for (const d of comp.details ?? []) {
        const txt = d.type?.text ?? "";
        if (!/red/i.test(txt)) continue;
        const tid = d.team?.id ?? "";
        if (tid && tid === homeTeamId) homeReds += 1;
        else if (tid && tid === awayTeamId) awayReds += 1;
      }
      const m: EspnBoroMatch = {
        competition,
        home: homeName,
        away: awayName,
        kickoffMs: new Date(e.date).getTime(),
        venue: comp.venue?.fullName ?? null,
        status,
        minute: parsed.minute,
        minuteAdded: parsed.minuteAdded,
        homeScore: home?.score != null && home.score !== "" ? Number(home.score) : null,
        awayScore: away?.score != null && away.score !== "" ? Number(away.score) : null,
        homeReds,
        awayReds,
      };
      const key = `${competition}|${e.date}|${norm(homeName)}|${norm(awayName)}`;
      byKey.set(key, m);
    }
  }
  return [...byKey.values()];
}

const LEAGUE_RE = /championship|premier league|league one|league two|efl league|sky bet/i;

/**
 * Find an existing boro_fixtures row that corresponds to an ESPN event.
 * We match on opponent + a wide date window so re-scheduled cup ties still
 * line up with whatever the admin/scraper already inserted.
 *
 * League fixtures are played exactly once per season for a given home/away
 * pair, so when the date window misses (e.g. the game was moved for TV by more
 * than a few days) we still match on the teams alone. Without that fallback the
 * live-score sync inserted a second copy of the same league game.
 */
export function findBoroFixture(
  fixtures: BoroFixtureRow[],
  ev: EspnBoroMatch,
): BoroFixtureRow | undefined {
  const sameTeams = fixtures.filter(
    (f) => nameMatches(f.home_team, ev.home) && nameMatches(f.away_team, ev.away),
  );
  const nearest = (rows: BoroFixtureRow[]) =>
    [...rows].sort(
      (a, b) =>
        Math.abs(new Date(a.kickoff_at).getTime() - ev.kickoffMs) -
        Math.abs(new Date(b.kickoff_at).getTime() - ev.kickoffMs),
    )[0];

  const withinWindow = sameTeams.filter(
    (f) =>
      Math.abs(new Date(f.kickoff_at).getTime() - ev.kickoffMs) <= 3 * 24 * 60 * 60 * 1000,
  );
  if (withinWindow.length > 0) return nearest(withinWindow);

  // Same league pairing anywhere in the season → same fixture, just moved.
  if (LEAGUE_RE.test(ev.competition ?? "")) {
    const leagueRows = sameTeams.filter((f) => LEAGUE_RE.test(f.competition ?? ""));
    if (leagueRows.length > 0) return nearest(leagueRows);
  }
  return undefined;
}
