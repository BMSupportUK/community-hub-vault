import { isMatchAction, normaliseEspnSummary, PRIMARY_TEAM_STATS } from "@/lib/boro-espn-events";
import type { MatchDetailDTO, TeamLineup, TeamStatLine } from "@/lib/boro-match-detail.types";

function prettify(name: string, label?: string) {
  const known = PRIMARY_TEAM_STATS.find((stat) => stat.name === name);
  if (known) return known.label;
  if (label) return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
  return name.replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase()).trim();
}

export function normaliseBoroMatchDetail(json: any): MatchDetailDTO {
  const norm = normaliseEspnSummary(json);
  const actions = norm.events.filter((event) => isMatchAction(event.kind) && !event.shootout);
  const shootout = norm.events.filter((event) => event.shootout);
  const boxscoreTeams: any[] = json?.boxscore?.teams ?? [];
  const byId = (id: string | null) => boxscoreTeams.find((team) => String(team?.team?.id ?? "") === String(id ?? ""));
  const homeStats: any[] = byId(norm.homeTeamId)?.statistics ?? [];
  const awayStats: any[] = byId(norm.awayTeamId)?.statistics ?? [];
  const valueFor = (list: any[], name: string) => {
    const hit = list.find((stat) => stat?.name === name);
    return hit?.displayValue != null ? String(hit.displayValue) : null;
  };

  const teamStats: TeamStatLine[] = [];
  for (const stat of PRIMARY_TEAM_STATS) {
    const home = valueFor(homeStats, stat.name);
    const away = valueFor(awayStats, stat.name);
    if (home == null && away == null) continue;
    teamStats.push({ name: stat.name, label: stat.label, home: home ?? "-", away: away ?? "-", primary: true });
  }
  const primaryNames = new Set(PRIMARY_TEAM_STATS.map((stat) => stat.name));
  for (const stat of homeStats) {
    const name = String(stat?.name ?? "");
    if (!name || primaryNames.has(name) || stat?.displayValue == null) continue;
    teamStats.push({
      name,
      label: prettify(name, stat?.label),
      home: String(stat.displayValue),
      away: valueFor(awayStats, name) ?? "-",
      primary: false,
    });
  }

  const lineups: TeamLineup[] = (json?.rosters ?? []).map((roster: any) => ({
    teamId: roster?.team?.id != null ? String(roster.team.id) : null,
    team: roster?.team?.displayName ?? "",
    logo: roster?.team?.id ? `https://a.espncdn.com/i/teamlogos/soccer/500/${roster.team.id}.png` : null,
    formation: roster?.formation ?? null,
    players: (roster?.roster ?? []).map((player: any, index: number) => {
      const stats: Record<string, string> = {};
      for (const stat of player?.stats ?? []) {
        if (stat?.name) stats[String(stat.name)] = String(stat.displayValue ?? "0");
      }
      return {
        id: String(player?.athlete?.id ?? player?.athlete?.displayName ?? `p-${index}`),
        name: player?.athlete?.displayName ?? "",
        jersey: player?.jersey ?? null,
        position: player?.position?.abbreviation ?? player?.position?.name ?? null,
        starter: !!player?.starter,
        subbedIn: !!player?.subbedIn,
        subbedOut: !!player?.subbedOut,
        stats,
      };
    }),
  }));
  const populatedLineups = lineups.filter((lineup) => lineup.players.length > 0);
  return {
    available: actions.length > 0 || teamStats.length > 0 || populatedLineups.length > 0,
    status: norm.status,
    clock: norm.clock,
    homeTeamId: norm.homeTeamId,
    awayTeamId: norm.awayTeamId,
    home: norm.home,
    away: norm.away,
    events: actions,
    shootout,
    teamStats,
    lineups: populatedLineups,
    source: norm.source,
    fetchedAt: new Date().toISOString(),
  };
}