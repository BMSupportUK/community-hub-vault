// Server-only live score overlay for the World Cup predictions pages.
// FotMob is queried at read time so the UI is not stuck waiting for the cron sync.

import {
  FOTMOB_WORLD_CUP_ID,
  fotmobDateKey,
  fotmobLeague,
  fotmobMatchesByDate,
} from "@/lib/fotmob-fetch";

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

export type WcLiveMatch = {
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
  homePens: number | null;
  awayPens: number | null;
  penWinner: "home" | "away" | null;
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

/** FotMob writes the live clock as "62'" or "45+2'". */
function parseLiveClock(label: string | null | undefined) {
  const text = String(label ?? "").replace(/[^0-9+]/g, "");
  if (!text) return { minute: null as number | null, minuteAdded: null as number | null };
  const [baseStr, addedStr] = text.split("+");
  const base = parseInt(baseStr ?? "", 10);
  const added = parseInt(addedStr ?? "", 10);
  return {
    minute: Number.isFinite(base) ? base : null,
    minuteAdded: Number.isFinite(added) ? added : null,
  };
}

function sourceScore(ev: WcLiveMatch) {
  const stateScore = ev.status === "FINISHED" ? 20_000 : ev.status === "IN_PLAY" || ev.status === "PAUSED" ? 10_000 : 0;
  return stateScore + (ev.minute ?? 0) + (ev.minuteAdded ?? 0) / 100;
}

export async function fetchWcLive(): Promise<WcLiveMatch[]> {
  try {
    const today = new Date();
    const days = [-1, 0, 1].map((offset) => {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() + offset);
      return fotmobDateKey(d);
    });
    const feeds = await Promise.all(days.map((day) => fotmobMatchesByDate(day, 15_000)));

    const byMatch = new Map<string, WcLiveMatch>();
    for (const feed of feeds) {
      const leagues: any[] = feed?.leagues ?? [];
      for (const league of leagues) {
        const isWorldCup =
          Number(league?.primaryId) === FOTMOB_WORLD_CUP_ID ||
          Number(league?.id) === FOTMOB_WORLD_CUP_ID ||
          /world cup/i.test(String(league?.name ?? ""));
        if (!isWorldCup) continue;
        for (const raw of (league?.matches ?? []) as any[]) {
          const status = raw?.status ?? {};
          if (!status?.started) continue;
          const homeName = String(raw?.home?.name ?? raw?.home?.longName ?? "");
          const awayName = String(raw?.away?.name ?? raw?.away?.longName ?? "");
          if (!homeName || !awayName) continue;
          const kickoffMs = Date.parse(String(status?.utcTime ?? ""));
          if (!Number.isFinite(kickoffMs)) continue;

          const reason = String(status?.reason?.short ?? status?.reason?.long ?? "").toUpperCase();
          const liveLabel = String(status?.liveTime?.short ?? status?.liveTime?.long ?? "");
          const finished = !!status?.finished;
          const paused = /HT|BREAK/.test(reason) || /HT/i.test(liveLabel);
          const state: string = finished ? "FINISHED" : paused ? "PAUSED" : "IN_PLAY";
          const clock = parseLiveClock(finished ? "" : liveLabel);

          let phase: "ET" | "PENS" | null = null;
          if (/PEN/.test(reason) || /PEN/i.test(liveLabel)) phase = "PENS";
          else if (/AET|ET/.test(reason) || /^ET/i.test(liveLabel)) phase = "ET";

          const homePens = typeof raw?.home?.penScore === "number" ? raw.home.penScore : null;
          const awayPens = typeof raw?.away?.penScore === "number" ? raw.away.penScore : null;
          let penWinner: "home" | "away" | null = null;
          if (homePens !== null && awayPens !== null && homePens !== awayPens) {
            penWinner = homePens > awayPens ? "home" : "away";
          }

          const match: WcLiveMatch = {
            home: homeName,
            away: awayName,
            kickoffMs,
            status: state,
            minute: clock.minute,
            minuteAdded: clock.minuteAdded,
            homeScore: typeof raw?.home?.score === "number" ? raw.home.score : null,
            awayScore: typeof raw?.away?.score === "number" ? raw.away.score : null,
            homeReds: 0,
            awayReds: 0,
            phase,
            homePens,
            awayPens,
            penWinner,
          };
          const key = `${kickoffMs}|${norm(match.home)}|${norm(match.away)}`;
          const existing = byMatch.get(key);
          if (!existing || sourceScore(match) >= sourceScore(existing)) byMatch.set(key, match);
        }
      }
    }
    return [...byMatch.values()];
  } catch (error) {
    console.error("[wc-live-scores] fotmob live failed", String(error));
    return [];
  }
}

export type WcFixture = {
  home: string;
  away: string;
  kickoffMs: number;
};

/**
 * Every World Cup fixture FotMob lists for the tournament. Used to resolve
 * placeholder team names (e.g. "3rd Group A/B/C/D/F", "Winner Match 99") in
 * knockout rows once FIFA confirms the matchups.
 */
export async function fetchWcAllFixtures(): Promise<WcFixture[]> {
  try {
    const league = await fotmobLeague(FOTMOB_WORLD_CUP_ID, 10 * 60_000);
    const all: any[] = league?.fixtures?.allMatches ?? league?.matches?.allMatches ?? [];
    const out: WcFixture[] = [];
    const seen = new Set<string>();
    for (const raw of all) {
      const home = String(raw?.home?.name ?? raw?.home?.longName ?? "");
      const away = String(raw?.away?.name ?? raw?.away?.longName ?? "");
      const kickoffMs = Date.parse(String(raw?.status?.utcTime ?? raw?.time ?? ""));
      if (!home || !away || !Number.isFinite(kickoffMs)) continue;
      const key = `${kickoffMs}|${home}|${away}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ home, away, kickoffMs });
    }
    return out;
  } catch (error) {
    console.error("[wc-live-scores] fotmob fixtures failed", String(error));
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
    const live = await fetchWcLive();
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

// Pick the freshest source per field. If FotMob is missing, partial, or stale
// (lower minute than what the cron sync already wrote), prefer the DB row so
// the live timer never ticks backwards or freezes on a stale snapshot.
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

  // If DB already says FINISHED, never demote it back to IN_PLAY from a stale snapshot.
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

  // If both sources are mid-match but the DB clock is ahead, the FotMob payload
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