// Match centre feed. FotMob is the single source of truth — ESPN is no longer
// used anywhere in the Boro match centre.
import type {
  LastResult,
  NextFixture,
  LiveMatch,
  LeaguePosition,
} from "@/lib/boro-match-centre.functions";

const BORO_TEAM_ID = 8549;
const BORO_TEAM_RE = /\bmiddles(?:brough|borough)\b|\bboro\b/i;
const TEAM_URL = `https://www.fotmob.com/api/data/teams?id=${BORO_TEAM_ID}`;
const FETCH_TIMEOUT_MS = 8_000;

const norm = (value: string) => value.toLowerCase().replace(/[^a-z]/g, "");

export function fotmobLogo(teamId: string | number | null | undefined) {
  if (!teamId) return null;
  return `https://images.fotmob.com/image_resources/logo/teamlogo/${teamId}.png`;
}

async function teamData(): Promise<any | null> {
  try {
    const response = await fetch(TEAM_URL, {
      headers: {
        accept: "application/json",
        "user-agent": "Mozilla/5.0 (compatible; BoroSupport/1.0)",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error("[boro-match-centre] fotmob team feed refused", response.status);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error("[boro-match-centre] fotmob team feed failed", String(error));
    return null;
  }
}

type ParsedFixture = {
  id: string;
  t: number;
  iso: string;
  competition: string;
  home: string;
  away: string;
  homeId: string | null;
  awayId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  finished: boolean;
  started: boolean;
  cancelled: boolean;
};

function parseFixtures(data: any): ParsedFixture[] {
  const fixtures: any[] = data?.fixtures?.allFixtures?.fixtures ?? [];
  return fixtures
    .map((fixture): ParsedFixture | null => {
      const t = Date.parse(String(fixture?.status?.utcTime ?? ""));
      if (!Number.isFinite(t)) return null;
      const home = String(fixture?.home?.name ?? "");
      const away = String(fixture?.away?.name ?? "");
      if (!home || !away) return null;
      if (!BORO_TEAM_RE.test(home) && !BORO_TEAM_RE.test(away)) return null;
      const num = (value: unknown) => (typeof value === "number" ? value : null);
      return {
        id: String(fixture?.id ?? ""),
        t,
        iso: new Date(t).toISOString(),
        competition: String(fixture?.tournament?.name ?? "Championship"),
        home,
        away,
        homeId: fixture?.home?.id != null ? String(fixture.home.id) : null,
        awayId: fixture?.away?.id != null ? String(fixture.away.id) : null,
        homeScore: num(fixture?.home?.score),
        awayScore: num(fixture?.away?.score),
        finished: !!fixture?.status?.finished,
        started: !!fixture?.status?.started,
        cancelled: !!fixture?.status?.cancelled,
      };
    })
    .filter((x): x is ParsedFixture => x !== null && !x.cancelled)
    .sort((a, b) => a.t - b.t);
}

/** Last result, weekly next fixture and the in-play match, all from FotMob. */
export async function fetchFotmobBoro(): Promise<{
  lastResult: LastResult | null;
  nextFixture: NextFixture | null;
  liveMatch: LiveMatch | null;
}> {
  const data = await teamData();
  if (!data) throw new Error("FotMob team feed unavailable");
  const parsed = parseFixtures(data);
  const now = Date.now();

  const past = parsed.filter((p) => p.finished && p.homeScore !== null && p.awayScore !== null);
  const future = parsed.filter((p) => !p.finished);

  const { pickWeeklyFixture } = await import("@/lib/boro-match-week");
  const lastRaw = past[past.length - 1];
  const nextRaw = pickWeeklyFixture(
    parsed.map((p) => ({ row: p, t: p.t, completed: p.finished })),
    future.map((p) => ({ row: p, t: p.t, completed: false })),
    now,
  )?.row as ParsedFixture | undefined;

  const lastResult: LastResult | null = lastRaw
    ? {
        date: lastRaw.iso,
        competition: lastRaw.competition,
        home: lastRaw.home,
        away: lastRaw.away,
        homeScore: lastRaw.homeScore ?? 0,
        awayScore: lastRaw.awayScore ?? 0,
        venue: null,
        homeLogo: fotmobLogo(lastRaw.homeId),
        awayLogo: fotmobLogo(lastRaw.awayId),
        eventId: lastRaw.id,
        espnSlug: "fotmob",
      }
    : null;

  const nextFixture: NextFixture | null = nextRaw
    ? {
        kickoff: nextRaw.iso,
        competition: nextRaw.competition,
        home: nextRaw.home,
        away: nextRaw.away,
        venue: null,
        homeLogo: fotmobLogo(nextRaw.homeId),
        awayLogo: fotmobLogo(nextRaw.awayId),
        eventId: nextRaw.id,
        espnSlug: "fotmob",
      }
    : null;

  const liveRaw = parsed.find(
    (p) => !p.finished && p.started && p.t <= now && p.t > now - 4 * 60 * 60 * 1000,
  );

  let liveMatch: LiveMatch | null = null;
  if (liveRaw) {
    let statusDetail = "Live";
    let clock: string | null = null;
    let homeScore = liveRaw.homeScore ?? 0;
    let awayScore = liveRaw.awayScore ?? 0;
    let finished = false;
    try {
      const { fetchFotmobSummary } = await import("@/lib/fotmob-boro.server");
      const summary: any = await fetchFotmobSummary({
        home: liveRaw.home,
        away: liveRaw.away,
        kickoff: liveRaw.iso,
        matchId: liveRaw.id,
      });
      const competition = summary?.header?.competitions?.[0];
      const status = competition?.status;
      if (status) {
        statusDetail = String(status?.type?.shortDetail ?? status?.type?.detail ?? "Live");
        clock = status?.displayClock ?? null;
        finished = status?.type?.state === "post" || !!status?.type?.completed;
      }
      const competitors: any[] = competition?.competitors ?? [];
      const toNum = (value: unknown) => {
        const n = parseInt(String(value ?? ""), 10);
        return Number.isFinite(n) ? n : null;
      };
      homeScore = toNum(competitors[0]?.score) ?? homeScore;
      awayScore = toNum(competitors[1]?.score) ?? awayScore;
    } catch (error) {
      console.error("[boro-match-centre] fotmob live detail failed", String(error));
    }
    if (!finished) {
      liveMatch = {
        kickoff: liveRaw.iso,
        competition: liveRaw.competition,
        home: liveRaw.home,
        away: liveRaw.away,
        homeScore,
        awayScore,
        statusDetail,
        clock,
        inPlay: true,
        homeLogo: fotmobLogo(liveRaw.homeId),
        awayLogo: fotmobLogo(liveRaw.awayId),
        eventId: liveRaw.id,
        espnSlug: "fotmob",
      };
    }
  }

  return { lastResult, nextFixture, liveMatch };
}

/** Championship table around Boro, from FotMob's league table. */
export async function fetchFotmobStandings(): Promise<LeaguePosition | null> {
  const data = await teamData();
  if (!data) throw new Error("FotMob standings unavailable");
  const table = data?.table?.[0]?.data;
  const raw: any[] = table?.table?.all ?? table?.table ?? [];
  if (!Array.isArray(raw) || !raw.length) return null;

  const rows = raw.map((row, index) => {
    const name = String(row?.shortName ?? row?.name ?? "");
    return {
      position: Number(row?.idx ?? index + 1),
      team: name,
      played: Number(row?.played ?? 0),
      won: Number(row?.wins ?? 0),
      drawn: Number(row?.draws ?? 0),
      lost: Number(row?.losses ?? 0),
      goalDifference: Number(row?.goalConDiff ?? 0),
      points: Number(row?.pts ?? 0),
      isBoro: BORO_TEAM_RE.test(name) || Number(row?.id) === BORO_TEAM_ID,
    };
  });

  const boroIdx = rows.findIndex((row) => row.isBoro);
  if (boroIdx === -1) return null;
  const boro = rows[boroIdx]!;
  const slice = rows.slice(Math.max(0, boroIdx - 2), Math.min(rows.length, boroIdx + 3));

  return {
    competition: String(table?.leagueName ?? "EFL Championship"),
    position: boro.position,
    played: boro.played,
    won: boro.won,
    drawn: boro.drawn,
    lost: boro.lost,
    goalDifference: boro.goalDifference,
    points: boro.points,
    table: slice,
  };
}

/**
 * Resolve the FotMob match id (and logos) for a fixture we only know about
 * from our own tables or a manual admin entry, so the match centre popup has
 * a feed to poll.
 */
export async function withFotmobEvent(nf: NextFixture): Promise<NextFixture> {
  if (nf.eventId && nf.espnSlug === "fotmob") return nf;
  const ko = Date.parse(nf.kickoff);
  if (!Number.isFinite(ko)) return nf;
  const data = await teamData();
  if (!data) return nf;
  const wanted = [norm(nf.home), norm(nf.away)];
  let best: { fixture: ParsedFixture; distance: number } | null = null;
  for (const fixture of parseFixtures(data)) {
    const names = [norm(fixture.home), norm(fixture.away)];
    const hit = wanted.every((w) => names.some((n) => n.includes(w) || w.includes(n)));
    if (!hit) continue;
    const distance = Math.abs(fixture.t - ko);
    if (distance > 36 * 60 * 60 * 1000) continue;
    if (!best || distance < best.distance) best = { fixture, distance };
  }
  if (!best) return nf;
  return {
    ...nf,
    eventId: best.fixture.id,
    espnSlug: "fotmob",
    homeLogo: nf.homeLogo ?? fotmobLogo(best.fixture.homeId),
    awayLogo: nf.awayLogo ?? fotmobLogo(best.fixture.awayId),
  };
}
