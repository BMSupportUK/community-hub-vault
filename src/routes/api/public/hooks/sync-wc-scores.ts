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

type DbFixture = {
  id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  home_score: number | null;
  away_score: number | null;
  status: string | null;
  minute: number | null;
  minute_added: number | null;
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
  // ESPN's public scoreboard is the single source of truth — it's keyless and
  // updates in real time. football-data's free tier was unreliable (often
  // hours behind and occasionally dropped scores), so it's no longer used.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: fixtures, error: fxErr } = await supabaseAdmin
    .from("wc_fixtures")
    .select("id, home_team, away_team, kickoff_at, home_score, away_score, status, minute, minute_added");
  if (fxErr) return { ok: false, error: fxErr.message };

  let updated = 0;
  const skipped: string[] = [];
  const toScore = new Set<string>();
  const espnLive = await fetchEspnLive();

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
    const prevStatus = fx.status;
    const prevHs = fx.home_score;
    const prevAs = fx.away_score;
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
    if (
      ev.status === "FINISHED" &&
      ev.homeScore !== null &&
      ev.awayScore !== null &&
      (prevStatus !== "FINISHED" || prevHs !== ev.homeScore || prevAs !== ev.awayScore)
    ) {
      toScore.add(fx.id);
    }
  }

  // Award/refresh points for any fixture that just went FINISHED.
  const scored: string[] = [];
  for (const id of toScore) {
    const { error: scoreErr } = await supabaseAdmin.rpc(
      "wc_score_fixture" as never,
      { _fixture_id: id } as never,
    );
    if (scoreErr) {
      skipped.push(`score ${id}: ${scoreErr.message}`);
      continue;
    }
    scored.push(id);
  }

  return { ok: true, updated, skipped, espn: espnApplied, scored, total: espnLive.length };
}

export const Route = createFileRoute("/api/public/hooks/sync-wc-scores")({
  server: {
    handlers: {
      GET: async () => Response.json(await syncScores()),
      POST: async () => Response.json(await syncScores()),
    },
  },
});
