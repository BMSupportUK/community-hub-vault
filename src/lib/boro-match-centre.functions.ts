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
      // ESPN's schedule feed can stay on "in play" long after full time. Our
      // own fixture table (BBC-fed) is the authority on a game being over, so
      // read the finished Boro games directly and use them to (a) kill a stale
      // live strip and (b) promote the newest finished game to last result.
      const { data: finishedRows } = await supabaseAdmin
        .from("boro_fixtures")
        .select("competition, home_team, away_team, kickoff_at, venue, home_score, away_score, status")
        .eq("status", "FINISHED")
        .lt("kickoff_at", new Date().toISOString())
        .order("kickoff_at", { ascending: false })
        .limit(10);
      const finished = (finishedRows ?? []).filter((row: any) =>
        isBoroMatch({ home: row.home_team, away: row.away_team }),
      );
      const sameFixture = (
        a: { home: string; away: string; kickoff: string },
        row: any,
      ) => {
        const norm = (v: string) => v.toLowerCase().replace(/[^a-z]/g, "");
        const gap = Math.abs(Date.parse(a.kickoff) - Date.parse(String(row.kickoff_at)));
        return (
          norm(a.home) === norm(String(row.home_team)) &&
          norm(a.away) === norm(String(row.away_team)) &&
          Number.isFinite(gap) &&
          gap < 6 * 60 * 60 * 1000
        );
      };
      const finishedRowToResult = (row: any): LastResult => ({
        date: new Date(row.kickoff_at).toISOString(),
        competition: row.competition ?? "Championship",
        home: row.home_team,
        away: row.away_team,
        homeScore: row.home_score ?? 0,
        awayScore: row.away_score ?? 0,
        venue: row.venue ?? null,
        homeLogo: null,
        awayLogo: null,
      });
      const patch: Record<string, unknown> = {
        fetched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (!dto.lastResultManual) {
        const espnLast = live.lastResult ?? lastFromDb;
        const newestFinished = finished[0] ? finishedRowToResult(finished[0]) : null;
        const lr =
          newestFinished &&
          (!espnLast || Date.parse(newestFinished.date) > Date.parse(espnLast.date))
            ? newestFinished
            : espnLast;
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
      const liveCandidate = live.liveMatch ?? liveFromDb;
      // Drop the live strip once our fixture feed says that game has finished.
      const liveNow =
        liveCandidate && finished.some((row: any) => sameFixture(liveCandidate, row))
          ? null
          : liveCandidate;
      liveMatchCache = { at: Date.now(), value: liveNow };
      return { ...rowToDto(fresh), liveMatch: liveNow };
    } catch (e) {
      console.error("[boro-match-centre] ESPN fetch failed", e);
      return { ...dto, liveMatch: liveMatchCache?.value ?? null };
    }
  },
);

async function withEspnEvent(nf: NextFixture): Promise<NextFixture> {
  const { withFotmobEvent } = await import("@/lib/boro-match-centre-fotmob.server");
  return withFotmobEvent(nf);
}

async function fetchEspnStandings(): Promise<LeaguePosition | null> {
  const { fetchFotmobStandings } = await import("@/lib/boro-match-centre-fotmob.server");
  return fetchFotmobStandings();
}

async function fetchEspnBoro(): Promise<{
  lastResult: LastResult | null;
  nextFixture: NextFixture | null;
  liveMatch: LiveMatch | null;
}> {
  const { fetchFotmobBoro } = await import("@/lib/boro-match-centre-fotmob.server");
  return fetchFotmobBoro();
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
