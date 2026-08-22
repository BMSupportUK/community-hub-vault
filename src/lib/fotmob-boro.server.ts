// Server-side Boro match feed. FotMob is used because its data endpoint is
// reachable from the production worker, unlike ESPN's site API.

const BORO_TEAM_ID = 8549;
const FETCH_TIMEOUT_MS = 8_000;
const cache = new Map<string, { at: number; value: any }>();

const norm = (value: string) => value.toLowerCase().replace(/[^a-z]/g, "");

async function fotmobJson(url: string, ttlMs: number): Promise<any | null> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "Mozilla/5.0 (compatible; BoroSupport/1.0)",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error("[fotmob-boro] request refused", response.status, url);
      return null;
    }
    const value = await response.json();
    cache.set(url, { at: Date.now(), value });
    return value;
  } catch (error) {
    console.error("[fotmob-boro] request failed", String(error), url);
    return null;
  }
}

export async function resolveFotmobMatch(input: {
  home: string;
  away: string;
  kickoff: string;
}): Promise<string | null> {
  const data = await fotmobJson(`https://www.fotmob.com/api/data/teams?id=${BORO_TEAM_ID}`, 30_000);
  const fixtures: any[] = data?.fixtures?.allFixtures?.fixtures ?? [];
  const wanted = [norm(input.home), norm(input.away)];
  const kickoff = Date.parse(input.kickoff);
  let best: { id: string; distance: number } | null = null;
  for (const fixture of fixtures) {
    const names = [fixture?.home?.name, fixture?.away?.name].filter(Boolean).map((name) => norm(String(name)));
    if (!wanted.every((name) => names.some((candidate) => candidate.includes(name) || name.includes(candidate)))) continue;
    const distance = Math.abs(Date.parse(String(fixture?.status?.utcTime ?? "")) - kickoff);
    if (!Number.isFinite(distance) || distance > 36 * 60 * 60 * 1000 || !fixture?.id) continue;
    if (!best || distance < best.distance) best = { id: String(fixture.id), distance };
  }
  return best?.id ?? null;
}

function displayStat(stat: any): string {
  const value = stat?.value;
  if (value == null) return "0";
  if (stat?.total != null) return `${value}/${stat.total}`;
  return String(value);
}

function playerStats(detail: any, playerId: unknown): Array<{ name: string; displayValue: string }> {
  const player = detail?.content?.playerStats?.[String(playerId)];
  const output: Array<{ name: string; displayValue: string }> = [];
  const names: Record<string, string> = {
    rating_title: "rating",
    minutes_played: "minutesPlayed",
    goals: "totalGoals",
    assists: "goalAssists",
    total_shots: "totalShots",
    ShotsOnTarget: "shotsOnTarget",
    fouls: "foulsCommitted",
    was_fouled: "foulsSuffered",
    yellow_cards: "yellowCards",
    red_cards: "redCards",
    saves: "saves",
  };
  for (const section of player?.stats ?? []) {
    for (const item of Object.values(section?.stats ?? {}) as any[]) {
      const name = names[String(item?.key ?? "")];
      if (name && !output.some((entry) => entry.name === name)) {
        output.push({ name, displayValue: displayStat(item?.stat) });
      }
    }
  }
  return output;
}

function mapLineup(detail: any, side: "homeTeam" | "awayTeam") {
  const team = detail?.content?.lineup?.[side];
  if (!team) return null;
  const substitutions: any[] = detail?.content?.matchFacts?.events?.events?.filter(
    (event: any) => event?.type === "Substitution" && event?.isHome === (side === "homeTeam"),
  ) ?? [];
  const subbedIn = new Set(substitutions.map((event) => String(event?.swap?.[0]?.id ?? "")));
  const subbedOut = new Set(substitutions.map((event) => String(event?.swap?.[1]?.id ?? "")));
  const mapPlayer = (player: any, starter: boolean) => ({
    athlete: { id: String(player?.id ?? ""), displayName: String(player?.name ?? "") },
    jersey: player?.shirtNumber != null ? String(player.shirtNumber) : null,
    position: { abbreviation: player?.usualPosition ?? null },
    starter,
    subbedIn: { didSub: subbedIn.has(String(player?.id ?? "")) },
    subbedOut: { didSub: subbedOut.has(String(player?.id ?? "")) },
    stats: playerStats(detail, player?.id),
  });
  return {
    team: { id: String(team.id), displayName: team.name },
    formation: team.formation ?? null,
    roster: [
      ...(team.starters ?? []).map((player: any) => mapPlayer(player, true)),
      ...(team.subs ?? []).map((player: any) => mapPlayer(player, false)),
    ],
  };
}

const STAT_NAMES: Record<string, string> = {
  BallPossesion: "possessionPct",
  total_shots: "totalShots",
  ShotsOnTarget: "shotsOnTarget",
  blocked_shots: "blockedShots",
  corners: "wonCorners",
  Offsides: "offsides",
  fouls: "foulsCommitted",
  yellow_cards: "yellowCards",
  red_cards: "redCards",
  saves: "saves",
  accurate_passes: "accuratePasses",
  passes: "totalPasses",
};

