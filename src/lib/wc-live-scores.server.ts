// Server-only live score overlay for the World Cup predictions pages.
// ESPN is queried at read time so the UI is not stuck waiting for the cron sync.

export type WcLiveFixtureRow = {
  id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  home_score: number | null;
  away_score: number | null;
  status: string | null;
  minute: number | null;
  minute_added: number | null;
  home_reds?: number | null;
  away_reds?: number | null;
};

export type WcLiveOverlay = {
  status: string;
  minute: number | null;
  minute_added: number | null;
  home_score: number | null;
  away_score: number | null;
  home_reds: number | null;
  away_reds: number | null;
  phase: "ET" | "PENS" | null;
};

export type EspnLiveMatch = {
  home: string;
  away: string;
  kickoffMs: number;
  status: string;
  minute: number | null;
  minuteAdded: number | null;
  homeScore: number | null;
  awayScore: number | null;
  homeReds: number;
  awayReds: number;
  phase: "ET" | "PENS" | null;
};

const ALIASES: Record<string, string[]> = {
  "United States": ["USA", "United States of America"],
  "South Korea": ["Korea Republic", "Republic of Korea"],
  Iran: ["IR Iran", "Islamic Republic of Iran"],
  "Ivory Coast": ["Côte d'Ivoire", "Cote d'Ivoire"],
  Türkiye: ["Turkey", "Turkiye"],
  "DR Congo": ["Democratic Republic of the Congo", "Congo DR"],
  "Republic of Ireland": ["Ireland"],
  "Czech Republic": ["Czechia"],
  "Bosnia and Herzegovina": ["Bosnia-Herzegovina", "Bosnia & Herzegovina"],
  "Cape Verde": ["Cape Verde Islands"],
};

function norm(s: string | null | undefined) {
  return (s ?? "").trim().toLowerCase();
}

function nameMatches(dbName: string, apiName: string) {
  const a = norm(dbName);
  const b = norm(apiName);
  if (a === b) return true;
  for (const [canonical, aliases] of Object.entries(ALIASES)) {
    const all = [canonical, ...aliases].map(norm);
    if (all.includes(a) && all.includes(b)) return true;
  }
  return false;
}

export function findWcLiveFixture(
  fixtures: WcLiveFixtureRow[],
  homeName: string,
  awayName: string,
  kickoffMs: number,
): WcLiveFixtureRow | undefined {
  const candidates = fixtures.filter(
    (f) =>
      nameMatches(f.home_team, homeName) &&
      nameMatches(f.away_team, awayName) &&
      Math.abs(new Date(f.kickoff_at).getTime() - kickoffMs) <= 5 * 24 * 60 * 60 * 1000,
  );
  return candidates.sort(
    (a, b) =>
      Math.abs(new Date(a.kickoff_at).getTime() - kickoffMs) -
      Math.abs(new Date(b.kickoff_at).getTime() - kickoffMs),
  )[0];
}

function parseEspnMinute(displayClock?: string, rawClock?: number, state?: string) {
  if (state !== "in") return { minute: null, minuteAdded: null };
  const [baseStr, addedStr] = (displayClock ?? "").split("+");
  const base = parseInt(baseStr ?? "", 10);
  const addedParsed = parseInt(addedStr ?? "", 10);
  const minute = Number.isFinite(base)
    ? base
    : typeof rawClock === "number" && rawClock > 0
      ? Math.max(1, Math.ceil(rawClock / 60))
      : null;
  return {
    minute,
    minuteAdded: Number.isFinite(addedParsed) ? addedParsed : null,
  };
}

function sourceScore(ev: EspnLiveMatch) {
  const stateScore = ev.status === "FINISHED" ? 20_000 : ev.status === "IN_PLAY" || ev.status === "PAUSED" ? 10_000 : 0;
  return stateScore + (ev.minute ?? 0) + (ev.minuteAdded ?? 0) / 100;
}

