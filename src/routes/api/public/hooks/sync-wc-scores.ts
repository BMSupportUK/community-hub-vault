import { createFileRoute } from "@tanstack/react-router";

// Aliases for matching football-data.org team names to our wc_fixtures.home_team / away_team values.
const ALIASES: Record<string, string[]> = {
  "United States": ["USA", "United States of America"],
  "South Korea": ["Korea Republic", "Republic of Korea"],
  "Iran": ["IR Iran", "Islamic Republic of Iran"],
  "Ivory Coast": ["Côte d'Ivoire", "Cote d'Ivoire"],
  "Türkiye": ["Turkey", "Turkiye"],
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

type FdMatch = {
  id: number;
  utcDate: string;
  status: string;
  minute?: number | null;
  homeTeam: { name: string };
  awayTeam: { name: string };
  score?: {
    fullTime?: { home: number | null; away: number | null };
    halfTime?: { home: number | null; away: number | null };
  };
};

type DbFixture = {
  id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  home_score: number | null;
  away_score: number | null;
  status: string | null;
  minute: number | null;
};

function findFixture(
  fixtures: DbFixture[],
  homeName: string,
  awayName: string,
  kickoffMs: number,
): DbFixture | undefined {
  // Pick the closest fixture (by kickoff time) with the same teams, within 5 days —
  // manually-entered fixture times can be days off from the official schedule.
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

type EspnLiveMatch = {
  home: string;
  away: string;
  kickoffMs: number;
  status: string;
  minute: number | null;
  minuteAdded: number | null;
  homeScore: number | null;
  awayScore: number | null;
};

// football-data.org's free tier can lag far behind kickoff (it has been seen
// reporting TIMED 20+ minutes into a live match). ESPN's public scoreboard is
// real-time and keyless, so we overlay its live/finished data on top.
async function fetchEspnLive(): Promise<EspnLiveMatch[]> {
  try {
    const res = await fetch(
      "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard",
    );
    if (!res.ok) return [];
    const json = (await res.json()) as {
      events?: Array<{
        date?: string;
        competitions?: Array<{
          status?: {
            displayClock?: string;
            type?: { state?: string; name?: string };
          };
          competitors?: Array<{
            homeAway?: string;
            score?: string;
            team?: { displayName?: string };
          }>;
        }>;
      }>;
    };
    const out: EspnLiveMatch[] = [];
    for (const e of json.events ?? []) {
      const comp = e.competitions?.[0];
      if (!comp || !e.date) continue;
      const state = comp.status?.type?.state; // "pre" | "in" | "post"
      if (state !== "in" && state !== "post") continue;
      const homeC = comp.competitors?.find((c) => c.homeAway === "home");
      const awayC = comp.competitors?.find((c) => c.homeAway === "away");
      if (!homeC?.team?.displayName || !awayC?.team?.displayName) continue;
      const typeName = comp.status?.type?.name ?? "";
      const status =
        state === "post"
          ? "FINISHED"
          : typeName === "STATUS_HALFTIME"
            ? "PAUSED"
            : "IN_PLAY";
      // ESPN's displayClock during stoppage time looks like "45'+2" or
      // "90'+3" — split on '+' so we keep the base minute and the added
      // injury minutes separately (rendered as "45+2'").
      const dc = comp.status?.displayClock ?? "";
      const [baseStr, addedStr] = dc.split("+");
      const base = parseInt(baseStr ?? "", 10);
      const addedParsed = parseInt(addedStr ?? "", 10);
      const added = Number.isFinite(addedParsed) ? addedParsed : null;
      out.push({
        home: homeC.team.displayName,
        away: awayC.team.displayName,
        kickoffMs: new Date(e.date).getTime(),
        status,
        minute: state === "in" && Number.isFinite(base) ? base : null,
        minuteAdded: state === "in" ? added : null,
        homeScore: homeC.score != null && homeC.score !== "" ? Number(homeC.score) : null,
        awayScore: awayC.score != null && awayC.score !== "" ? Number(awayC.score) : null,
      });
    }
    return out;
  } catch {
    return [];
  }
}

async function syncScores() {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "FOOTBALL_DATA_API_KEY not configured" };
  }

  const res = await fetch(
    "https://api.football-data.org/v4/competitions/WC/matches",
    { headers: { "X-Auth-Token": apiKey } },
  );
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: `football-data: ${res.status} ${body.slice(0, 200)}` };
  }
  const json = (await res.json()) as { matches: FdMatch[] };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: fixtures, error: fxErr } = await supabaseAdmin
    .from("wc_fixtures")
    .select("id, home_team, away_team, kickoff_at, home_score, away_score, status, minute, minute_added");
  if (fxErr) return { ok: false, error: fxErr.message };

  let updated = 0;
  const skipped: string[] = [];
  // Fixture ids that ESPN reports as live/finished — the football-data pass must
  // not downgrade these (its feed can still say TIMED while the match is live).
  const espnLive = await fetchEspnLive();
  const espnOwnedIds = new Set<string>();
  for (const ev of espnLive) {
    const fx = findFixture(fixtures as DbFixture[], ev.home, ev.away, ev.kickoffMs);
    if (fx) espnOwnedIds.add(fx.id);
  }

  for (const m of json.matches) {
    const status = m.status;
    const isLive = status === "IN_PLAY" || status === "PAUSED" || status === "LIVE";
    const isFinished = status === "FINISHED";
    const ft = m.score?.fullTime;
    const ht = (m as { score?: { halfTime?: { home: number | null; away: number | null } } })
      .score?.halfTime;
    const hs = ft?.home ?? ht?.home ?? null;
    const as = ft?.away ?? ht?.away ?? null;

    const kickoffMs = new Date(m.utcDate).getTime();
    const match = findFixture(fixtures as DbFixture[], m.homeTeam.name, m.awayTeam.name, kickoffMs);

    if (!match) {
      skipped.push(`${m.homeTeam.name} v ${m.awayTeam.name}`);
      continue;
    }

    // ESPN has fresher live data for this fixture — only let football-data fix
    // the kickoff time, never the status/score/minute.
    if (espnOwnedIds.has(match.id) && !isLive && !isFinished) {
      const koDiff = Math.abs(new Date(match.kickoff_at).getTime() - kickoffMs);
      if (koDiff > 60 * 1000) {
        const { error: koErr } = await supabaseAdmin
          .from("wc_fixtures")
          .update({ kickoff_at: new Date(kickoffMs).toISOString() })
          .eq("id", match.id);
        if (!koErr) updated += 1;
      }
      continue;
    }

    const nextMinute = isLive ? (typeof m.minute === "number" ? m.minute : null) : null;
    const update: {
      status: string;
      minute: number | null;
      minute_added: number | null;
      kickoff_at?: string;
      home_score?: number | null;
      away_score?: number | null;
    } = { status, minute: nextMinute, minute_added: null };
    if (isLive || isFinished) {
      update.home_score = hs;
      update.away_score = as;
    } else {
      // Status reverted to pre-match (SCHEDULED/TIMED/POSTPONED/etc.) — clear
      // any stale score left from a prior live tick so the UI doesn't render
      // "Final 0-0" before the match has actually kicked off.
      update.home_score = null;
      update.away_score = null;
    }

    // Keep kickoff_at aligned with the official feed (fixtures were entered manually
    // and can be hours off, which breaks the "in play" / elapsed-minutes display).
    const kickoffDiff = Math.abs(new Date(match.kickoff_at).getTime() - kickoffMs);
    if (kickoffDiff > 60 * 1000) {
      update.kickoff_at = new Date(kickoffMs).toISOString();
    }

    const unchanged =
      (match as { status?: string }).status === status &&
      (match as { minute?: number | null }).minute === nextMinute &&
      ((match as { minute_added?: number | null }).minute_added ?? null) === null &&
      update.kickoff_at === undefined &&
      (update.home_score === undefined || match.home_score === update.home_score) &&
      (update.away_score === undefined || match.away_score === update.away_score);
    if (unchanged) continue;

    const { error: upErr } = await supabaseAdmin
      .from("wc_fixtures")
      .update(update)
      .eq("id", match.id);
    if (upErr) {
      skipped.push(`${m.homeTeam.name} v ${m.awayTeam.name}: ${upErr.message}`);
      continue;
    }
    updated += 1;
  }

  // Overlay ESPN live/finished data — it updates in real time while
  // football-data's free tier can lag by an entire half.
  const espnApplied: string[] = [];
  for (const ev of espnLive) {
    const fx = findFixture(fixtures as DbFixture[], ev.home, ev.away, ev.kickoffMs);
    if (!fx) {
      skipped.push(`espn: ${ev.home} v ${ev.away}`);
      continue;
    }
    const unchanged =
      fx.status === ev.status &&
      fx.minute === ev.minute &&
      ((fx as { minute_added?: number | null }).minute_added ?? null) === ev.minuteAdded &&
      fx.home_score === ev.homeScore &&
      fx.away_score === ev.awayScore;
    if (unchanged) continue;
    const { error: upErr } = await supabaseAdmin
      .from("wc_fixtures")
      .update({
        status: ev.status,
        minute: ev.minute,
        minute_added: ev.minuteAdded,
        home_score: ev.homeScore,
        away_score: ev.awayScore,
      })
      .eq("id", fx.id);
    if (upErr) {
      skipped.push(`espn: ${ev.home} v ${ev.away}: ${upErr.message}`);
      continue;
    }
    updated += 1;
    espnApplied.push(`${ev.home} ${ev.homeScore}-${ev.awayScore} ${ev.away} (${ev.status}${ev.minute != null ? ` ${ev.minute}${ev.minuteAdded ? `+${ev.minuteAdded}` : ""}'` : ""})`);
  }

  return { ok: true, updated, skipped, espn: espnApplied, total: json.matches.length };
}

export const Route = createFileRoute("/api/public/hooks/sync-wc-scores")({
  server: {
    handlers: {
      GET: async () => Response.json(await syncScores()),
      POST: async () => Response.json(await syncScores()),
    },
  },
});
