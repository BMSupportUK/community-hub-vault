import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  normaliseEspnSummary,
  isMatchAction,
  PRIMARY_TEAM_STATS,
  type EspnMatchEvent,
} from "@/lib/boro-espn-events";

export type MatchEventItem = EspnMatchEvent;

export type TeamStatLine = {
  name: string;
  label: string;
  home: string;
  away: string;
  primary: boolean;
};

export type PlayerLine = {
  id: string;
  name: string;
  jersey: string | null;
  position: string | null;
  starter: boolean;
  subbedIn: boolean;
  subbedOut: boolean;
  stats: Record<string, string>;
};

export type TeamLineup = {
  teamId: string | null;
  team: string;
  logo: string | null;
  formation: string | null;
  players: PlayerLine[];
};

export type MatchDetailDTO = {
  available: boolean;
  status: string | null;
  clock: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  home: string | null;
  away: string | null;
  events: MatchEventItem[];
  shootout: MatchEventItem[];
  teamStats: TeamStatLine[];
  lineups: TeamLineup[];
  source: string;
  fetchedAt: string;
};

function prettify(name: string, label?: string) {
  const known = PRIMARY_TEAM_STATS.find((s) => s.name === name);
  if (known) return known.label;
  if (label) return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

export const getBoroMatchDetail = createServerFn({ method: "GET" })
  .inputValidator((input) =>
    z
      .object({
        eventId: z.string().min(1).max(24),
        slug: z.string().min(1).max(32).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<MatchDetailDTO> => {
    const slug = data.slug || "eng.2";
    const empty: MatchDetailDTO = {
      available: false,
      status: null,
      clock: null,
      homeTeamId: null,
      awayTeamId: null,
      home: null,
      away: null,
      events: [],
      shootout: [],
      teamStats: [],
      lineups: [],
      source: "none",
      fetchedAt: new Date().toISOString(),
    };
    try {
      const res = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/summary?event=${encodeURIComponent(data.eventId)}`,
        { headers: { accept: "application/json" } },
      );
      if (!res.ok) return empty;
      const json: any = await res.json();
      const norm = normaliseEspnSummary(json);

      const actions = norm.events.filter((e) => isMatchAction(e.kind) && !e.shootout);
      const shootout = norm.events.filter((e) => e.shootout);

      const bsTeams: any[] = json?.boxscore?.teams ?? [];
      const byId = (id: string | null) => bsTeams.find((t) => String(t?.team?.id ?? "") === String(id ?? ""));
      const homeStats: any[] = byId(norm.homeTeamId)?.statistics ?? [];
      const awayStats: any[] = byId(norm.awayTeamId)?.statistics ?? [];
      const valueFor = (list: any[], name: string) => {
        const hit = list.find((s) => s?.name === name);
        return hit?.displayValue != null ? String(hit.displayValue) : null;
      };

      const teamStats: TeamStatLine[] = [];
      for (const s of PRIMARY_TEAM_STATS) {
        const home = valueFor(homeStats, s.name);
        const away = valueFor(awayStats, s.name);
        if (home == null && away == null) continue;
        teamStats.push({ name: s.name, label: s.label, home: home ?? "-", away: away ?? "-", primary: true });
      }
      const primaryNames = new Set(PRIMARY_TEAM_STATS.map((s) => s.name));
      for (const s of homeStats) {
        const name = String(s?.name ?? "");
        if (!name || primaryNames.has(name) || s?.displayValue == null) continue;
        teamStats.push({
          name,
          label: prettify(name, s?.label),
          home: String(s.displayValue),
          away: valueFor(awayStats, name) ?? "-",
          primary: false,
        });
      }

      const lineups: TeamLineup[] = (json?.rosters ?? []).map((r: any) => ({
        teamId: r?.team?.id != null ? String(r.team.id) : null,
        team: r?.team?.displayName ?? "",
        logo: r?.team?.id
          ? `https://a.espncdn.com/i/teamlogos/soccer/500/${r.team.id}.png`
          : null,
        formation: r?.formation ?? null,
        players: (r?.roster ?? []).map((p: any, i: number) => {
          const stats: Record<string, string> = {};
          for (const s of p?.stats ?? []) {
            if (s?.name) stats[String(s.name)] = String(s.displayValue ?? "0");
          }
          return {
            id: String(p?.athlete?.id ?? p?.athlete?.displayName ?? `p-${i}`),
            name: p?.athlete?.displayName ?? "",
            jersey: p?.jersey ?? null,
            position: p?.position?.abbreviation ?? p?.position?.name ?? null,
            starter: !!p?.starter,
            subbedIn: !!p?.subbedIn,
            subbedOut: !!p?.subbedOut,
            stats,
          };
        }),
      }));

      const hasLineupPlayers = lineups.some((l) => l.players.length > 0);

      return {
        available: actions.length > 0 || teamStats.length > 0 || hasLineupPlayers,
        status: norm.status,
        clock: norm.clock,
        homeTeamId: norm.homeTeamId,
        awayTeamId: norm.awayTeamId,
        home: norm.home,
        away: norm.away,
        events: actions,
        shootout,
        teamStats,
        lineups: lineups.filter((l) => l.players.length > 0),
        source: norm.source,
        fetchedAt: new Date().toISOString(),
      };
    } catch (e) {
      console.error("[boro-match-detail] fetch failed", e);
      return empty;
    }
  });