export async function fetchEspnWcLive(): Promise<EspnLiveMatch[]> {
  try {
    const today = new Date();
    const ymd = (d: Date) =>
      `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
    const dates = [-1, 0, 1].map((offset) => {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() + offset);
      return ymd(d);
    });
    const responses = await Promise.all(
      ["", ...dates.map((d) => `?dates=${d}`)].map((qs) =>
        fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard${qs}`, {
          headers: { accept: "application/json" },
        })
          .then((r) => (r.ok ? r.json() : { events: [] }))
          .catch(() => ({ events: [] })),
      ),
    );

    type EspnJson = {
      events?: Array<{
        date?: string;
        competitions?: Array<{
          status?: {
            clock?: number;
            displayClock?: string;
            type?: { state?: string; name?: string };
          };
          competitors?: Array<{
            id?: string;
            homeAway?: string;
            score?: string;
            team?: { id?: string; displayName?: string };
          }>;
          details?: Array<{
            type?: { id?: string; text?: string };
            team?: { id?: string };
          }>;
        }>;
      }>;
    };

    const byMatch = new Map<string, EspnLiveMatch>();
    const allEvents = (responses as EspnJson[]).flatMap((j) => j.events ?? []);
    for (const e of allEvents) {
      const comp = e.competitions?.[0];
      if (!comp || !e.date) continue;
      const state = comp.status?.type?.state;
      if (state !== "in" && state !== "post") continue;
      const homeC = comp.competitors?.find((c) => c.homeAway === "home");
      const awayC = comp.competitors?.find((c) => c.homeAway === "away");
      if (!homeC?.team?.displayName || !awayC?.team?.displayName) continue;
      const typeName = comp.status?.type?.name ?? "";
      const status = state === "post" ? "FINISHED" : typeName === "STATUS_HALFTIME" ? "PAUSED" : "IN_PLAY";
      const parsed = parseEspnMinute(comp.status?.displayClock, comp.status?.clock, state);
      // Detect knockout phase from ESPN's status type name.
      // Examples: STATUS_FIRST_HALF_EXTRA_TIME, STATUS_END_OF_EXTRATIME, STATUS_SHOOTOUT, STATUS_FINAL_PEN, STATUS_FINAL_AET.
      let phase: "ET" | "PENS" | null = null;
      if (/SHOOTOUT|FINAL_PEN|PENALTY/i.test(typeName)) phase = "PENS";
      else if (/OVERTIME|EXTRA[_ ]?TIME|FINAL_AET/i.test(typeName)) phase = "ET";
      const homeTeamId = homeC.team?.id ?? homeC.id ?? "";
      const awayTeamId = awayC.team?.id ?? awayC.id ?? "";
      let homeReds = 0;
      let awayReds = 0;
      for (const d of comp.details ?? []) {
        const txt = d.type?.text ?? "";
        if (!/red/i.test(txt)) continue;
        const tid = d.team?.id ?? "";
        if (tid && tid === homeTeamId) homeReds += 1;
        else if (tid && tid === awayTeamId) awayReds += 1;
      }
      const match: EspnLiveMatch = {
        home: homeC.team.displayName,
        away: awayC.team.displayName,
        kickoffMs: new Date(e.date).getTime(),
        status,
        minute: parsed.minute,
        minuteAdded: parsed.minuteAdded,
        homeScore: homeC.score != null && homeC.score !== "" ? Number(homeC.score) : null,
        awayScore: awayC.score != null && awayC.score !== "" ? Number(awayC.score) : null,
        homeReds,
        awayReds,
        phase,
      };
      const key = `${e.date}|${norm(match.home)}|${norm(match.away)}`;
      const existing = byMatch.get(key);
      if (!existing || sourceScore(match) >= sourceScore(existing)) byMatch.set(key, match);
    }
    return [...byMatch.values()];
  } catch {
    return [];
  }
}

export type EspnWcFixture = {
  home: string;
  away: string;
  kickoffMs: number;
};

/**
 * Wider ESPN sweep covering the next few months of World Cup fixtures.
 * Used to resolve placeholder team names (e.g. "3rd Group A/B/C/D/F",
 * "Winner Match 99") in knockout rows once FIFA confirms the matchups.
 */
export async function fetchEspnWcAllFixtures(): Promise<EspnWcFixture[]> {
  try {
    const today = new Date();
    const ym = (d: Date) =>
      `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const months: string[] = [];
    for (let i = 0; i <= 2; i += 1) {
      const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + i, 1));
      months.push(ym(d));
    }
    const responses = await Promise.all(
      months.map((m) =>
        fetch(
          `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${m}&limit=200`,
          { headers: { accept: "application/json" } },
        )
          .then((r) => (r.ok ? r.json() : { events: [] }))
          .catch(() => ({ events: [] })),
      ),
    );
    type EspnJson = {
      events?: Array<{
        date?: string;
        competitions?: Array<{
          competitors?: Array<{
            homeAway?: string;
            team?: { displayName?: string };
          }>;
        }>;
      }>;
    };
    const out: EspnWcFixture[] = [];
    const seen = new Set<string>();
    for (const j of responses as EspnJson[]) {
      for (const e of j.events ?? []) {
        const comp = e.competitions?.[0];
        if (!comp || !e.date) continue;
        const home = comp.competitors?.find((c) => c.homeAway === "home")?.team?.displayName ?? "";
        const away = comp.competitors?.find((c) => c.homeAway === "away")?.team?.displayName ?? "";
        if (!home || !away) continue;
        const key = `${e.date}|${home}|${away}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ home, away, kickoffMs: new Date(e.date).getTime() });
      }
    }
    return out;
  } catch {
    return [];
  }
}

