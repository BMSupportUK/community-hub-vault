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
};
export type NextFixture = {
  kickoff: string;
  competition: string;
  home: string;
  away: string;
  venue?: string | null;
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
    return rowToDto(data);
  },
);

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
