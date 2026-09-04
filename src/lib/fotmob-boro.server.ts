import type { FotmobEventDetail, FotmobEventPlayer } from "@/lib/fotmob-boro.types";
// Server-side Boro match feed. FotMob is used because its data endpoint is
// reachable from the production worker, unlike ESPN's site API.

const BORO_TEAM_ID = 8549;
const FETCH_TIMEOUT_MS = 8_000;
const cache = new Map<string, { at: number; value: any }>();

const norm = (value: string) => value.toLowerCase().replace(/[^a-z]/g, "");

/** FotMob uses short club names; fixtures may carry the full ones (and vice versa). */
const NAME_ALIASES: Record<string, string> = {
  queensparkrangers: "qpr",
  qpr: "qpr",
  westbromwichalbion: "westbrom",
  westbrom: "westbrom",
  wba: "westbrom",
  westhamunited: "westham",
  westham: "westham",
  sheffieldunited: "sheffutd",
  sheffutd: "sheffutd",
  sheffieldwednesday: "sheffwed",
  sheffwed: "sheffwed",
  wolverhamptonwanderers: "wolves",
  wolves: "wolves",
  brightonandhovealbion: "brighton",
  brighton: "brighton",
  boltonwanderers: "bolton",
  bolton: "bolton",
  blackburnrovers: "blackburn",
  blackburn: "blackburn",
  bristolcity: "bristolcity",
  cardiffcity: "cardiff",
  cardiff: "cardiff",
  stokecity: "stoke",
  stoke: "stoke",
  swanseacity: "swansea",
  swansea: "swansea",
  norwichcity: "norwich",
  norwich: "norwich",
  birminghamcity: "birmingham",
  birmingham: "birmingham",
  hullcity: "hull",
  hull: "hull",
  leicestercity: "leicester",
  leicester: "leicester",
  coventrycity: "coventry",
  coventry: "coventry",
  derbycounty: "derby",
  derby: "derby",
  prestonnorthend: "preston",
  preston: "preston",
  charltonathletic: "charlton",
  charlton: "charlton",
  millwallfc: "millwall",
  portsmouthfc: "portsmouth",
  lincolncity: "lincoln",
  lincoln: "lincoln",
  doncasterrovers: "doncaster",
  doncaster: "doncaster",
  wrexhamafc: "wrexham",
  ipswichtown: "ipswich",
  ipswich: "ipswich",
  lutontown: "luton",
  luton: "luton",
  oxfordunited: "oxford",
  oxford: "oxford",
  plymouthargyle: "plymouth",
  plymouth: "plymouth",
  southamptonfc: "southampton",
  middlesbroughfc: "middlesbrough",
};

const canon = (value: string) => {
  const base = norm(value).replace(/^afc/, "").replace(/(fc|afc)$/, "");
  return NAME_ALIASES[base] ?? base;
};