const PLACEHOLDER_RE = /^(3rd\s+Group|Winner\s+(Match|Group)|Loser\s+(Match|Group)|Round\s+of\s+\d+|TBD|TBC)/i;

export function isWcPlaceholderName(name: string | null | undefined): boolean {
  if (!name) return true;
  return PLACEHOLDER_RE.test(name.trim());
}

export async function getWcLiveOverlays(fixtures: WcLiveFixtureRow[]) {
  const overlays = new Map<string, WcLiveOverlay>();
  try {
    const live = await fetchEspnWcLive();
    for (const ev of live) {
      const fx = findWcLiveFixture(fixtures, ev.home, ev.away, ev.kickoffMs);
      if (!fx) continue;
      overlays.set(fx.id, {
        status: ev.status,
        minute: ev.minute,
        minute_added: ev.minuteAdded,
        home_score: ev.homeScore,
        away_score: ev.awayScore,
        home_reds: ev.homeReds,
        away_reds: ev.awayReds,
        phase: ev.phase,
      });
    }
  } catch {
    // Swallow — callers must fall back to the DB row.
  }
  return overlays;
}

// Pick the freshest source per field. If ESPN is missing, partial, or stale
// (lower minute than what the cron sync already wrote), prefer the DB row so
// the live timer never ticks backwards or freezes on a stale ESPN snapshot.
export function mergeWcLive(
  row: Pick<WcLiveFixtureRow, "home_score" | "away_score" | "status" | "minute" | "minute_added" | "home_reds" | "away_reds">,
  overlay: WcLiveOverlay | undefined,
) {
  const dbStatus = (row.status ?? "SCHEDULED") as string;
  const dbMinute = (row.minute ?? null) as number | null;
  const dbAdded = (row.minute_added ?? null) as number | null;
  const dbHome = (row.home_score ?? null) as number | null;
  const dbAway = (row.away_score ?? null) as number | null;
  const dbHomeReds = (row.home_reds ?? 0) as number;
  const dbAwayReds = (row.away_reds ?? 0) as number;

  if (!overlay) {
    return {
      home_score: dbHome,
      away_score: dbAway,
      status: dbStatus,
      minute: dbMinute,
      minute_added: dbAdded,
      home_reds: dbHomeReds,
      away_reds: dbAwayReds,
      phase: null as "ET" | "PENS" | null,
    };
  }

  // If DB already says FINISHED, never demote it back to IN_PLAY from a stale ESPN snapshot.
  if (dbStatus === "FINISHED" && overlay.status !== "FINISHED") {
    return {
      home_score: dbHome,
      away_score: dbAway,
      status: dbStatus,
      minute: dbMinute,
      minute_added: dbAdded,
      home_reds: dbHomeReds,
      away_reds: dbAwayReds,
      phase: null as "ET" | "PENS" | null,
    };
  }

  const overlayClock = (overlay.minute ?? 0) + (overlay.minute_added ?? 0) / 100;
  const dbClock = (dbMinute ?? 0) + (dbAdded ?? 0) / 100;
  const overlayLive = overlay.status === "IN_PLAY" || overlay.status === "PAUSED";
  const dbLive = dbStatus === "IN_PLAY" || dbStatus === "PAUSED";

  // If both sources are mid-match but the DB clock is ahead, the ESPN payload
  // is stale — keep the freshest values we already have.
  if (overlayLive && dbLive && dbClock > overlayClock) {
    return {
      home_score: dbHome,
      away_score: dbAway,
      status: dbStatus,
      minute: dbMinute,
      minute_added: dbAdded,
      home_reds: Math.max(dbHomeReds, overlay.home_reds ?? 0),
      away_reds: Math.max(dbAwayReds, overlay.away_reds ?? 0),
      phase: overlay.phase,
    };
  }

  return {
    home_score: overlay.home_score ?? dbHome,
    away_score: overlay.away_score ?? dbAway,
    status: overlay.status ?? dbStatus,
    minute: overlay.minute ?? dbMinute,
    minute_added: overlay.minute_added ?? dbAdded,
    home_reds: Math.max(dbHomeReds, overlay.home_reds ?? 0),
    away_reds: Math.max(dbAwayReds, overlay.away_reds ?? 0),
    phase: overlay.phase,
  };
}