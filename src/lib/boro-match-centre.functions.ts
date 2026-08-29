import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type LastResult = {
  date: string;
  competition: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  venue?: string | null;
  homeLogo?: string | null;
  awayLogo?: string | null;
  eventId?: string | null;
  espnSlug?: string | null;
};
export type NextFixture = {
  kickoff: string;
  competition: string;
  home: string;
  away: string;
  venue?: string | null;
  homeLogo?: string | null;
  awayLogo?: string | null;
  eventId?: string | null;
  espnSlug?: string | null;
};
export type LeaguePosition = {
  competition: string;
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalDifference: number;
  points: number;
  table?: LeagueTableRow[] | null;
};

export type LeagueTableRow = {
  position: number;
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalDifference: number;
  points: number;
  isBoro?: boolean;
};

export type LiveMatch = {
  kickoff: string;
  competition: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  statusDetail: string;
  clock: string | null;
  inPlay: boolean;
  homeLogo?: string | null;
  awayLogo?: string | null;
  eventId?: string | null;
  espnSlug?: string | null;
};

export type MatchCentreDTO = {
  lastResult: LastResult | null;
  nextFixture: NextFixture | null;
  leaguePosition: LeaguePosition | null;
  lastResultManual: boolean;
  nextFixtureManual: boolean;
  leaguePositionManual: boolean;
  fetchedAt: string | null;
  updatedAt: string | null;
  liveMatch?: LiveMatch | null;
};

const BORO_TEAM_RE = /\bmiddles(?:brough|borough)\b|\bboro\b/i;

// In-memory (per worker instance) cache of the in-play match so short-lived
// cache hits can still render the live strip without another ESPN round trip.
let liveMatchCache: { at: number; value: LiveMatch | null } | null = null;

function isBoroMatch(match: { home?: string | null; away?: string | null } | null | undefined) {
  return !!match && (BORO_TEAM_RE.test(match.home ?? "") || BORO_TEAM_RE.test(match.away ?? ""));
}

function rowToDto(row: any): MatchCentreDTO {
  return {
    lastResult: (row?.last_result as LastResult | null) ?? null,
    nextFixture: (row?.next_fixture as NextFixture | null) ?? null,
    leaguePosition: (row?.league_position as LeaguePosition | null) ?? null,
    lastResultManual: !!row?.last_result_manual,
    nextFixtureManual: !!row?.next_fixture_manual,
    leaguePositionManual: !!row?.league_position_manual,
    fetchedAt: row?.fetched_at ?? null,
    updatedAt: row?.updated_at ?? null,
  };
}

