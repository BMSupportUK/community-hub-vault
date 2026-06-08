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
};
export type NextFixture = {
  kickoff: string;
  competition: string;
  home: string;
  away: string;
  venue?: string | null;
  homeLogo?: string | null;
  awayLogo?: string | null;
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
};

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
    const dto = rowToDto(data);
    const stale =
      !dto.fetchedAt ||
      Date.now() - new Date(dto.fetchedAt).getTime() > 30 * 60 * 1000;
    const needsFetch =
      stale && (!dto.lastResultManual || !dto.nextFixtureManual);
    if (!needsFetch) return dto;
    try {
      const live = await fetchEspnBoro();
      const patch: Record<string, unknown> = {
        fetched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (!dto.lastResultManual && live.lastResult) patch.last_result = live.lastResult;
      if (!dto.nextFixtureManual && live.nextFixture) patch.next_fixture = live.nextFixture;
      await supabaseAdmin
        .from("boro_match_centre")
        .update(patch as never)
        .eq("id", "singleton");
      const { data: fresh } = await supabaseAdmin
        .from("boro_match_centre")
        .select("*")
        .eq("id", "singleton")
        .maybeSingle();
      return rowToDto(fresh);
    } catch (e) {
      console.error("[boro-match-centre] ESPN fetch failed", e);
      return dto;
    }
  },
);

const ESPN_TEAM_ID = "369"; // Middlesbrough (eng.2)
const ESPN_SCHEDULE_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/eng.2/teams/${ESPN_TEAM_ID}/schedule`;

function espnLogo(teamId: string | undefined | null) {
  if (!teamId) return null;
  return `https://a.espncdn.com/i/teamlogos/soccer/500/${teamId}.png`;
}

type EspnCompetitor = {
  homeAway?: string;
  team?: { id?: string; displayName?: string };
  score?: { value?: number; displayValue?: string } | string | number;
};

async function fetchEspnBoro(): Promise<{
  lastResult: LastResult | null;
  nextFixture: NextFixture | null;
}> {
  const res = await fetch(ESPN_SCHEDULE_URL, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`ESPN ${res.status}`);
  const json = (await res.json()) as { events?: unknown[] };
  const events = (json.events ?? []) as Array<{
    date: string;
    competitions: Array<{
      competitors: EspnCompetitor[];
      venue?: { fullName?: string };
    }>;
    season?: { slug?: string };
    seasonType?: { name?: string };
    status?: { type?: { completed?: boolean } };
  }>;

  const now = Date.now();
  const parsed = events
    .map((e) => {
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
        home: home.team.displayName ?? "",
        away: away.team.displayName ?? "",
        homeId: home.team.id ?? null,
        awayId: away.team.id ?? null,
        homeScore: score(home),
        awayScore: score(away),
        venue: comp.venue?.fullName ?? null,
        completed: !!e.status?.type?.completed || t < now,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.t - b.t);

  const past = parsed.filter((p) => p.completed && p.homeScore !== null && p.awayScore !== null);
  const future = parsed.filter((p) => !p.completed && p.t >= now);

  const lastRaw = past[past.length - 1];
  const nextRaw = future[0];

  const lastResult: LastResult | null = lastRaw
    ? {
        date: lastRaw.iso,
        competition: "Championship",
        home: lastRaw.home,
        away: lastRaw.away,
        homeScore: lastRaw.homeScore ?? 0,
        awayScore: lastRaw.awayScore ?? 0,
        venue: lastRaw.venue,
        homeLogo: espnLogo(lastRaw.homeId),
        awayLogo: espnLogo(lastRaw.awayId),
      }
    : null;

  const nextFixture: NextFixture | null = nextRaw
    ? {
        kickoff: nextRaw.iso,
        competition: "Championship",
        home: nextRaw.home,
        away: nextRaw.away,
        venue: nextRaw.venue,
        homeLogo: espnLogo(nextRaw.homeId),
        awayLogo: espnLogo(nextRaw.awayId),
      }
    : null;

  return { lastResult, nextFixture };
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