const nameMatches = (a: string, b: string) => {
  const x = canon(a);
  const y = canon(b);
  return x === y || x.includes(y) || y.includes(x);
};


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
  const wanted = [input.home, input.away];
  const kickoff = Date.parse(input.kickoff);
  let best: { id: string; distance: number } | null = null;
  for (const fixture of fixtures) {
    const names = [fixture?.home?.name, fixture?.away?.name].filter(Boolean).map((name) => String(name));
    if (!wanted.every((name) => names.some((candidate) => nameMatches(candidate, name)))) continue;

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
  matchId?: string | null;
}): Promise<any | null> {
  const matchId = input.matchId ?? (await resolveFotmobMatch(input));
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
  const meta = playerMetaMap(detail);
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
    const periodShort = String(event?.halfStrShort ?? "").toUpperCase();
    const periodScore = `${teams[0]?.name ?? ""} ${event?.homeScore ?? 0}, ${teams[1]?.name ?? ""} ${event?.awayScore ?? 0}`;
    // FotMob writes period markers as "First Half ends, Home 0, Away 1."
    const periodText =
      periodShort === "FT"
        ? `Second Half ends, ${periodScore}.`
        : periodShort === "HT"
          ? `First Half ends, ${periodScore}.`
          : `${event?.halfStrShort ?? "Period"}, ${periodScore}.`;
    const addedTime = Number(event?.overloadTime ?? 0);
    const periodClock = addedTime > 0 ? `${minute}+${addedTime}'` : `${minute}'`;
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
        type: isGoal
          ? (event?.ownGoal ? "own-goal" : "goal")
          : isSub
            ? "substitution"
            : isPeriod
              ? periodShort === "FT" ? "fulltime" : "halftime"
              : `${card || type}-card`,
        text: isGoal
          ? "Goal"
          : isSub
            ? "Substitution"
            : isPeriod
              ? periodShort === "FT" ? "Full Time" : "Half Time"
              : `${event?.card ?? ""} Card`,
      },
      shortText: isGoal
        ? `${event?.player?.name ?? "Goal"} Goal`
        : isSub
          ? "Substitution"
          : isPeriod
            ? periodText
            : `${event?.card ?? ""} Card`,
      text: isGoal
        ? `Goal! ${teams[0].name} ${event?.newScore?.[0] ?? event?.homeScore ?? 0}, ${teams[1].name} ${event?.newScore?.[1] ?? event?.awayScore ?? 0}. ${event?.player?.name ?? ""}`
        : isSub
          ? `Substitution, ${(event?.isHome ? teams[0] : teams[1])?.name ?? ""}.`
          : isPeriod
            ? periodText
            : `${event?.card ?? ""} card for ${event?.player?.name ?? ""}`,
      clock: { displayValue: isPeriod ? periodClock : minute ? `${minute}'` : String(event?.timeStr ?? "") },
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
      // FotMob-only presentation detail, used to render match day thread
      // replies in the same shape FotMob shows them.
      fotmob: fotmobEventDetail(event, {
        homeName: String(teams[0]?.name ?? ""),
        awayName: String(teams[1]?.name ?? ""),
        meta,
      }),
     };
   });

  // FotMob labels period markers with stoppage time (e.g. 45+2'). The period
  // event itself carries no added time, so borrow it from the latest event in
  // that half when one is available.
  const addedIn = (from: number, to: number) => {
    let max = 0;
    for (const event of rawEvents) {
      const raw = String(event?.timeStr ?? "");
      const minute = Number(event?.time ?? 0);
      const plus = raw.includes("+") ? Number(raw.split("+")[1]) : 0;
      if (minute >= from && minute <= to && Number.isFinite(plus)) max = Math.max(max, plus);
    }
    return max;
  };
  for (const event of keyEvents) {
    if (event.type.type !== "halftime" && event.type.type !== "fulltime") continue;
    const half = event.type.type === "halftime" ? 45 : 90;
    const added = addedIn(half, half);
    if (added > 0) event.clock = { displayValue: `${half}+${added}'` };
  }


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
  const infoBox = detail?.content?.matchFacts?.infoBox ?? {};
  const stadium = infoBox?.Stadium ?? null;
  const referee = infoBox?.Referee?.text ? String(infoBox.Referee.text) : null;
  const lastFiveGames = mapTeamForm(detail, teams);
  const h2h = mapHeadToHead(detail);
  const insights: Array<{ teamId: string | null; text: string }> = (
    detail?.content?.matchFacts?.insights ?? []
  )
    .filter((item: any) => item?.text)
    .map((item: any) => ({ teamId: item?.teamId != null ? String(item.teamId) : null, text: String(item.text) }));
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
    gameInfo: {
      venue: stadium?.name
        ? { fullName: String(stadium.name), address: { city: stadium?.city ? String(stadium.city) : null } }
        : null,
      officials: referee ? [{ displayName: referee, position: { displayName: "Referee" } }] : [],
    },
    lastFiveGames,
    h2h,
    insights,
    // FotMob serves a predicted XI (lineupType "lastStarting11", source
    // "lastStartingLineups") long before kick-off. Only a real team sheet
    // counts as confirmed.
    _lineupsConfirmed:
      lineups.length === 2 &&
      String(detail?.content?.lineup?.lineupType ?? "") !== "lastStarting11" &&
      String(detail?.content?.lineup?.source ?? "") !== "lastStartingLineups",
    _provider: "fotmob",
  };
}
type PlayerMeta = { number: string | null; position: string | null };

