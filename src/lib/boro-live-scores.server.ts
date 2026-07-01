// Server-only live score + cup-fixture syncer for the Boro 26/27 predictions
// page. We poll ESPN's public scoreboard across the Championship + the
// domestic cups so live scores and newly-drawn cup ties show up without
// admin intervention. ESPN is keyless and updates in near real time.

const ESPN_COMPETITIONS: Array<{ slug: string; name: string }> = [
  { slug: "eng.2", name: "Championship" },
  { slug: "eng.fa", name: "FA Cup" },
  { slug: "eng.league_cup", name: "Carabao Cup" },
  { slug: "eng.efl_cup", name: "Carabao Cup" },
  { slug: "eng.efl_trophy", name: "EFL Trophy" },
];

export type EspnBoroMatch = {
  competition: string;
  home: string;
  away: string;
  kickoffMs: number;
  venue: string | null;
  status: string;
  minute: number | null;
  minuteAdded: number | null;
  homeScore: number | null;
  awayScore: number | null;
  homeReds: number;
  awayReds: number;
};

export type BoroFixtureRow = {
  id: string;
  competition: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  venue: string | null;
  home_score: number | null;
  away_score: number | null;
  status: string | null;
  minute: number | null;
  minute_added: number | null;
  home_reds?: number | null;
  away_reds?: number | null;
};

