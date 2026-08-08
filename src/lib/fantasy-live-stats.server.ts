// Server-only automatic fantasy scoring. Pulls Middlesbrough player stats from
// ESPN's public match summary once a fixture finishes, writes them into
// fantasy_player_stats and re-scores the gameweek — no admin involvement.

const ESPN_LEAGUES = ["eng.2", "eng.fa", "eng.league_cup", "eng.efl_cup", "eng.efl_trophy"];

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
  position?: { abbreviation?: string };
  stats?: Array<{ name?: string; value?: number }>;
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
};

function statVal(p: EspnRosterPlayer, name: string): number {
  const s = (p.stats ?? []).find((x) => x.name === name);
  return typeof s?.value === "number" ? Math.round(s.value) : 0;
}

function eventMinute(ev: EspnEvent): number {
  const dv = ev.clock?.displayValue ?? "";
  const m = /(\d+)/.exec(dv);
  if (m?.[1]) return parseInt(m[1], 10);
  const v = ev.clock?.value;
  return typeof v === "number" ? Math.max(0, Math.round(v / 60)) : 0;
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
      const res = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard?dates=${ym}&limit=200`,
      );
      if (!res.ok) continue;
      const json = (await res.json()) as {
        events?: Array<{ id?: string; date?: string; name?: string }>;
      };
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
 * Build fantasy stat rows for a finished fixture straight from ESPN.
 * Returns null when the match data isn't available yet.
 */
export async function fetchFantasyStatsForFixture(
  fixture: { id: string; kickoff_at: string; home_team: string; away_team: string },
  players: Array<{ id: string; name: string; position: string }>,
): Promise<FantasyStatRow[] | null> {
  const found = await findEspnEventId(fixture);
  if (!found) return null;
  let summary: EspnSummary;
  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/${found.league}/summary?event=${found.eventId}`,
    );
    if (!res.ok) return null;
    summary = (await res.json()) as EspnSummary;
  } catch {
    return null;
  }

  const boroSide = (summary.rosters ?? []).find((r) => BORO_RE.test(r.team?.displayName ?? ""));
  if (!boroSide?.roster?.length) return null;

  // Goals conceded by Boro in this match, from the header scoreline.
  const comps = summary.header?.competitions?.[0]?.competitors ?? [];
  let conceded = 0;
  for (const c of comps) {
    if (!BORO_RE.test(c.team?.displayName ?? "")) conceded = parseInt(c.score ?? "0", 10) || 0;
  }

  // Player lookup: exact normalised name, then surname.
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
  const matchPlayer = (displayName: string) => {
    const n = norm(displayName);
    const exact = byName.get(n);
    if (exact) return exact;
    const surname = n.split(" ").slice(-1)[0] ?? n;
    const list = bySurname.get(surname);
    if (list && list.length === 1) return list[0]!;
    // Try "first initial + surname" disambiguation.
    if (list && list.length > 1) {
      const first = n.split(" ")[0] ?? "";
      for (const cand of list) {
        const candName = players.find((p) => p.id === cand.id)?.name ?? "";
        if (norm(candName).startsWith(first.slice(0, 1))) return cand;
      }
    }
    return null;
  };

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
      minutes = rp.subbedOut ? Math.min(90, subOutMinute.get(athleteId) ?? 90) : 90;
    } else {
      const inAt = subInMinute.get(athleteId);
      minutes = inAt != null ? Math.max(1, 90 - inAt) : appearances > 0 ? 1 : 0;
    }
    if (minutes <= 0) continue;

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
      goals_conceded: target.position === "gk" || target.position === "def" ? conceded : 0,
      yellows: statVal(rp, "yellowCards"),
      reds: statVal(rp, "redCards"),
      own_goals: statVal(rp, "ownGoals"),
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
  pending: string[];
  errors: string[];
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const errors: string[] = [];
  const scored: string[] = [];
  const pending: string[] = [];

  const { data: gws, error } = await supabaseAdmin
    .from("fantasy_gameweeks")
    .select("id, gw_number, status, lock_at, fixture_id, boro_fixtures!inner(id, kickoff_at, home_team, away_team, status, competition)")
    .order("gw_number", { ascending: true });
  if (error) return { ok: false, locked: 0, scored, pending, errors: [error.message] };

  const { data: playerRows, error: pErr } = await supabaseAdmin
    .from("fantasy_players")
    .select("id, name, position");
  if (pErr) return { ok: false, locked: 0, scored, pending, errors: [pErr.message] };
  const players = (playerRows ?? []) as Array<{ id: string; name: string; position: string }>;

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
  }

  return { ok: errors.length === 0, locked, scored, pending, errors };
}