function playerMetaMap(detail: any): Map<string, PlayerMeta> {
  const map = new Map<string, PlayerMeta>();
  for (const side of ["homeTeam", "awayTeam"] as const) {
    const team = detail?.content?.lineup?.[side];
    for (const player of [...(team?.starters ?? []), ...(team?.subs ?? [])] as any[]) {
      if (player?.id == null) continue;
      map.set(String(player.id), {
        number: player?.shirtNumber != null ? String(player.shirtNumber) : null,
        position: player?.usualPosition ? String(player.usualPosition) : null,
      });
    }
  }
  return map;
}

const SHOT_TYPE_LABEL: Record<string, string> = {
  LeftFoot: "Left foot",
  RightFoot: "Right foot",
  Header: "Header",
  Other: "Other",
};

const SHOT_PHRASE: Record<string, string> = {
  LeftFoot: "left footed shot",
  RightFoot: "right footed shot",
  Header: "header",
  Other: "shot",
};

const SITUATION_PHRASE: Record<string, string> = {
  FromCorner: "following a corner",
  SetPiece: "from a set piece",
  FastBreak: "on the counter attack",
  Penalty: "from the penalty spot",
  ThrowInSetPiece: "from a throw-in",
};

function positionLabel(abbrev: string | null): string | null {
  if (!abbrev) return null;
  const map: Record<string, string> = {
    GK: "Goalkeeper",
    CB: "Centre back",
    LB: "Left back",
    RB: "Right back",
    LWB: "Left wing back",
    RWB: "Right wing back",
    DM: "Defensive midfield",
    CM: "Central midfield",
    AM: "Attacking midfield",
    LM: "Left midfield",
    RM: "Right midfield",
    LW: "Left winger",
    RW: "Right winger",
    ST: "Striker",
    CF: "Centre forward",
  };
  return map[abbrev] ?? abbrev;
}

function fotmobEventDetail(
  event: any,
  ctx: { homeName: string; awayName: string; meta: Map<string, PlayerMeta> },
): FotmobEventDetail | null {
  const type = String(event?.type ?? "");
  if (type === "Half") return null;
  const isHome = !!event?.isHome;
  const teamName = isHome ? ctx.homeName : ctx.awayName;
  const minute = event?.timeStr != null ? String(event.timeStr).replace(/\s+/g, "") : String(event?.time ?? "");
  const minuteLabel = minute ? `${minute}'` : "";

  const person = (id: unknown, name: unknown) => {
    if (!name) return null;
    const m = ctx.meta.get(String(id ?? ""));
    const out: FotmobEventPlayer = { name: String(name), number: m?.number ?? null, position: positionLabel(m?.position ?? null) };
    return out;
  };

  if (type === "Goal") {
    const shot = event?.shotmapEvent ?? null;
    const ownGoal = !!event?.ownGoal || !!shot?.isOwnGoal;
    const scorer = person(event?.player?.id, event?.player?.name);
    const assist = event?.assistStr ? String(event.assistStr).replace(/^assist by\s*/i, "") : null;
    const shotType = shot?.shotType ? (SHOT_TYPE_LABEL[String(shot.shotType)] ?? String(shot.shotType)) : null;
    const phrase = shot?.shotType ? (SHOT_PHRASE[String(shot.shotType)] ?? "shot") : "shot";
    const where = shot ? (shot.isFromInsideBox ? " from inside the box" : " from outside the box") : "";
    const situation = shot?.situation ? (SITUATION_PHRASE[String(shot.situation)] ?? "") : "";
    const scoreLine = `${ctx.homeName} ${event?.newScore?.[0] ?? event?.homeScore ?? 0}, ${ctx.awayName} ${event?.newScore?.[1] ?? event?.awayScore ?? 0}.`;
    const sentence = ownGoal
      ? `Own goal! ${scoreLine} ${scorer?.name ?? ""} (${teamName}).`
      : `Goal! ${scoreLine} ${scorer?.name ?? ""} (${teamName}) ${phrase}${where}${situation ? ` ${situation}` : ""}.${assist ? ` Assisted by ${assist}.` : ""}`;
    return {
      minuteLabel,
      headline: ownGoal ? "Own goal!" : event?.isPenaltyShootoutEvent ? "Shootout penalty" : "Goal!",
      narrative: sentence.replace(/\s+/g, " ").trim(),
      teamName,
      isHome,
      player: scorer,
      playerIn: null,
      playerOut: null,
      assist,
      shotType,
      xg: shot?.expectedGoals != null ? Number(shot.expectedGoals).toFixed(2) : null,
      xgot: shot?.expectedGoalsOnTarget != null ? Number(shot.expectedGoalsOnTarget).toFixed(2) : null,
      card: null,
      teamColor: shot?.teamColor ? String(shot.teamColor) : null,
      scoreLine: `${ctx.homeName} ${event?.newScore?.[0] ?? event?.homeScore ?? 0} - ${event?.newScore?.[1] ?? event?.awayScore ?? 0} ${ctx.awayName}`,
      goalMouth:
        shot?.onGoalShot?.x != null && shot?.onGoalShot?.y != null
          ? { x: Number(shot.onGoalShot.x), y: Number(shot.onGoalShot.y) }
          : null,
      onTarget: shot?.isOnTarget ?? null,
    };
  }

  if (type === "Substitution") {
    const inPlayer = person(event?.swap?.[0]?.id, event?.swap?.[0]?.name);
    const outPlayer = person(event?.swap?.[1]?.id, event?.swap?.[1]?.name);
    return {
      minuteLabel,
      headline: "Substitution",
      narrative: `Substitution, ${teamName}. ${inPlayer?.name ?? ""} replaces ${outPlayer?.name ?? ""}.${event?.injuredPlayerOut ? " Injury substitution." : ""}`.replace(/\s+/g, " ").trim(),
      teamName,
      isHome,
      player: null,
      playerIn: inPlayer,
      playerOut: outPlayer,
      assist: null,
      shotType: null,
      xg: null,
      xgot: null,
      card: null,
    };
  }

  const card = event?.card ? String(event.card) : null;
  const shown = person(event?.player?.id, event?.player?.name);
  return {
    minuteLabel,
    headline: card ? `${card} card` : type || "Match event",
    narrative: card
      ? `${card} card, ${teamName}. ${shown?.name ?? ""} is shown a ${card.toLowerCase()} card.${event?.cardDescription ? ` ${event.cardDescription}` : ""}`.replace(/\s+/g, " ").trim()
      : `${type} — ${teamName}`,
    teamName,
    isHome,
    player: shown,
    playerIn: null,
    playerOut: null,
    assist: null,
    shotType: null,
    xg: null,
    xgot: null,
    card,
  };
}

