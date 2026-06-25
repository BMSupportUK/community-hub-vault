import { createFileRoute } from "@tanstack/react-router";
import type { BoroFixtureRow } from "@/lib/boro-live-scores.server";

async function syncBoroScores() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { fetchEspnBoroLive, findBoroFixture } = await import("@/lib/boro-live-scores.server");

  const { data: fixtures, error: fxErr } = await supabaseAdmin
    .from("boro_fixtures")
    .select(
      "id, competition, home_team, away_team, kickoff_at, venue, home_score, away_score, status, minute, minute_added",
    );
  if (fxErr) return { ok: false, error: fxErr.message };

  const rows = (fixtures ?? []) as BoroFixtureRow[];
  const live = await fetchEspnBoroLive();

  let updated = 0;
  let inserted = 0;
  const updatedList: string[] = [];
  const insertedList: string[] = [];
  const skipped: string[] = [];
  const toScore = new Set<string>();

  for (const ev of live) {
    const fx = findBoroFixture(rows, ev);
    if (!fx) {
      // ESPN knows about a fixture we don't yet — most often a freshly drawn
      // cup tie. Insert it so it shows up on the predictions page.
      const { data: insRows, error: insErr } = await supabaseAdmin
        .from("boro_fixtures")
        .insert({
          competition: ev.competition,
          home_team: ev.home,
          away_team: ev.away,
          kickoff_at: new Date(ev.kickoffMs).toISOString(),
          venue: ev.venue,
          status: ev.status,
          minute: ev.minute,
          minute_added: ev.minuteAdded,
          home_score: ev.homeScore,
          away_score: ev.awayScore,
        })
        .select("id")
        .single();
      if (insErr) {
        skipped.push(`insert ${ev.competition}: ${ev.home} v ${ev.away}: ${insErr.message}`);
        continue;
      }
      inserted += 1;
      insertedList.push(`${ev.competition}: ${ev.home} v ${ev.away}`);
      if (ev.status === "FINISHED" && ev.homeScore !== null && ev.awayScore !== null) {
        if (insRows?.id) toScore.add(insRows.id);
      }
      continue;
    }

    // Existing fixture — patch the volatile bits if they changed. Never
    // downgrade a row that was already FINISHED back to IN_PLAY from a stale
    // snapshot.
    if (fx.status === "FINISHED" && ev.status !== "FINISHED") continue;

    const newCompetition = fx.competition || ev.competition;
    const patch: Record<string, unknown> = {};
    if (ev.status && ev.status !== fx.status) patch.status = ev.status;
    if (ev.minute !== fx.minute) patch.minute = ev.minute;
    if (ev.minuteAdded !== fx.minute_added) patch.minute_added = ev.minuteAdded;
    if (ev.homeScore !== null && ev.homeScore !== fx.home_score) patch.home_score = ev.homeScore;
    if (ev.awayScore !== null && ev.awayScore !== fx.away_score) patch.away_score = ev.awayScore;
    if (ev.venue && !fx.venue) patch.venue = ev.venue;
    if (newCompetition !== fx.competition && ev.competition !== "Championship") {
      // Only overwrite competition if ESPN says it's a cup — we don't want a
      // generic "Championship" label to clobber a more specific BBC value.
      patch.competition = ev.competition;
    }
    if (Object.keys(patch).length === 0) continue;

    const prevStatus = fx.status;
    const prevHs = fx.home_score;
    const prevAs = fx.away_score;

    const { error: upErr } = await supabaseAdmin
      .from("boro_fixtures")
      .update(patch)
      .eq("id", fx.id);
    if (upErr) {
      skipped.push(`update ${ev.home} v ${ev.away}: ${upErr.message}`);
      continue;
    }
    updated += 1;
    updatedList.push(
      `${ev.home} ${ev.homeScore ?? "-"}-${ev.awayScore ?? "-"} ${ev.away} (${ev.status}${ev.minute != null ? ` ${ev.minute}${ev.minuteAdded ? `+${ev.minuteAdded}` : ""}'` : ""})`,
    );
    if (
      ev.status === "FINISHED" &&
      ev.homeScore !== null &&
      ev.awayScore !== null &&
      (prevStatus !== "FINISHED" || prevHs !== ev.homeScore || prevAs !== ev.awayScore)
    ) {
      toScore.add(fx.id);
    }
  }

  // Re-score any fixture that just went FINISHED so the leaderboard updates.
  const scored: string[] = [];
  for (const id of toScore) {
    const { error: scoreErr } = await supabaseAdmin.rpc(
      "boro_score_fixture" as never,
      { _fixture_id: id } as never,
    );
    if (scoreErr) {
      skipped.push(`score ${id}: ${scoreErr.message}`);
      continue;
    }
    scored.push(id);
  }

  return {
    ok: true,
    total: live.length,
    updated,
    inserted,
    scored,
    updated_list: updatedList,
    inserted_list: insertedList,
    skipped,
  };
}

export const Route = createFileRoute("/api/public/hooks/sync-boro-scores")({
  server: {
    handlers: {
      GET: async () => Response.json(await syncBoroScores()),
      POST: async () => Response.json(await syncBoroScores()),
    },
  },
});