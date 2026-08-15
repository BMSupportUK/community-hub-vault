// Server-only automatic fantasy scoring. Pulls Middlesbrough player stats from
// ESPN's public match summary once a fixture finishes, writes them into
// fantasy_player_stats and re-scores the gameweek — no admin involvement.

import { espnJson } from "@/lib/espn-fetch";

const ESPN_LEAGUES = ["eng.2", "eng.fa", "eng.league_cup", "eng.trophy"];

const BORO_RE = /\bmiddles(?:brough|borough)\b|\bboro\b/i;

function norm(s: string | null | undefined) {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type EspnAthlete = { id?: string; displayName?: string };
type EspnEvent = {
  type?: { type?: string; text?: string };
  clock?: { displayValue?: string; value?: number };
  text?: string | null;
  participants?: Array<{ athlete?: EspnAthlete }> | null;
  team?: { id?: string; displayName?: string } | null;
};
type EspnRosterPlayer = {
  starter?: boolean;
  subbedIn?: boolean;
  subbedOut?: boolean;
  athlete?: EspnAthlete;
  // NOTE: ESPN's position field is deliberately NOT read. Positions always come
  // from our own fantasy_players.position so scoring can't be skewed by ESPN
  // classifying a player differently. Only raw stats are taken from ESPN.
  stats?: Array<{ name?: string; abbreviation?: string; value?: number; displayValue?: string }>;
};
type EspnSummary = {
  rosters?: Array<{
    homeAway?: string;
    team?: { id?: string; displayName?: string };
    roster?: EspnRosterPlayer[];
  }>;
  keyEvents?: EspnEvent[];
  header?: {
    competitions?: Array<{
      competitors?: Array<{ homeAway?: string; score?: string; team?: { displayName?: string } }>;
      status?: {
        clock?: number;
        displayClock?: string;
        type?: { state?: string; completed?: boolean; name?: string };
      };
    }>;
  };
};

export type FantasyStatRow = {
  player_id: string;
  fixture_id: string;
  minutes: number;
  goals: number;
  assists: number;
  saves: number;
  pens_saved: number;
  pens_missed: number;
  goals_conceded: number;
  yellows: number;
  reds: number;
  own_goals: number;
  bonus: number;
  shots: number;
  shots_on_target: number;
  shots_faced: number;
  fouls_committed: number;
  fouls_suffered: number;
  offsides: number;
  // Extended ESPN match-report player stats (0 when the feed omits them).
  accurate_long_balls: number;
  accurate_passes: number;
  passes: number;
  pass_pct: number;
  big_chances_created: number;
  big_chances_missed: number;
  crosses_claimed: number;
  unclaimed_crosses: number;
  defensive_interventions: number;
  duels_won: number;
  keeper_sweepers: number;
  shots_on_goal_against: number;
  touches: number;
};

function statVal(p: EspnRosterPlayer, name: string): number {
  const s = (p.stats ?? []).find((x) => x.name === name);
  return typeof s?.value === "number" ? Math.round(s.value) : 0;
}

/**
 * Read a stat by the abbreviation ESPN prints in the match report player stats
 * table (A, TCH, AC.PASS, BCC, DUELW …). Falls back to the raw display value
 * so percentage columns like PASS% still come through.
 */
function abbrVal(p: EspnRosterPlayer, abbr: string): number {
  const s = (p.stats ?? []).find(
    (x) => (x.abbreviation ?? "").toUpperCase() === abbr.toUpperCase(),
  );
  if (!s) return 0;
  if (typeof s.value === "number") return Math.round(s.value * 10) / 10;
  const n = parseFloat((s.displayValue ?? "").replace("%", ""));
  return Number.isFinite(n) ? n : 0;
}

function eventMinute(ev: EspnEvent): number {
  const dv = ev.clock?.displayValue ?? "";
  const m = /(\d+)/.exec(dv);
  if (m?.[1]) return parseInt(m[1], 10);
  const v = ev.clock?.value;
  return typeof v === "number" ? Math.max(0, Math.round(v / 60)) : 0;
}

/**
 * Match an ESPN display name onto one of our fantasy players: exact normalised
 * name, then surname, then "first initial + surname" disambiguation.
 */
export function makePlayerMatcher(players: Array<{ id: string; name: string; position: string }>) {
  const byName = new Map<string, { id: string; position: string }>();
  const bySurname = new Map<string, Array<{ id: string; position: string }>>();
  for (const p of players) {
    const n = norm(p.name);
    byName.set(n, { id: p.id, position: p.position });
    const surname = n.split(" ").slice(-1)[0] ?? n;
    const list = bySurname.get(surname) ?? [];
    list.push({ id: p.id, position: p.position });
    bySurname.set(surname, list);
  }
  return (displayName: string): { id: string; position: string } | null => {
    const n = norm(displayName);
    const exact = byName.get(n);
    if (exact) return exact;
    const surname = n.split(" ").slice(-1)[0] ?? n;
    const list = bySurname.get(surname);
    if (list && list.length === 1) return list[0]!;
    if (list && list.length > 1) {
      const first = n.split(" ")[0] ?? "";
      for (const cand of list) {
        const candName = players.find((p) => p.id === cand.id)?.name ?? "";
        if (norm(candName).startsWith(first.slice(0, 1))) return cand;
      }
    }
    return null;
  };
}

/** Find the ESPN event id for one of our fixtures (kickoff + opponent match). */
async function findEspnEventId(fixture: {
  kickoff_at: string;
  home_team: string;
  away_team: string;
}): Promise<{ league: string; eventId: string } | null> {
  const ko = new Date(fixture.kickoff_at);
  const ym = `${ko.getUTCFullYear()}${String(ko.getUTCMonth() + 1).padStart(2, "0")}`;
  const opponent = BORO_RE.test(fixture.home_team) ? fixture.away_team : fixture.home_team;
  const wantOpp = norm(opponent);

  for (const league of ESPN_LEAGUES) {
    try {
      const json = (await espnJson(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard?dates=${ym}&limit=400`,
      )) as { events?: Array<{ id?: string; date?: string; name?: string }> } | null;
      if (!json) continue;
      for (const ev of json.events ?? []) {
        const name = ev.name ?? "";
        if (!BORO_RE.test(name)) continue;
        const n = norm(name);
        const oppHit = wantOpp && (n.includes(wantOpp) || wantOpp.split(" ").every((w) => w.length > 3 && n.includes(w)));
        if (!oppHit) continue;
        const evMs = ev.date ? Date.parse(ev.date) : NaN;
        if (Number.isFinite(evMs) && Math.abs(evMs - ko.getTime()) > 3 * 24 * 3600 * 1000) continue;
        if (ev.id) return { league, eventId: ev.id };
      }
    } catch {
      /* try next league */
    }
  }
  return null;
}

/**
 * The official Middlesbrough starting XI for a fixture, as fantasy player ids.
 * Returns null while ESPN hasn't published the line-up yet.
 */
export async function fetchBoroStarterIds(
  fixture: { kickoff_at: string; home_team: string; away_team: string },
  players: Array<{ id: string; name: string; position: string }>,
): Promise<string[] | null> {
  const found = await findEspnEventId(fixture);
  if (!found) return null;
  const summaryJson = (await espnJson(
    `https://site.api.espn.com/apis/site/v2/sports/soccer/${found.league}/summary?event=${found.eventId}`,
  )) as EspnSummary | null;
  if (!summaryJson) return null;
  const summary: EspnSummary = summaryJson;
  const boroSide = (summary.rosters ?? []).find((r) => BORO_RE.test(r.team?.displayName ?? ""));
  const roster = boroSide?.roster ?? [];
  const starters = roster.filter((r) => r.starter);
  // Guard against a half-published feed: a real XI is eleven names.
  if (starters.length < 11) return null;
  const match = makePlayerMatcher(players);
  const ids: string[] = [];
  for (const rp of starters) {
    const hit = match(rp.athlete?.displayName ?? "");
    if (hit && !ids.includes(hit.id)) ids.push(hit.id);
  }
  return ids.length >= 9 ? ids : null;
}

/**
 * Build fantasy stat rows for a finished fixture straight from ESPN.
 * Returns null when the match data isn't available yet.
 */
export async function fetchFantasyStatsForFixture(
  fixture: { id: string; kickoff_at: string; home_team: string; away_team: string },
  players: Array<{ id: string; name: string; position: string }>,
  opts?: { live?: boolean },
): Promise<FantasyStatRow[] | null> {
  const found = await findEspnEventId(fixture);
  if (!found) return null;
  const summaryJson = (await espnJson(
    `https://site.api.espn.com/apis/site/v2/sports/soccer/${found.league}/summary?event=${found.eventId}`,
  )) as EspnSummary | null;
  if (!summaryJson) return null;
  const summary: EspnSummary = summaryJson;

  const boroSide = (summary.rosters ?? []).find((r) => BORO_RE.test(r.team?.displayName ?? ""));
  if (!boroSide?.roster?.length) return null;

  // How far into the match are we? Used so in-play minutes reflect the live
  // clock instead of assuming a full 90.
  const status = summary.header?.competitions?.[0]?.status;
  const completed = !!status?.type?.completed || (status?.type?.state ?? "") === "post";
  const clockMinute = (() => {
    const dc = status?.displayClock ?? "";
    const m = /(\d+)/.exec(dc);
    if (m?.[1]) return Math.min(120, parseInt(m[1], 10));
    const v = status?.clock;
    if (typeof v === "number" && v > 0) return Math.min(120, Math.round(v / 60));
    return 0;
  })();
  const liveMode = !!opts?.live && !completed;
  const nowMinute = liveMode && clockMinute > 0 ? clockMinute : 90;

  // Goals conceded by Boro in this match, from the header scoreline.
  const comps = summary.header?.competitions?.[0]?.competitors ?? [];
  let conceded = 0;
  for (const c of comps) {
    if (!BORO_RE.test(c.team?.displayName ?? "")) conceded = parseInt(c.score ?? "0", 10) || 0;
  }

  const matchPlayer = makePlayerMatcher(players);

  // Substitution minutes + penalty events from the timeline.
  const subOutMinute = new Map<string, number>();
  const subInMinute = new Map<string, number>();
  const pensMissed = new Map<string, number>();
  let boroPensSaved = 0;
  for (const ev of summary.keyEvents ?? []) {
    const kind = (ev.type?.type ?? ev.type?.text ?? "").toLowerCase();
    const isBoroTeam = BORO_RE.test(ev.team?.displayName ?? "");
    if (kind.includes("substitution")) {
      const inA = ev.participants?.[0]?.athlete?.id;
      const outA = ev.participants?.[1]?.athlete?.id;
      const m = eventMinute(ev);
      if (inA) subInMinute.set(inA, m);
      if (outA) subOutMinute.set(outA, m);
      continue;
    }
    if (kind.includes("penalty") && (kind.includes("miss") || kind.includes("saved"))) {
      if (isBoroTeam) {
        const taker = ev.participants?.[0]?.athlete?.id;
        if (taker) pensMissed.set(taker, (pensMissed.get(taker) ?? 0) + 1);
      } else if (kind.includes("saved")) {
        boroPensSaved += 1;
      }
    }
  }

  const rows: FantasyStatRow[] = [];
  let gkAssigned = false;
  for (const rp of boroSide.roster) {
    const athleteId = rp.athlete?.id ?? "";
    const displayName = rp.athlete?.displayName ?? "";
    if (!displayName) continue;
    const target = matchPlayer(displayName);
    if (!target) continue;

    const appearances = statVal(rp, "appearances");
    const camePlayed = rp.starter || rp.subbedIn || appearances > 0;
    if (!camePlayed) continue;

    let minutes = 0;
    if (rp.starter) {
      minutes = rp.subbedOut
        ? Math.min(nowMinute, subOutMinute.get(athleteId) ?? nowMinute)
        : nowMinute;
    } else {
      const inAt = subInMinute.get(athleteId);
      const cameOff = rp.subbedOut ? Math.min(nowMinute, subOutMinute.get(athleteId) ?? nowMinute) : nowMinute;
      minutes = inAt != null ? Math.max(1, cameOff - inAt) : appearances > 0 ? 1 : 0;
    }
    if (minutes <= 0) continue;

    // Position-dependent scoring uses OUR stored position, never ESPN's.
    const isKeeper = target.position === "gk";
    let pensSaved = 0;
    if (isKeeper && rp.starter && !gkAssigned) {
      pensSaved = boroPensSaved;
      gkAssigned = true;
    }

    rows.push({
      fixture_id: fixture.id,
      player_id: target.id,
      minutes,
      goals: statVal(rp, "totalGoals"),
      assists: statVal(rp, "goalAssists"),
      saves: statVal(rp, "saves"),
      pens_saved: pensSaved,
      pens_missed: pensMissed.get(athleteId) ?? 0,
      // Always store the real goals conceded: whether it costs points depends on
      // the position the manager picked the player in, decided when scoring.
      goals_conceded: conceded,
      yellows: statVal(rp, "yellowCards"),
      reds: statVal(rp, "redCards"),
      own_goals: statVal(rp, "ownGoals"),
      // Straight from ESPN's match report "player stats" table.
      shots: statVal(rp, "totalShots"),
      shots_on_target: statVal(rp, "shotsOnTarget"),
      shots_faced: statVal(rp, "shotsFaced"),
      fouls_committed: statVal(rp, "foulsCommitted"),
      fouls_suffered: statVal(rp, "foulsSuffered"),
      offsides: statVal(rp, "offsides"),
      // Extended stats, read by the abbreviation ESPN prints in the report.
      accurate_long_balls: abbrVal(rp, "AC.LONG"),
      accurate_passes: abbrVal(rp, "AC.PASS"),
      passes: abbrVal(rp, "PASS"),
      pass_pct: abbrVal(rp, "PASS%"),
      big_chances_created: abbrVal(rp, "BCC"),
      big_chances_missed: abbrVal(rp, "BCM"),
      crosses_claimed: abbrVal(rp, "CC"),
      unclaimed_crosses: abbrVal(rp, "UC"),
      defensive_interventions: abbrVal(rp, "DINT"),
      duels_won: abbrVal(rp, "DUELW"),
      keeper_sweepers: abbrVal(rp, "KS"),
      shots_on_goal_against: abbrVal(rp, "SOGA"),
      touches: abbrVal(rp, "TCH"),
      bonus: 0,
    });
  }

  return rows;
}

/**
 * Keep every fantasy gameweek in step with reality: lock gameweeks whose
 * deadline has passed, and score + finalise gameweeks whose fixture is done.
 */
export async function syncFantasyScoring(): Promise<{
  ok: boolean;
  locked: number;
  scored: string[];
  live: string[];
  pending: string[];
  swaps: string[];
  errors: string[];
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const errors: string[] = [];
  const scored: string[] = [];
  const live: string[] = [];
  const pending: string[] = [];
  const swaps: string[] = [];

  const { data: gws, error } = await supabaseAdmin
    .from("fantasy_gameweeks")
    .select("id, gw_number, status, lock_at, fixture_id, boro_fixtures!inner(id, kickoff_at, home_team, away_team, status, competition)")
    .order("gw_number", { ascending: true });
  if (error) return { ok: false, locked: 0, scored, live, pending, swaps, errors: [error.message] };

  const { data: playerRows, error: pErr } = await supabaseAdmin
    .from("fantasy_players")
    .select("id, name, position");
  if (pErr) return { ok: false, locked: 0, scored, live, pending, swaps, errors: [pErr.message] };
  const players = (playerRows ?? []) as Array<{ id: string; name: string; position: string }>;

  // Official starting XI announced? Swap in any bench player who is starting
  // for a picked starter who isn't, before any points are worked out.
  try {
    const { syncLineupSwaps } = await import("@/lib/fantasy-lineup-swap.server");
    const res = await syncLineupSwaps();
    if (res.error) errors.push(`lineup swaps: ${res.error}`);
    swaps.push(...res.swaps);
  } catch (e) {
    errors.push(`lineup swaps: ${e instanceof Error ? e.message : String(e)}`);
  }

  const nowMs = Date.now();
  let locked = 0;
  const { isFantasyLeagueCompetition } = await import("@/lib/fantasy-rules");

  for (const raw of (gws ?? []) as Array<Record<string, any>>) {
    const fx = raw['boro_fixtures'] as
      | { id: string; kickoff_at: string; home_team: string; away_team: string; status: string; competition?: string | null }
      | null;
    if (!fx) continue;
    // League games only.
    if (!isFantasyLeagueCompetition(fx.competition)) continue;
    const finished = fx.status === "FINISHED";

    if (!finished) {
      if (raw['status'] === "upcoming" && Date.parse(raw['lock_at']) <= nowMs) {
        const { error: lockErr } = await supabaseAdmin
          .from("fantasy_gameweeks")
          .update({ status: "locked" } as never)
          .eq("id", raw['id']);
        if (lockErr) errors.push(`lock gw${raw['gw_number']}: ${lockErr.message}`);
        else locked += 1;
      }

      // In-play: pull whatever ESPN has so far so the pitch view and points
      // update minute-by-minute during the game. The gameweek stays "locked"
      // (not final) until the fixture actually finishes.
      const koMs = Date.parse(fx.kickoff_at);
      const inPlayWindow =
        Number.isFinite(koMs) && nowMs >= koMs - 5 * 60_000 && nowMs <= koMs + 4 * 3600_000;
      if (!inPlayWindow) continue;

      const liveRows = await fetchFantasyStatsForFixture(fx, players, { live: true });
      if (!liveRows || liveRows.length === 0) continue;

      const { error: liveUpErr } = await supabaseAdmin
        .from("fantasy_player_stats")
        .upsert(liveRows as never, { onConflict: "fixture_id,player_id" });
      if (liveUpErr) {
        errors.push(`live stats gw${raw['gw_number']}: ${liveUpErr.message}`);
        continue;
      }
      const { error: liveScoreErr } = await supabaseAdmin.rpc("fantasy_score_gameweek" as never, {
        _gameweek_id: raw['id'],
      } as never);
      if (liveScoreErr) errors.push(`live score gw${raw['gw_number']}: ${liveScoreErr.message}`);
      else live.push(`gw${raw['gw_number']} (${liveRows.length} players)`);
      continue;
    }

    // Finished — already finalised with stats? nothing to do.
    const { count: statCount } = await supabaseAdmin
      .from("fantasy_player_stats")
      .select("id", { count: "exact", head: true })
      .eq("fixture_id", fx.id);
    if (raw['status'] === "final" && (statCount ?? 0) > 0) continue;

    const rows = await fetchFantasyStatsForFixture(fx, players);
    if (!rows || rows.length === 0) {
      pending.push(`gw${raw['gw_number']}: no ESPN player data yet`);
      continue;
    }

    const { error: upErr } = await supabaseAdmin
      .from("fantasy_player_stats")
      .upsert(rows as never, { onConflict: "fixture_id,player_id" });
    if (upErr) {
      errors.push(`stats gw${raw['gw_number']}: ${upErr.message}`);
      continue;
    }

    const { error: scoreErr } = await supabaseAdmin.rpc("fantasy_score_gameweek" as never, {
      _gameweek_id: raw['id'],
    } as never);
    if (scoreErr) {
      errors.push(`score gw${raw['gw_number']}: ${scoreErr.message}`);
      continue;
    }

    await supabaseAdmin
      .from("fantasy_gameweeks")
      .update({ status: "final" } as never)
      .eq("id", raw['id']);
    scored.push(`gw${raw['gw_number']} (${rows.length} players)`);

    // Full time and all stats in — source man of the match automatically from
    // the match stats (top scoring Boro player). Admins can override it after.
    try {
      const { autoAwardMotm } = await import("@/lib/fantasy-motm-auto.server");
      const res = await autoAwardMotm(fx.id, raw['id']);
      if (res.awarded) scored.push(`gw${raw['gw_number']} MOTM auto-awarded`);
      else if (res.reason && res.reason !== "already awarded") pending.push(`gw${raw['gw_number']} MOTM: ${res.reason}`);
    } catch (e) {
      errors.push(`motm gw${raw['gw_number']}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { ok: errors.length === 0, locked, scored, live, pending, swaps, errors };
}