/** FotMob "teamForm" → the ESPN-shaped lastFiveGames block the forum builders read. */
function mapTeamForm(detail: any, teams: any[]): any[] {
  const form: any[] = detail?.content?.matchFacts?.teamForm ?? [];
  return form.slice(0, 2).map((entries: any[], index: number) => {
    const teamId = String(teams[index]?.id ?? "");
    const events = (entries ?? [])
      .slice(-5)
      .reverse()
      .map((entry: any) => {
        const wasHome = String(entry?.home?.id ?? "") === teamId;
        const opponent = wasHome ? entry?.away : entry?.home;
        return {
          gameResult: String(entry?.resultString ?? "").toUpperCase(),
          score: entry?.score ? String(entry.score).replace(/\s+/g, "") : "",
          atVs: wasHome ? "vs" : "@",
          opponent: { id: String(opponent?.id ?? ""), displayName: String(opponent?.name ?? "Opponent") },
          gameDate: entry?.date?.utcTime ?? null,
        };
      });
    return { team: { id: teamId }, events };
  });
}

/** FotMob head-to-head block: overall record plus the completed previous meetings. */
function mapHeadToHead(detail: any): {
  summary: { homeWins: number; draws: number; awayWins: number } | null;
  matches: Array<{ date: string | null; home: string; away: string; score: string; competition: string | null }>;
} {
  const block = detail?.content?.h2h ?? null;
  const summary = Array.isArray(block?.summary)
    ? {
        homeWins: Number(block.summary[0] ?? 0),
        draws: Number(block.summary[1] ?? 0),
        awayWins: Number(block.summary[2] ?? 0),
      }
    : null;
  const matches = (block?.matches ?? [])
    .filter((match: any) => match?.status?.finished && match?.status?.scoreStr)
    .slice(0, 6)
    .map((match: any) => ({
      date: match?.status?.utcTime ?? match?.time?.utcTime ?? null,
      home: String(match?.home?.name ?? ""),
      away: String(match?.away?.name ?? ""),
      score: String(match.status.scoreStr).replace(/\s+/g, ""),
      competition: match?.league?.name ? String(match.league.name) : null,
    }));
  return { summary, matches };
}
