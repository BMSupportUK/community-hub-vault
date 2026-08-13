import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type MatchEventItem = {
  clock: string | null;
  kind: "goal" | "own-goal" | "penalty" | "red" | "yellow" | "sub" | "other";
  text: string;
  teamId: string | null;
  players: string[];
};

export type TeamStatLine = {
  label: string;
  home: string;
  away: string;
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
  teamStats: TeamStatLine[];
  lineups: TeamLineup[];
  fetchedAt: string;
};

const PRETTY: Record<string, string> = {
  possessionPct: "Possession %",
  totalShots: "Shots",
  shotsOnTarget: "Shots on target",
  wonCorners: "Corners",
  foulsCommitted: "Fouls",
  yellowCards: "Yellow cards",
  redCards: "Red cards",
  offsides: "Offsides",
  saves: "Saves",
  accuratePasses: "Accurate passes",
  totalPasses: "Passes",
  passPct: "Pass accuracy %",
  blockedShots: "Blocked shots",
  effectiveTackles: "Tackles",
  totalTackles: "Tackles",
};

function labelFor(name: string, label?: string) {
  if (PRETTY[name]) return PRETTY[name]!;
  if (label) return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
  return name;
}

function classify(d: any): MatchEventItem["kind"] {
  const text = String(d?.type?.text ?? "").toLowerCase();
  if (d?.ownGoal) return "own-goal";
  if (d?.penaltyKick && d?.scoringPlay) return "penalty";
  if (d?.scoringPlay || text.includes("goal")) return "goal";
  if (d?.redCard || text.includes("red card")) return "red";
  if (d?.yellowCard || text.includes("yellow card")) return "yellow";
  if (text.includes("substitution")) return "sub";
  return "other";
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
      teamStats: [],
      lineups: [],
      fetchedAt: new Date().toISOString(),
    };
    try {
      const res = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/summary?event=${encodeURIComponent(data.eventId)}`,
        { headers: { accept: "application/json" } },
      );
      if (!res.ok) return empty;
      const json: any = await res.json();
      const comp = json?.header?.competitions?.[0];
      const competitors: any[] = comp?.competitors ?? [];
      const homeC = competitors.find((c) => c.homeAway === "home") ?? competitors[0];
      const awayC = competitors.find((c) => c.homeAway === "away") ?? competitors[1];
      const homeTeamId = homeC?.team?.id ?? null;
      const awayTeamId = awayC?.team?.id ?? null;

      const events: MatchEventItem[] = (comp?.details ?? []).map((d: any) => {
        const players = (d?.participants ?? [])
          .map((p: any) => p?.athlete?.displayName)
          .filter(Boolean) as string[];
        const kind = classify(d);
        const base =
          d?.type?.text ??
          (kind === "goal"
            ? "Goal"
            : kind === "own-goal"
              ? "Own goal"
              : kind === "penalty"
                ? "Penalty goal"
                : kind === "red"
                  ? "Red card"
                  : kind === "yellow"
                    ? "Yellow card"
                    : "Event");
        const added = d?.addedClock?.displayValue ? `+${d.addedClock.displayValue}` : "";
        return {
          clock: d?.clock?.displayValue ? `${d.clock.displayValue}${added}` : null,
          kind,
          text: String(base),
          teamId: d?.team?.id ?? null,
          players,
        };
      });

      const bsTeams: any[] = json?.boxscore?.teams ?? [];
      const byId = (id: string | null) => bsTeams.find((t) => t?.team?.id === id);
      const homeStats: any[] = byId(homeTeamId)?.statistics ?? [];
      const awayStats: any[] = byId(awayTeamId)?.statistics ?? [];
      const teamStats: TeamStatLine[] = homeStats
        .filter((s) => s?.displayValue != null)
        .map((s) => ({
          label: labelFor(String(s.name), s.label),
          home: String(s.displayValue),
          away: String(
            awayStats.find((a) => a?.name === s.name)?.displayValue ?? "-",
          ),
        }));

      const lineups: TeamLineup[] = (json?.rosters ?? []).map((r: any) => ({
        teamId: r?.team?.id ?? null,
        team: r?.team?.displayName ?? "",
        logo: r?.team?.id
          ? `https://a.espncdn.com/i/teamlogos/soccer/500/${r.team.id}.png`
          : null,
        formation: r?.formation ?? null,
        players: (r?.roster ?? []).map((p: any) => {
          const stats: Record<string, string> = {};
          for (const s of p?.stats ?? []) {
            if (s?.name) stats[String(s.name)] = String(s.displayValue ?? "0");
          }
          return {
            id: String(p?.athlete?.id ?? p?.athlete?.displayName ?? Math.random()),
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

      return {
        available: events.length > 0 || teamStats.length > 0 || lineups.length > 0,
        status:
          comp?.status?.type?.shortDetail ??
          comp?.status?.type?.detail ??
          comp?.status?.type?.description ??
          null,
        clock: comp?.status?.displayClock ?? null,
        homeTeamId,
        awayTeamId,
        home: homeC?.team?.displayName ?? null,
        away: awayC?.team?.displayName ?? null,
        events,
        teamStats,
        lineups,
        fetchedAt: new Date().toISOString(),
      };
    } catch (e) {
      console.error("[boro-match-detail] fetch failed", e);
      return empty;
    }
  });