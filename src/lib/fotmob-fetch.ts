// Single FotMob access point for every server-side match data read.
//
// FotMob is the only match data provider used by this app. ESPN was removed
// because its hosts refuse our serverless egress (403/400), which left live
// scores, cup fixtures and fantasy scoring blank.

const FETCH_TIMEOUT_MS = 8_000;
const BORO_TEAM_ID = 8549;

type CacheEntry = { at: number; value: any };

const cache = new Map<string, CacheEntry>();
const lastGood = new Map<string, CacheEntry>();
const LAST_GOOD_MAX_AGE_MS = 15 * 60 * 1000;

/**
 * Fetch JSON from FotMob with a short in-memory cache. When a request fails we
 * fall back to the most recent good payload (up to 15 minutes old) so the UI
 * shows the last known scores instead of going blank.
 */
export async function fotmobJson<T = any>(url: string, ttlMs = 20_000): Promise<T | null> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
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
      console.error("[fotmob] request refused", response.status, url);
      return servedLastGood<T>(url);
    }
    const value = await response.json();
    cache.set(url, { at: Date.now(), value });
    lastGood.set(url, { at: Date.now(), value });
    return value as T;
  } catch (error) {
    console.error("[fotmob] request failed", String(error), url);
    return servedLastGood<T>(url);
  }
}

function servedLastGood<T>(url: string): T | null {
  const previous = lastGood.get(url);
  if (previous && Date.now() - previous.at < LAST_GOOD_MAX_AGE_MS) {
    return previous.value as T;
  }
  return null;
}

/** Middlesbrough team feed: every fixture in every competition, plus the table. */
export function fotmobTeamData(ttlMs = 30_000) {
  return fotmobJson<any>(`https://www.fotmob.com/api/data/teams?id=${BORO_TEAM_ID}`, ttlMs);
}

/** Full detail for one match (status, minute, events, line-ups, stats). */
export function fotmobMatchDetails(matchId: string | number, ttlMs = 15_000) {
  return fotmobJson<any>(
    `https://www.fotmob.com/api/data/matchDetails?matchId=${matchId}`,
    ttlMs,
  );
}

/** Every match FotMob lists for one UTC day, grouped by competition. */
export function fotmobMatchesByDate(ymd: string, ttlMs = 20_000) {
  return fotmobJson<any>(`https://www.fotmob.com/api/data/matches?date=${ymd}`, ttlMs);
}

/** League feed: table plus the full fixture list for a competition. */
export function fotmobLeague(leagueId: number | string, ttlMs = 5 * 60_000) {
  return fotmobJson<any>(`https://www.fotmob.com/api/data/leagues?id=${leagueId}`, ttlMs);
}

/** Club badge served by FotMob. */
export function fotmobTeamLogo(teamId: string | number | null | undefined) {
  return teamId ? `https://images.fotmob.com/image_resources/logo/teamlogo/${teamId}.png` : null;
}

export const FOTMOB_BORO_TEAM_ID = BORO_TEAM_ID;
export const FOTMOB_CHAMPIONSHIP_ID = 48;
export const FOTMOB_WORLD_CUP_ID = 77;

/** yyyymmdd in UTC, the format FotMob's day feed expects. */
export function fotmobDateKey(date: Date) {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(
    date.getUTCDate(),
  ).padStart(2, "0")}`;
}
