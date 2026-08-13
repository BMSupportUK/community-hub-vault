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

const BORO_TEAM_RE = /\bmiddles(?:brough|borough)\b|\bboro\b/i;

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
    const stale =
      !dto.fetchedAt ||
      Date.now() - new Date(dto.fetchedAt).getTime() > 30 * 60 * 1000;
    const needsFetch =
      (stale || invalidCachedNext || invalidCachedLast) &&
      (!dto.lastResultManual || !dto.nextFixtureManual || !dto.leaguePositionManual);
    if (!needsFetch) return dto;
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
      if ((!live.nextFixture && !dto.nextFixtureManual) || (!live.lastResult && !dto.lastResultManual)) {
        const nowIso = new Date().toISOString();
        const [{ data: upcoming }, { data: recent }] = await Promise.all([
          supabaseAdmin
            .from("boro_fixtures")
            .select("competition, home_team, away_team, kickoff_at, venue")
            .gte("kickoff_at", nowIso)
            .order("kickoff_at", { ascending: true })
            .limit(25),
          supabaseAdmin
            .from("boro_fixtures")
            .select("competition, home_team, away_team, kickoff_at, venue, home_score, away_score, status")
            .lt("kickoff_at", nowIso)
            .not("home_score", "is", null)
            .not("away_score", "is", null)
            .order("kickoff_at", { ascending: false })
            .limit(25),
        ]);
        const u = (upcoming ?? []).find((row: any) => isBoroMatch({ home: row.home_team, away: row.away_team })) as any;
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
        }
        const r = (recent ?? []).find((row: any) => isBoroMatch({ home: row.home_team, away: row.away_team })) as any;
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
        if (lr) patch.last_result = lr;
        else if (invalidCachedLast) patch.last_result = null;
      }
      if (!dto.nextFixtureManual) {
        const nf = live.nextFixture ?? nextFromDb;
        if (nf) patch.next_fixture = nf;
        else if (invalidCachedNext) patch.next_fixture = null;
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
      return rowToDto(fresh);
    } catch (e) {
      console.error("[boro-match-centre] ESPN fetch failed", e);
      return dto;
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
  const res = await fetch(ESPN_STANDINGS_URL, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`ESPN standings ${res.status}`);
  const json = (await res.json()) as {
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
  const entries = json.children?.[0]?.standings?.entries ?? [];
  if (!entries.length) return null;

  const statNum = (s: NonNullable<typeof entries[number]["stats"]>[number] | undefined) =>
    typeof s?.value === "number" ? s.value : parseInt(s?.displayValue ?? "0", 10) || 0;

  const rows = entries.map((e, idx) => {
    const stats = e.stats ?? [];
    const by = (t: string) => stats.find((s) => s.type === t || s.name === t);
    const name = e.team?.shortDisplayName || e.team?.displayName || "";
    return {
      position: idx + 1,
      team: name,
      played: statNum(by("gamesplayed") ?? by("gamesPlayed")),
      won: statNum(by("wins")),
      drawn: statNum(by("ties")),
      lost: statNum(by("losses")),
      goalDifference: statNum(by("pointdifferential") ?? by("pointDifferential")),
      points: statNum(by("points")),
      isBoro: BORO_TEAM_RE.test(name),
    };
  });

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
  status?: { type?: { completed?: boolean } };
}>> {
  const url =
    slug === "eng.2"
      ? ESPN_SCHEDULE_URL
      : `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/teams/${ESPN_TEAM_ID}/schedule`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`ESPN ${slug} ${res.status}`);
  const json = (await res.json()) as { events?: unknown[] };
  return (json.events ?? []) as never;
}

async function fetchEspnBoro(): Promise<{
  lastResult: LastResult | null;
  nextFixture: NextFixture | null;
}> {
  const results = await Promise.all(
    ESPN_COMPETITIONS.map(async (c) => {
      try {
        const events = await fetchEspnCompetition(c.slug);
        return events.map((e) => ({ e, label: c.label }));
      } catch (err) {
        console.error("[boro-match-centre] ESPN competition fetch failed", c.slug, err);
        return [];
      }
    }),
  );
  const events = results.flat() as Array<{
    label: string;
    e: {
    date: string;
    competitions: Array<{
      competitors: EspnCompetitor[];
      venue?: { fullName?: string };
    }>;
    season?: { slug?: string };
    seasonType?: { name?: string };
    status?: { type?: { completed?: boolean } };
    };
  }>;

  const now = Date.now();
  const parsed = events
    .map(({ e, label }) => {
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
    .filter((x): x is NonNullable<typeof x> => x !== null && isBoroMatch(x))
    .sort((a, b) => a.t - b.t);

  const past = parsed.filter((p) => p.completed && p.homeScore !== null && p.awayScore !== null);
  const future = parsed.filter((p) => !p.completed && p.t >= now);

  const lastRaw = past[past.length - 1];
  const nextRaw = future[0];

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
