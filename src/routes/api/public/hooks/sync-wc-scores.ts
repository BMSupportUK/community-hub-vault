import { createFileRoute } from "@tanstack/react-router";
import type { WcLiveFixtureRow } from "@/lib/wc-live-scores.server";

async function syncScores() {
  // ESPN's public scoreboard is the single source of truth — it's keyless and
  // updates in real time. football-data's free tier was unreliable (often
  // hours behind and occasionally dropped scores), so it's no longer used.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: fixtures, error: fxErr } = await supabaseAdmin
    .from("wc_fixtures")
    .select("id, stage, home_team, away_team, kickoff_at, home_score, away_score, status, minute, minute_added, home_reds, away_reds, pen_winner, home_pens, away_pens");
  if (fxErr) return { ok: false, error: fxErr.message };

  // -------------------------------------------------------------------
  // 1) Resolve placeholder team names ("3rd Group A/B/C/D/F",
  //    "Winner Match 99", etc.) on knockout fixtures once FIFA confirms
  //    the matchups. We match each ESPN fixture to a DB row by kickoff +
  //    one resolved side, and fill in the still-placeholder side.
  // -------------------------------------------------------------------
  const { fetchEspnWcAllFixtures, isWcPlaceholderName } = await import(
    "@/lib/wc-live-scores.server"
  );
  const { findWcLiveFixture } = await import("@/lib/wc-live-scores.server");
  const allEspn = await fetchEspnWcAllFixtures();
  const resolved: string[] = [];
  for (const ev of allEspn) {
    // Candidates: knockout rows within 6h of this kickoff where at least
    // one side already matches the ESPN event and the other side is a
    // placeholder. ESPN sometimes nudges kickoff by a few minutes when
    // venues are confirmed, so use a tight window.
    const candidates = (fixtures as WcLiveFixtureRow[]).filter((f) => {
      const diff = Math.abs(new Date(f.kickoff_at).getTime() - ev.kickoffMs);
      if (diff > 6 * 60 * 60 * 1000) return false;
      const homePh = isWcPlaceholderName(f.home_team);
      const awayPh = isWcPlaceholderName(f.away_team);
      if (!homePh && !awayPh) return false;
      const homeMatch = !homePh && f.home_team.toLowerCase() === ev.home.toLowerCase();
      const awayMatch = !awayPh && f.away_team.toLowerCase() === ev.away.toLowerCase();
      // Need at least one resolved side to match so we link the right row.
      // If BOTH sides on the DB row are placeholders, fall back to kickoff
      // proximity (≤30 min) — this covers later rounds like SF/Final/3rd.
      return homeMatch || awayMatch || (homePh && awayPh && diff <= 30 * 60 * 1000);
    });
    if (candidates.length !== 1) continue;
    const fx = candidates[0];
    const patch: { home_team?: string; away_team?: string } = {};
    if (isWcPlaceholderName(fx.home_team) && fx.home_team !== ev.home) patch.home_team = ev.home;
    if (isWcPlaceholderName(fx.away_team) && fx.away_team !== ev.away) patch.away_team = ev.away;
    if (!patch.home_team && !patch.away_team) continue;
    const { error: upErr } = await supabaseAdmin
      .from("wc_fixtures")
      .update(patch)
      .eq("id", fx.id);
    if (upErr) continue;
    if (patch.home_team) fx.home_team = patch.home_team;
    if (patch.away_team) fx.away_team = patch.away_team;
    resolved.push(`${fx.home_team} v ${fx.away_team}`);
  }

  let updated = 0;
  const skipped: string[] = [];
  const toScore = new Set<string>();
  const { fetchEspnWcLive } = await import("@/lib/wc-live-scores.server");
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
      fx.away_score === ev.awayScore &&
      ((fx as { home_reds?: number | null }).home_reds ?? 0) === ev.homeReds &&
      ((fx as { away_reds?: number | null }).away_reds ?? 0) === ev.awayReds &&
      ((fx as { home_pens?: number | null }).home_pens ?? null) === ev.homePens &&
      ((fx as { away_pens?: number | null }).away_pens ?? null) === ev.awayPens &&
      (((fx as { pen_winner?: string | null }).pen_winner ?? null) || null) === (ev.penWinner ?? null);
    if (unchanged) continue;
    const prevStatus = fx.status;
    const prevHs = fx.home_score;
    const prevAs = fx.away_score;
    const prevPenWinner = ((fx as { pen_winner?: string | null }).pen_winner ?? null) || null;
    const { error: upErr } = await supabaseAdmin
      .from("wc_fixtures")
      .update({
        status: ev.status,
        minute: ev.minute,
        minute_added: ev.minuteAdded,
        home_score: ev.homeScore,
        away_score: ev.awayScore,
        home_reds: ev.homeReds,
        away_reds: ev.awayReds,
        home_pens: ev.homePens,
        away_pens: ev.awayPens,
        pen_winner: ev.penWinner,
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
      (prevStatus !== "FINISHED" ||
        prevHs !== ev.homeScore ||
        prevAs !== ev.awayScore ||
        prevPenWinner !== (ev.penWinner ?? null))
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

  return { ok: true, updated, skipped, espn: espnApplied, scored, resolved, total: espnLive.length };
}

export const Route = createFileRoute("/api/public/hooks/sync-wc-scores")({
  server: {
    handlers: {
      GET: async () => Response.json(await syncScores()),
      POST: async () => Response.json(await syncScores()),
    },
  },
});
