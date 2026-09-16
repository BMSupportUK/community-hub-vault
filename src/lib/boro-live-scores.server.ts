// Server-only live score + cup-fixture syncer for the Boro 26/27 predictions
// page. Every read comes from FotMob (the only match data provider this app
// uses) so live scores and newly-drawn cup ties show up without admin
// intervention.

import { fotmobMatchDetails, fotmobTeamData } from "@/lib/fotmob-fetch";

export type BoroLiveMatch = {
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
  matchId: string;
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
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}

/** FotMob writes the live clock as "62'" or "45+2'". */
function parseLiveClock(raw: string | null | undefined) {
  const text = String(raw ?? "").replace(/[^0-9+]/g, "");
  if (!text) return { minute: null as number | null, minuteAdded: null as number | null };
  const [baseStr, addedStr] = text.split("+");
  const base = parseInt(baseStr ?? "", 10);
  const added = parseInt(addedStr ?? "", 10);
  return {
    minute: Number.isFinite(base) ? base : null,
    minuteAdded: Number.isFinite(added) ? added : null,
  };
}

const num = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * Every Middlesbrough match FotMob currently lists — league and cups alike.
 * Matches may be scheduled, in-play or finished. In-play games get a second
 * request for the live clock and red cards.
 */
export async function fetchBoroLiveMatches(): Promise<BoroLiveMatch[]> {
  const data = await fotmobTeamData(15_000);
  const fixtures: any[] = data?.fixtures?.allFixtures?.fixtures ?? [];
  const now = Date.now();

  const base: BoroLiveMatch[] = [];
  for (const fixture of fixtures) {
    const homeName = String(fixture?.home?.name ?? "");
    const awayName = String(fixture?.away?.name ?? "");
    if (!homeName || !awayName) continue;
    if (!isBoro(homeName) && !isBoro(awayName)) continue;
    const kickoffMs = Date.parse(String(fixture?.status?.utcTime ?? ""));
    if (!Number.isFinite(kickoffMs)) continue;
    if (fixture?.status?.cancelled) continue;

    const finished = !!fixture?.status?.finished;
    const started = !!fixture?.status?.started;
    base.push({
      competition: String(fixture?.tournament?.name ?? "Football"),
      home: homeName,
      away: awayName,
      kickoffMs,
      venue: null,
      status: finished ? "FINISHED" : started ? "IN_PLAY" : "SCHEDULED",
      minute: null,
      minuteAdded: null,
      homeScore: num(fixture?.home?.score),
      awayScore: num(fixture?.away?.score),
      homeReds: 0,
      awayReds: 0,
      matchId: String(fixture?.id ?? ""),
    });
  }

  // Only in-play games (and ones that kicked off in the last four hours) need
  // the detail feed — that keeps the worker well inside its request budget.
  const needDetail = base.filter(
    (match) =>
      match.status === "IN_PLAY" ||
      (match.status !== "SCHEDULED" &&
        match.kickoffMs <= now &&
        match.kickoffMs > now - 4 * 60 * 60 * 1000),
  );

  await Promise.all(
    needDetail.slice(0, 3).map(async (match) => {
      if (!match.matchId) return;
      const detail = await fotmobMatchDetails(match.matchId, 10_000);
      const status = detail?.header?.status;
      if (!status) return;
      const reasonShort = String(status?.reason?.short ?? "").toUpperCase();
      const finished = !!status?.finished;
      match.status = finished
        ? "FINISHED"
        : status?.started
          ? reasonShort === "HT"
            ? "PAUSED"
            : "IN_PLAY"
          : "SCHEDULED";
      if (match.status === "IN_PLAY") {
        const clock = parseLiveClock(
          status?.liveTime?.short ?? status?.liveTime?.long ?? reasonShort,
        );
        match.minute = clock.minute;
        match.minuteAdded = clock.minuteAdded;
      }
      const teams: any[] = detail?.header?.teams ?? [];
      match.homeScore = num(teams[0]?.score) ?? match.homeScore;
      match.awayScore = num(teams[1]?.score) ?? match.awayScore;

      const events: any[] = detail?.content?.matchFacts?.events?.events ?? [];
      let homeReds = 0;
      let awayReds = 0;
      for (const event of events) {
        if (!/red/i.test(String(event?.card ?? ""))) continue;
        if (event?.isHome) homeReds += 1;
        else awayReds += 1;
      }
      match.homeReds = homeReds;
      match.awayReds = awayReds;

      const stadium = detail?.content?.matchFacts?.infoBox?.Stadium;
      if (stadium?.name) match.venue = String(stadium.name);
    }),
  );

  const byKey = new Map<string, BoroLiveMatch>();
  for (const match of base) {
    byKey.set(`${match.competition}|${match.kickoffMs}|${norm(match.home)}|${norm(match.away)}`, match);
  }
  return [...byKey.values()];
}

const LEAGUE_RE = /championship|premier league|league one|league two|efl league|sky bet/i;

/**
 * Find an existing boro_fixtures row that corresponds to a FotMob match.
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
  ev: BoroLiveMatch,
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