function norm(s: string | null | undefined) {
  return (s ?? "")
    .toLowerCase()
    .replace(/\bfc\b|\bafc\b|\bf\.c\.\b/g, "")
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isBoro(name: string) {
  return /\bmiddles(?:brough|borough)\b|\bboro\b/i.test(name);
}

function nameMatches(a: string, b: string) {
  const na = norm(a);
  const nb = norm(b);
  if (na === nb) return true;
  // Handle "Middlesbrough" vs "Middlesbrough FC" etc — norm already strips
  // those, but cover short/long names of cup opponents too.
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}

function parseMinute(displayClock?: string, rawClock?: number, state?: string) {
  if (state !== "in") return { minute: null, minuteAdded: null };
  const [baseStr, addedStr] = (displayClock ?? "").split("+");
  const base = parseInt(baseStr ?? "", 10);
  const added = parseInt(addedStr ?? "", 10);
  const minute = Number.isFinite(base)
    ? base
    : typeof rawClock === "number" && rawClock > 0
      ? Math.max(1, Math.ceil(rawClock / 60))
      : null;
  return { minute, minuteAdded: Number.isFinite(added) ? added : null };
}

type EspnJson = {
  events?: Array<{
    date?: string;
    competitions?: Array<{
      venue?: { fullName?: string };
      status?: {
        clock?: number;
        displayClock?: string;
        type?: { state?: string; name?: string };
      };
      competitors?: Array<{
        id?: string;
        homeAway?: string;
        score?: string;
        team?: { id?: string; displayName?: string; shortDisplayName?: string };
      }>;
      details?: Array<{
        type?: { id?: string; text?: string };
        team?: { id?: string };
      }>;
    }>;
  }>;
};

/**
 * Pull every Middlesbrough match ESPN currently has across the configured
 * competitions for a ±1 day window. Returned matches may be scheduled,
 * in-play or finished.
 */
export async function fetchEspnBoroLive(): Promise<EspnBoroMatch[]> {
  const debug = (globalThis as { __espnDebug?: { ok: number; bad: number; total: number } }).__espnDebug = { ok: 0, bad: 0, total: 0 };
  const today = new Date();
  const ym = (d: Date) =>
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  // Month-level snapshots cover live matches today AND freshly drawn cup
  // ties weeks/months out (Carabao Cup R1 in August, FA Cup R3 in January).
  // Cloudflare Workers cap each request at 50 subrequests, so keep the
  // total here well under that ceiling (5 comps × ~9 months ≈ 45 fetches).
  const months: string[] = [];
  for (let i = -1; i <= 8; i += 1) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + i, 1));
    months.push(ym(d));
  }

  const urls: Array<{ url: string; competition: string }> = [];
  for (const c of ESPN_COMPETITIONS) {
    for (const m of months) {
      urls.push({
        url: `https://site.api.espn.com/apis/site/v2/sports/soccer/${c.slug}/scoreboard?dates=${m}&limit=200`,
        competition: c.name,
      });
    }
  }

  const responses = await Promise.all(
    urls.map(({ url, competition }) =>
      fetch(url, { headers: { accept: "application/json" } })
        .then((r) => {
          debug.total += 1;
          if (r.ok) { debug.ok += 1; return r.json(); }
          debug.bad += 1;
          return { events: [] };
        })
        .catch(() => { debug.bad += 1; return { events: [] }; })
        .then((json) => ({ json: json as EspnJson, competition })),
    ),
  );

  const byKey = new Map<string, EspnBoroMatch>();
  for (const { json, competition } of responses) {
    for (const e of json.events ?? []) {
      const comp = e.competitions?.[0];
      if (!comp || !e.date) continue;
      const home = comp.competitors?.find((c) => c.homeAway === "home");
      const away = comp.competitors?.find((c) => c.homeAway === "away");
      const homeName = home?.team?.displayName ?? "";
      const awayName = away?.team?.displayName ?? "";
      if (!homeName || !awayName) continue;
      if (!isBoro(homeName) && !isBoro(awayName)) continue;
      const state = comp.status?.type?.state ?? "pre";
      const typeName = comp.status?.type?.name ?? "";
      const status =
        state === "post"
          ? "FINISHED"
          : state === "in"
            ? typeName === "STATUS_HALFTIME"
              ? "PAUSED"
              : "IN_PLAY"
            : "SCHEDULED";
      const parsed = parseMinute(comp.status?.displayClock, comp.status?.clock, state);
      const homeTeamId = home?.team?.id ?? home?.id ?? "";
      const awayTeamId = away?.team?.id ?? away?.id ?? "";
      let homeReds = 0;
      let awayReds = 0;
      for (const d of comp.details ?? []) {
        const txt = d.type?.text ?? "";
        if (!/red/i.test(txt)) continue;
        const tid = d.team?.id ?? "";
        if (tid && tid === homeTeamId) homeReds += 1;
        else if (tid && tid === awayTeamId) awayReds += 1;
      }
      const m: EspnBoroMatch = {
        competition,
        home: homeName,
        away: awayName,
        kickoffMs: new Date(e.date).getTime(),
        venue: comp.venue?.fullName ?? null,
        status,
        minute: parsed.minute,
        minuteAdded: parsed.minuteAdded,
        homeScore: home?.score != null && home.score !== "" ? Number(home.score) : null,
        awayScore: away?.score != null && away.score !== "" ? Number(away.score) : null,
        homeReds,
        awayReds,
      };
      const key = `${competition}|${e.date}|${norm(homeName)}|${norm(awayName)}`;
      byKey.set(key, m);
    }
  }
  return [...byKey.values()];
}

/**
 * Find an existing boro_fixtures row that corresponds to an ESPN event.
 * We match on opponent + a wide date window so re-scheduled cup ties still
 * line up with whatever the admin/scraper already inserted.
 */
export function findBoroFixture(
  fixtures: BoroFixtureRow[],
  ev: EspnBoroMatch,
): BoroFixtureRow | undefined {
  const candidates = fixtures.filter((f) => {
    if (!nameMatches(f.home_team, ev.home) || !nameMatches(f.away_team, ev.away)) return false;
    const diff = Math.abs(new Date(f.kickoff_at).getTime() - ev.kickoffMs);
    return diff <= 3 * 24 * 60 * 60 * 1000;
  });
  return candidates.sort(
    (a, b) =>
      Math.abs(new Date(a.kickoff_at).getTime() - ev.kickoffMs) -
      Math.abs(new Date(b.kickoff_at).getTime() - ev.kickoffMs),
  )[0];
}