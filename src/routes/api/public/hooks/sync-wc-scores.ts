import { createFileRoute } from "@tanstack/react-router";
import { fetchEspnWcLive, findWcLiveFixture, type WcLiveFixtureRow } from "@/lib/wc-live-scores.server";

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
  const espnLive = await fetchEspnWcLive();

  const espnApplied: string[] = [];
  for (const ev of espnLive) {
    const fx = findWcLiveFixture(fixtures as WcLiveFixtureRow[], ev.home, ev.away, ev.kickoffMs);
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