/** Converts FotMob's response into the ESPN-shaped object used by the existing UI and forum builders. */
export async function fetchFotmobSummary(input: {
  home: string;
  away: string;
  kickoff: string;
}): Promise<any | null> {
  const matchId = await resolveFotmobMatch(input);
  if (!matchId) return null;
  const detail = await fotmobJson(`https://www.fotmob.com/api/data/matchDetails?matchId=${matchId}`, 5_000);
  const teams: any[] = detail?.header?.teams ?? [];
  if (teams.length < 2) return null;
  const status = detail.header.status ?? {};
  const reason = status?.reason?.short ?? status?.reason?.long ?? (status.started ? "Live" : "Scheduled");
  const state = status.finished ? "post" : status.started ? "in" : "pre";
  const competitors = teams.map((team, index) => ({
    homeAway: index === 0 ? "home" : "away",
    team: { id: String(team.id), displayName: team.name, name: team.name },
    score: String(team.score ?? 0),
  }));
  const rawEvents: any[] = detail?.content?.matchFacts?.events?.events ?? [];
  const keyEvents = rawEvents.map((event, index) => {
    const type = String(event?.type ?? "");
    const card = String(event?.card ?? "").toLowerCase();
    const isGoal = type === "Goal";
    const isSub = type === "Substitution";
    const isPeriod = type === "Half";
    const players = isSub
      ? (event?.swap ?? []).map((player: any) => ({ athlete: { id: player?.id, displayName: player?.name } }))
      : event?.player?.name
        ? [{ athlete: { id: event.player.id, displayName: event.player.name } }]
        : [];
    if (isGoal && event?.assistInput) players.push({ athlete: { id: event?.assistPlayerId, displayName: event.assistInput } });
    const minute = Number(event?.time ?? event?.timeStr ?? 0);
    const playerIds = isSub
      ? (event?.swap ?? []).map((player: any) => String(player?.id ?? player?.name ?? "")).join("-")
      : String(event?.player?.id ?? event?.player?.name ?? "");
    const stableId = ["fotmob", type || "event", event?.time ?? event?.timeStr ?? index, event?.isHome ? "home" : "away", playerIds]
      .join("-")
      .replace(/[^a-zA-Z0-9-]/g, "-");
    const providerId = event?.eventId ?? event?.reactKey;
    return {
      id: providerId != null && !String(providerId).startsWith("undefined") ? String(providerId) : stableId,
      type: {
        type: isGoal ? (event?.ownGoal ? "own-goal" : "goal") : isSub ? "substitution" : isPeriod ? "halftime" : `${card || type}-card`,
        text: isGoal ? "Goal" : isSub ? "Substitution" : isPeriod ? "Half Time" : `${event?.card ?? ""} Card`,
      },
      shortText: isGoal ? `${event?.player?.name ?? "Goal"} Goal` : isSub ? "Substitution" : `${event?.card ?? ""} Card`,
      text: isGoal
        ? `Goal! ${teams[0].name} ${event?.newScore?.[0] ?? event?.homeScore ?? 0}, ${teams[1].name} ${event?.newScore?.[1] ?? event?.awayScore ?? 0}. ${event?.player?.name ?? ""}`
        : isSub
          ? `Substitution, ${(event?.isHome ? teams[0] : teams[1])?.name ?? ""}.`
          : `${event?.card ?? ""} card for ${event?.player?.name ?? ""}`,
      clock: { displayValue: minute ? `${minute}'` : String(event?.timeStr ?? "") },
      period: { number: minute <= 45 ? 1 : 2 },
      team: { id: String((event?.isHome ? teams[0] : teams[1])?.id ?? "") },
      participants: players,
      scoringPlay: isGoal,
      ownGoal: !!event?.ownGoal,
      redCard: card.includes("red"),
      yellowCard: card.includes("yellow"),
      homeScore: event?.newScore?.[0] ?? event?.homeScore ?? null,
      awayScore: event?.newScore?.[1] ?? event?.awayScore ?? null,
      shootout: !!event?.isPenaltyShootoutEvent,
    };
  });
  const allStats: any[] = detail?.content?.stats?.Periods?.All?.stats ?? [];
  const flatStats = allStats.flatMap((group) => group?.stats ?? []);
  const uniqueStats = new Map<string, any>();
  for (const stat of flatStats) {
    const name = STAT_NAMES[String(stat?.key ?? "")];
    if (name && Array.isArray(stat?.stats) && !uniqueStats.has(name)) uniqueStats.set(name, stat);
  }
  const teamStats = (index: number) => [...uniqueStats.entries()].map(([name, stat]) => ({
    name,
    label: stat.title,
    displayValue: String(stat.stats[index] ?? "-"),
  }));
  const lineups = [mapLineup(detail, "homeTeam"), mapLineup(detail, "awayTeam")].filter(Boolean);
  return {
    header: {
      id: matchId,
      league: { slug: "fotmob" },
      competitions: [{
        date: status.utcTime ?? input.kickoff,
        competitors,
        status: {
          displayClock: state === "in" ? reason : null,
          type: { state, completed: !!status.finished, shortDetail: reason, detail: reason, description: reason },
        },
      }],
    },
    keyEvents,
    boxscore: {
      teams: competitors.map((competitor, index) => ({ ...competitor, statistics: teamStats(index) })),
    },
    rosters: lineups,
    gameInfo: {},
    _provider: "fotmob",
  };
}