export const getBoroMatchCentre = createServerFn({ method: "GET" }).handler(
  async (): Promise<MatchCentreDTO> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("boro_match_centre")
      .select("*")
      .eq("id", "singleton")
      .maybeSingle();
    if (error) throw new Error(error.message);
    const rawDto = rowToDto(data);
    const invalidCachedNext = !!rawDto.nextFixture && !isBoroMatch(rawDto.nextFixture);
    const invalidCachedLast = !!rawDto.lastResult && !isBoroMatch(rawDto.lastResult);
    const dto: MatchCentreDTO = {
      ...rawDto,
      nextFixture: invalidCachedNext ? null : rawDto.nextFixture,
      lastResult: invalidCachedLast ? null : rawDto.lastResult,
    };
    // While the listed fixture is in play (or just about to start) refresh
    // aggressively so the card flips to the result the moment it ends.
    const koMs = dto.nextFixture ? Date.parse(dto.nextFixture.kickoff) : NaN;
    const liveWindow =
      Number.isFinite(koMs) &&
      Date.now() >= koMs - 15 * 60 * 1000 &&
      Date.now() <= koMs + 5 * 60 * 60 * 1000;
    // While a game is in play refresh every ~20s so the live strip ticks along.
    const maxAgeMs = liveWindow ? 5 * 1000 : 30 * 60 * 1000;
    const stale =
      !dto.fetchedAt || Date.now() - new Date(dto.fetchedAt).getTime() > maxAgeMs;
    // Once a completed midweek fixture has been held for the requested
    // 24-hour post-match period, do not leave it behind the normal 30-minute
    // cache. Refresh immediately so the weekend fixture can replace it.
    const cachedNextKickoff = dto.nextFixture ? Date.parse(dto.nextFixture.kickoff) : NaN;
    const rolloverDue =
      Number.isFinite(cachedNextKickoff) &&
      Date.now() >= cachedNextKickoff + 26 * 60 * 60 * 1000;
    const needsFetch =
      (stale || rolloverDue || invalidCachedNext || invalidCachedLast) &&
      (!dto.lastResultManual || !dto.nextFixtureManual || !dto.leaguePositionManual);
    if (!needsFetch) {
      const cached =
        liveMatchCache && Date.now() - liveMatchCache.at < 60 * 1000
          ? liveMatchCache.value
          : null;
      let lastResult = dto.lastResult;
      if (lastResult && !lastResult.eventId) {
        const enriched = await withEspnEvent({
          kickoff: lastResult.date,
          competition: lastResult.competition,
          home: lastResult.home,
          away: lastResult.away,
          venue: lastResult.venue,
          homeLogo: lastResult.homeLogo,
          awayLogo: lastResult.awayLogo,
        });
        if (enriched.eventId) {
          lastResult = {
            ...lastResult,
            eventId: enriched.eventId,
            espnSlug: enriched.espnSlug,
            homeLogo: enriched.homeLogo,
            awayLogo: enriched.awayLogo,
          };
          await supabaseAdmin
            .from("boro_match_centre")
            .update({ last_result: lastResult } as never)
            .eq("id", "singleton");
        }
      }
      // Same top-up for the upcoming fixture: without an eventId the match
      // centre tabs have no Gamecast feed to poll.
      let nextFixture = dto.nextFixture;
      if (nextFixture && !nextFixture.eventId) {
        const enrichedNext = await withEspnEvent(nextFixture);
        if (enrichedNext.eventId) {
          nextFixture = enrichedNext;
          await supabaseAdmin
            .from("boro_match_centre")
            .update({ next_fixture: nextFixture } as never)
            .eq("id", "singleton");
        }
      }
      return { ...dto, lastResult, nextFixture, liveMatch: cached };
    }
    try {
      const [live, standings] = await Promise.all([
        fetchEspnBoro(),
        fetchEspnStandings().catch((e: unknown) => {
          console.error("[boro-match-centre] standings fetch failed", e);
          return null;
        }),
      ]);
      // Fall back to our own boro_fixtures table (populated from BBC) when
      // ESPN doesn't yet know about a fixture/result — e.g. just after the
      // EFL release the season schedule. We only fill in slots that ESPN
      // didn't supply, and never override manual admin entries.
      let nextFromDb: NextFixture | null = null;
      let lastFromDb: LastResult | null = null;
      // A game that has kicked off but not finished, taken straight from our
      // own fixture feed. ESPN sometimes lags on kick-off, which used to leave
      // the card stuck on the previous (midweek) result while Boro were playing.
      let liveFromDb: LiveMatch | null = null;
      // ESPN sometimes hasn't listed the next game yet, which leaves the
      // weekly pick stuck on the midweek game it already played. Treat a
      // "next fixture" whose kick-off is in the past as missing too, so the
      // database fixture list can supply the real upcoming game.
      const espnNextIsStale =
        !!live.nextFixture && Date.parse(live.nextFixture.kickoff) < Date.now();
      if (
        ((!live.nextFixture || espnNextIsStale) && !dto.nextFixtureManual) ||
        (!live.lastResult && !dto.lastResultManual)
      ) {

        // Include a game that has already kicked off but isn't finished, plus
        // games played earlier this week (the card holds them until Monday).
        const weekIso = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
        const [{ data: upcoming }, { data: recent }] = await Promise.all([
          supabaseAdmin
            .from("boro_fixtures")
            .select("competition, home_team, away_team, kickoff_at, venue, status, home_score, away_score")
            .gte("kickoff_at", weekIso)
            .order("kickoff_at", { ascending: true })
            .limit(40),
          supabaseAdmin
            .from("boro_fixtures")
            .select("competition, home_team, away_team, kickoff_at, venue, home_score, away_score, status")
            .lt("kickoff_at", new Date().toISOString())
            .not("home_score", "is", null)
            .not("away_score", "is", null)
            .order("kickoff_at", { ascending: false })
            .limit(25),
        ]);
        const { pickWeeklyFixture } = await import("@/lib/boro-match-week");
        const candidates = (upcoming ?? [])
          .filter((row: any) => isBoroMatch({ home: row.home_team, away: row.away_team }))
          .map((row: any) => ({
            row,
            t: new Date(row.kickoff_at).getTime(),
            completed:
              String(row.status ?? "").toUpperCase() === "FINISHED" ||
              new Date(row.kickoff_at).getTime() < Date.now() - 4 * 60 * 60 * 1000,
          }));
        const u = pickWeeklyFixture(
          candidates,
          candidates.filter((c) => !c.completed),
          Date.now(),
        )?.row as any;
        if (u) {
          nextFromDb = {
            kickoff: new Date(u.kickoff_at).toISOString(),
            competition: u.competition ?? "Championship",
            home: u.home_team,
            away: u.away_team,
            venue: u.venue ?? null,
            homeLogo: null,
            awayLogo: null,
          };
          const uKo = new Date(u.kickoff_at).getTime();
          const uStatus = String(u.status ?? "").toUpperCase();
          if (
            uStatus !== "FINISHED" &&
            Number.isFinite(uKo) &&
            Date.now() >= uKo &&
            Date.now() <= uKo + 4 * 60 * 60 * 1000
          ) {
            liveFromDb = {
              kickoff: new Date(uKo).toISOString(),
              competition: u.competition ?? "Championship",
              home: u.home_team,
              away: u.away_team,
              homeScore: u.home_score ?? 0,
              awayScore: u.away_score ?? 0,
              statusDetail: "Live",
              clock: null,
              inPlay: true,
              homeLogo: null,
              awayLogo: null,
              eventId: null,
              espnSlug: null,
            };
          }
        }
        // A live fixture already has scores, but it is not a result. Only let
        // the database fallback promote a row into "last result" after the
        // fixture feed marks it finished (with a four-hour safety fallback).
        const r = (recent ?? []).find((row: any) => {
          if (!isBoroMatch({ home: row.home_team, away: row.away_team })) return false;
          const kickoff = Date.parse(String(row.kickoff_at ?? ""));
          return (
            String(row.status ?? "").toUpperCase() === "FINISHED" ||
            (Number.isFinite(kickoff) && kickoff < Date.now() - 4 * 60 * 60 * 1000)
          );
        }) as any;
        if (r) {
          lastFromDb = {
            date: new Date(r.kickoff_at).toISOString(),
            competition: r.competition ?? "Championship",
            home: r.home_team,
            away: r.away_team,
            homeScore: r.home_score ?? 0,
            awayScore: r.away_score ?? 0,
            venue: r.venue ?? null,
            homeLogo: null,
            awayLogo: null,
          };
        }
      }
      const patch: Record<string, unknown> = {
        fetched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (!dto.lastResultManual) {
        const lr = live.lastResult ?? lastFromDb;
        if (lr) {
          const enriched = lr.eventId
            ? null
            : await withEspnEvent({
                kickoff: lr.date,
                competition: lr.competition,
                home: lr.home,
                away: lr.away,
                venue: lr.venue,
                homeLogo: lr.homeLogo,
                awayLogo: lr.awayLogo,
              });
          patch.last_result = enriched?.eventId
            ? {
                ...lr,
                eventId: enriched.eventId,
                espnSlug: enriched.espnSlug,
                homeLogo: enriched.homeLogo,
                awayLogo: enriched.awayLogo,
              }
            : lr;
        }
        else if (invalidCachedLast) patch.last_result = null;
      }
      if (!dto.nextFixtureManual) {
        // Our own fixture list wins whenever ESPN's "next" game is in the past,
        // as long as ours is either still to come or currently being played —
        // otherwise a game kicking off held the card on the previous result.
        const dbNextIsCurrent =
          !!nextFromDb &&
          (Date.parse(nextFromDb.kickoff) > Date.now() ||
            Date.parse(nextFromDb.kickoff) > Date.now() - 4 * 60 * 60 * 1000);
        const nf =
          espnNextIsStale && dbNextIsCurrent
            ? nextFromDb
            : (live.nextFixture ?? nextFromDb);

        if (nf) patch.next_fixture = await withEspnEvent(nf);
        else if (invalidCachedNext) patch.next_fixture = null;
      }
      // A manually-set or previously cached fixture may predate the ESPN
      // lookup: top it up so the match centre tabs have a feed to poll.
      if (dto.nextFixtureManual && dto.nextFixture && !dto.nextFixture.eventId) {
        patch.next_fixture = await withEspnEvent(dto.nextFixture);
      }
      if (!dto.leaguePositionManual && standings) patch.league_position = standings;
      await supabaseAdmin
        .from("boro_match_centre")
        .update(patch as never)
        .eq("id", "singleton");
      const { data: fresh } = await supabaseAdmin
        .from("boro_match_centre")
        .select("*")
        .eq("id", "singleton")
        .maybeSingle();
      liveMatchCache = { at: Date.now(), value: live.liveMatch ?? null };
      return { ...rowToDto(fresh), liveMatch: live.liveMatch ?? null };
    } catch (e) {
      console.error("[boro-match-centre] ESPN fetch failed", e);
      return { ...dto, liveMatch: liveMatchCache?.value ?? null };
    }
  },
);

const ESPN_TEAM_ID = "369"; // Middlesbrough (eng.2)
const ESPN_SCHEDULE_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/eng.2/teams/${ESPN_TEAM_ID}/schedule`;
const ESPN_STANDINGS_URL = `https://site.api.espn.com/apis/v2/sports/soccer/eng.2/standings`;

// Boro play in more than one competition — the league feed alone misses cup
// ties (e.g. the League Cup win over Wrexham), which used to leave a stale
// league/play-off result showing as "last result".
const ESPN_COMPETITIONS: Array<{ slug: string; label: string }> = [
  { slug: "eng.2", label: "Championship" },
  { slug: "eng.league_cup", label: "Carabao Cup" },
  { slug: "eng.fa", label: "FA Cup" },
  { slug: "eng.trophy", label: "EFL Trophy" },
];

async function fetchEspnStandings(): Promise<LeaguePosition | null> {
  const { espnJson } = await import("@/lib/espn-fetch");
  const json = (await espnJson(ESPN_STANDINGS_URL)) as null | {
    name?: string;
    children?: Array<{
      standings?: {
        entries?: Array<{
          team?: { id?: string; displayName?: string; shortDisplayName?: string };
          stats?: Array<{ name?: string; type?: string; value?: number; displayValue?: string }>;
          note?: { rank?: number };
        }>;
      };
    }>;
  };
  if (!json) throw new Error("ESPN standings unavailable");
  const entries = json.children?.[0]?.standings?.entries ?? [];
  if (!entries.length) return null;

  const statNum = (s: NonNullable<typeof entries[number]["stats"]>[number] | undefined) =>
    typeof s?.value === "number" ? s.value : parseInt(s?.displayValue ?? "0", 10) || 0;

  const raw = entries.map((e) => {
    const stats = e.stats ?? [];
    const by = (t: string) => stats.find((s) => s.type === t || s.name === t);
    const name = e.team?.shortDisplayName || e.team?.displayName || "";
    const points = statNum(by("points"));
    const goalDifference = statNum(by("pointdifferential") ?? by("pointDifferential"));
    return {
      // ESPN returns entries in no particular order; the authoritative
      // position is the `rank` stat (0 when the season hasn't started).
      rank: statNum(by("rank")),
      team: name,
      played: statNum(by("gamesplayed") ?? by("gamesPlayed")),
      won: statNum(by("wins")),
      drawn: statNum(by("ties")),
      lost: statNum(by("losses")),
      goalDifference,
      points,
      isBoro: BORO_TEAM_RE.test(name),
    };
  });

  // Sort by ESPN rank when present, otherwise by points then goal difference
  // then goals scored equivalents, so the table is right immediately after a
  // game finishes even before ESPN recomputes ranks.
  const hasRanks = raw.some((r) => r.rank > 0);
  raw.sort((a, b) =>
    hasRanks
      ? (a.rank || 999) - (b.rank || 999)
      : b.points - a.points || b.goalDifference - a.goalDifference || a.team.localeCompare(b.team),
  );
  const rows = raw.map(({ rank: _rank, ...r }, idx) => ({ position: idx + 1, ...r }));

  const boroIdx = rows.findIndex((r) => r.isBoro);
  if (boroIdx === -1) return null;

  const boro = rows[boroIdx];
  const start = Math.max(0, boroIdx - 2);
  const end = Math.min(rows.length, boroIdx + 3);
  const slice = rows.slice(start, end);

  return {
    competition: "EFL Championship",
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

function espnLogo(teamId: string | undefined | null) {
  if (!teamId) return null;
  return `https://a.espncdn.com/i/teamlogos/soccer/500/${teamId}.png`;
}

type EspnCompetitor = {
  homeAway?: string;
  team?: { id?: string; displayName?: string };
  score?: { value?: number; displayValue?: string } | string | number;
};

async function fetchEspnCompetition(slug: string): Promise<Array<{
  date: string;
  competitions: Array<{ competitors: EspnCompetitor[]; venue?: { fullName?: string } }>;
  status?: {
    displayClock?: string;
    type?: { completed?: boolean; state?: string; detail?: string; shortDetail?: string; description?: string };
  };
}>> {
  const url =
    slug === "eng.2"
      ? ESPN_SCHEDULE_URL
      : `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/teams/${ESPN_TEAM_ID}/schedule`;
  const { espnJson } = await import("@/lib/espn-fetch");
  const json = (await espnJson(url)) as { events?: unknown[] } | null;
  if (!json) throw new Error(`ESPN ${slug} unavailable`);
  return (json.events ?? []) as never;
}

/**
 * Find the ESPN event for a fixture we only know about from our own tables
 * (or a manual admin entry) so the match centre tabs have a Gamecast feed to
 * poll before kick-off. Matches on kick-off date + team names across the
 * competitions Boro play in.
 */
async function withEspnEvent(nf: NextFixture): Promise<NextFixture> {
  if (nf.eventId) return nf;
  const ko = Date.parse(nf.kickoff);
  if (!Number.isFinite(ko)) return nf;
  const { espnJson, espnDateRange } = await import("@/lib/espn-fetch");
  const dates = [espnDateRange(ko - 86_400_000, ko + 86_400_000)];
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const wanted = [norm(nf.home), norm(nf.away)];
  for (const c of ESPN_COMPETITIONS) {
    for (const date of dates) {
      try {
        const json = (await espnJson(
          `https://site.api.espn.com/apis/site/v2/sports/soccer/${c.slug}/scoreboard?dates=${date}&limit=400`,
        )) as { events?: any[] } | null;
        if (!json) continue;
        for (const ev of json.events ?? []) {
          const comp = ev?.competitions?.[0];
          const cs: any[] = comp?.competitors ?? [];
          const names = cs.map((x) => norm(String(x?.team?.displayName ?? "")));
          const hit = wanted.every((w) => names.some((n) => n.includes(w) || w.includes(n)));
          if (!hit || !ev?.id) continue;
          if (Math.abs(Date.parse(ev.date) - ko) > 2 * 86_400_000) continue;
          const homeC = cs.find((x) => x?.homeAway === "home") ?? cs[0];
          const awayC = cs.find((x) => x?.homeAway === "away") ?? cs[1];
          return {
            ...nf,
            eventId: String(ev.id),
            espnSlug: c.slug,
            homeLogo: nf.homeLogo ?? espnLogo(homeC?.team?.id ?? null),
            awayLogo: nf.awayLogo ?? espnLogo(awayC?.team?.id ?? null),
          };
        }
      } catch {
        // try the next feed
      }
    }
  }
  return nf;
}

async function fetchEspnBoro(): Promise<{
  lastResult: LastResult | null;
  nextFixture: NextFixture | null;
  liveMatch: LiveMatch | null;
}> {
  const results = await Promise.all(
    ESPN_COMPETITIONS.map(async (c) => {
      try {
        const events = await fetchEspnCompetition(c.slug);
        return events.map((e) => ({ e, label: c.label, slug: c.slug }));
      } catch (err) {
        console.error("[boro-match-centre] ESPN competition fetch failed", c.slug, err);
        return [];
      }
    }),
  );
  const events = results.flat() as Array<{
    label: string;
    slug: string;
    e: {
    id?: string;
    date: string;
    competitions: Array<{
      competitors: EspnCompetitor[];
      venue?: { fullName?: string };
    }>;
    season?: { slug?: string };
    seasonType?: { name?: string };
    status?: {
      displayClock?: string;
      type?: { completed?: boolean; state?: string; detail?: string; shortDetail?: string; description?: string };
    };
    };
  }>;

  const now = Date.now();
  const parsed = events
    .map(({ e, label, slug }) => {
      const t = Date.parse(e.date);
      const comp = e.competitions?.[0];
      if (!comp) return null;
      const cs = comp.competitors ?? [];
      const home = cs.find((c) => c.homeAway === "home") ?? cs[0];
      const away = cs.find((c) => c.homeAway === "away") ?? cs[1];
      if (!home?.team || !away?.team) return null;
      const score = (c: EspnCompetitor): number | null => {
        const s: unknown = c.score;
        if (s == null) return null;
        if (typeof s === "number") return s;
        if (typeof s === "string") {
          const n = parseInt(s, 10);
          return Number.isFinite(n) ? n : null;
        }
        if (typeof s === "object" && s !== null) {
          const v = (s as { value?: unknown; displayValue?: unknown }).value;
          if (typeof v === "number") return v;
          const dv = (s as { displayValue?: unknown }).displayValue;
          if (typeof dv === "string") {
            const n = parseInt(dv, 10);
            return Number.isFinite(n) ? n : null;
          }
        }
        return null;
      };
      return {
        t,
        iso: new Date(t).toISOString(),
        competition: label,
        eventId: e.id ?? null,
        espnSlug: slug,
        home: home.team.displayName ?? "",
        away: away.team.displayName ?? "",
        homeId: home.team.id ?? null,
        awayId: away.team.id ?? null,
        homeScore: score(home),
        awayScore: score(away),
        venue: comp.venue?.fullName ?? null,
        // A kicked-off game is NOT finished: keep it as the "next fixture"
        // until the feed reports full time (fall back to a 4h safety window
        // in case the feed never flips the flag).
        completed: !!e.status?.type?.completed || t < now - 4 * 60 * 60 * 1000,
        state: e.status?.type?.state ?? null,
        statusDetail:
          e.status?.type?.shortDetail ?? e.status?.type?.detail ?? e.status?.type?.description ?? null,
        clock: e.status?.displayClock ?? null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null && isBoroMatch(x))
    .sort((a, b) => a.t - b.t);

  // Schedule/scoreboard responses can briefly mark a match as completed at
  // half-time. Confirm any just-finished-looking fixture against Gamecast,
  // whose status is authoritative, before moving it into lastResult.
  const recentCompleted = [...parsed]
    .reverse()
    .find((match) => match.completed && match.eventId && match.t <= now && match.t > now - 5 * 60 * 60 * 1000);
  if (recentCompleted?.eventId) {
    try {
      const { espnJson } = await import("@/lib/espn-fetch");
      const summary: any = await espnJson(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${recentCompleted.espnSlug}/summary?event=${encodeURIComponent(recentCompleted.eventId)}`,
      );
      const status = summary?.header?.competitions?.[0]?.status;
      const state = String(status?.type?.state ?? "").toLowerCase();
      const detail = String(
        status?.type?.shortDetail ?? status?.type?.detail ?? status?.type?.description ?? "",
      );
      const final =
        state === "post" ||
        status?.type?.completed === true ||
        /full\s*time|\bft\b|final/i.test(detail);
      if (!final && (state === "in" || /half\s*time|halftime|\bht\b/i.test(detail))) {
        recentCompleted.completed = false;
        recentCompleted.state = "in";
        recentCompleted.statusDetail = detail || "Live";
        recentCompleted.clock = status?.displayClock ?? recentCompleted.clock;
      }
    } catch (error) {
      console.error("[boro-match-centre] live status confirmation failed", error);
    }
  }

  const past = parsed.filter((p) => p.completed && p.homeScore !== null && p.awayScore !== null);
  const future = parsed.filter((p) => !p.completed);

  // The match centre only rolls over to a new fixture when a new week starts
  // (Monday, UK time) — see boro-match-week.
  const { pickWeeklyFixture } = await import("@/lib/boro-match-week");

  const lastRaw = past[past.length - 1];
  const nextRaw = pickWeeklyFixture(parsed, future, now);

  const lastResult: LastResult | null = lastRaw
    ? {
        date: lastRaw.iso,
        competition: lastRaw.competition,
        home: lastRaw.home,
        away: lastRaw.away,
        homeScore: lastRaw.homeScore ?? 0,
        awayScore: lastRaw.awayScore ?? 0,
        venue: lastRaw.venue,
        homeLogo: espnLogo(lastRaw.homeId),
        awayLogo: espnLogo(lastRaw.awayId),
        eventId: lastRaw.eventId,
        espnSlug: lastRaw.espnSlug,
      }
    : null;

  const nextFixture: NextFixture | null = nextRaw
    ? {
        kickoff: nextRaw.iso,
        competition: nextRaw.competition,
        home: nextRaw.home,
        away: nextRaw.away,
        venue: nextRaw.venue,
        homeLogo: espnLogo(nextRaw.homeId),
        awayLogo: espnLogo(nextRaw.awayId),
        eventId: nextRaw.eventId,
        espnSlug: nextRaw.espnSlug,
      }
    : null;

  const liveRaw = parsed.find(
    (p) =>
      !p.completed &&
      (p.state === "in" || (p.t <= now && p.t > now - 4 * 60 * 60 * 1000)),
  );
  const liveMatch: LiveMatch | null = liveRaw
    ? {
        kickoff: liveRaw.iso,
        competition: liveRaw.competition,
        home: liveRaw.home,
        away: liveRaw.away,
        homeScore: liveRaw.homeScore ?? 0,
        awayScore: liveRaw.awayScore ?? 0,
        statusDetail: liveRaw.statusDetail ?? "Live",
        clock: liveRaw.clock ?? null,
        inPlay: liveRaw.state === "in" || liveRaw.t <= now,
        homeLogo: espnLogo(liveRaw.homeId),
        awayLogo: espnLogo(liveRaw.awayId),
        eventId: liveRaw.eventId,
        espnSlug: liveRaw.espnSlug,
      }
    : null;

  return { lastResult, nextFixture, liveMatch };
}

const overrideSchema = z.object({
  lastResult: z
    .object({
      date: z.string().min(1),
      competition: z.string().min(1).max(80),
      home: z.string().min(1).max(80),
      away: z.string().min(1).max(80),
      homeScore: z.number().int().min(0).max(99),
      awayScore: z.number().int().min(0).max(99),
      venue: z.string().max(120).nullable().optional(),
    })
    .nullable()
    .optional(),
  nextFixture: z
    .object({
      kickoff: z.string().min(1),
      competition: z.string().min(1).max(80),
      home: z.string().min(1).max(80),
      away: z.string().min(1).max(80),
      venue: z.string().max(120).nullable().optional(),
    })
    .nullable()
    .optional(),
  leaguePosition: z
    .object({
      competition: z.string().min(1).max(80),
      position: z.number().int().min(1).max(50),
      played: z.number().int().min(0).max(100),
      won: z.number().int().min(0).max(100),
      drawn: z.number().int().min(0).max(100),
      lost: z.number().int().min(0).max(100),
      goalDifference: z.number().int().min(-200).max(200),
      points: z.number().int().min(0).max(200),
      table: z
        .array(
          z.object({
            position: z.number().int().min(1).max(50),
            team: z.string().min(1).max(80),
            played: z.number().int().min(0).max(100),
            won: z.number().int().min(0).max(100),
            drawn: z.number().int().min(0).max(100),
            lost: z.number().int().min(0).max(100),
            goalDifference: z.number().int().min(-200).max(200),
            points: z.number().int().min(0).max(200),
            isBoro: z.boolean().optional(),
          }),
        )
        .max(11)
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
});

export const saveBoroMatchCentre = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => overrideSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const rs = new Set((roles ?? []).map((r: any) => r.role));
    if (!rs.has("admin") && !rs.has("management")) {
      throw new Error("Forbidden");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: {
      updated_at: string;
      last_result?: LastResult | null;
      last_result_manual?: boolean;
      next_fixture?: NextFixture | null;
      next_fixture_manual?: boolean;
      league_position?: LeaguePosition | null;
      league_position_manual?: boolean;
    } = { updated_at: new Date().toISOString() };
    if (data.lastResult !== undefined) {
      patch.last_result = data.lastResult;
      patch.last_result_manual = data.lastResult !== null;
    }
    if (data.nextFixture !== undefined) {
      patch.next_fixture = data.nextFixture;
      patch.next_fixture_manual = data.nextFixture !== null;
    }
    if (data.leaguePosition !== undefined) {
      patch.league_position = data.leaguePosition;
      patch.league_position_manual = data.leaguePosition !== null;
    }
    const { error } = await supabaseAdmin
      .from("boro_match_centre")
      .update(patch as never)
      .eq("id", "singleton");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
