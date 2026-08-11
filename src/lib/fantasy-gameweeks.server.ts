/**
 * Keeps fantasy gameweeks in step with the Boro league fixture list.
 *
 * Called automatically after every fixture import (mfc.co.uk feed) so that
 * newly added, rescheduled or removed league games are reflected in the
 * fantasy game without any admin involvement.
 */
import { FANTASY_LOCK_MINUTES, isFantasyLeagueCompetition } from "@/lib/fantasy-rules";

type Admin = {
  from: (table: string) => any;
};

type FixtureRow = {
  id: string;
  kickoff_at: string;
  competition: string | null;
  status: string | null;
  date_tbc?: boolean | null;
};
type GwRow = { id: string; fixture_id: string | null; gw_number: number | null; lock_at: string | null; status: string | null };

function lockFor(kickoffIso: string): string {
  return new Date(new Date(kickoffIso).getTime() - FANTASY_LOCK_MINUTES * 60_000).toISOString();
}

/** Fixtures that have been called off — they keep their gameweek but drop to the
 *  end of the running order until a new date is announced. */
export function isPostponedFixture(status: string | null | undefined): boolean {
  return /postpon|cancel|abandon|suspend|tbc|tbd/i.test(status ?? "");
}

export async function syncFantasyGameweeksFromFixtures(admin: Admin) {
  const [{ data: allFixtures, error: fxErr }, { data: existing, error: gwErr }] = await Promise.all([
    admin
      .from("boro_fixtures")
      .select("id, kickoff_at, competition, status, date_tbc")
      .order("kickoff_at", { ascending: true }),
    admin.from("fantasy_gameweeks").select("id, fixture_id, gw_number, lock_at, status"),
  ]);
  if (fxErr) throw new Error(fxErr.message);
  if (gwErr) throw new Error(gwErr.message);

  // Competitive fixtures only — league, cups and play-offs; no friendlies.
  // Running order: playable fixtures in kickoff order first, then anything that
  // has been postponed/called off (no confirmed date), so gameweek numbers always
  // read chronologically for the games that are actually on.
  const fixtures = ((allFixtures ?? []) as FixtureRow[])
    .filter((f) => isFantasyLeagueCompetition(f.competition))
    .sort((a, b) => {
      // Cup ties and play-off games slot into the running order at whatever
      // date they've been given, even if the kick-off time is still to be
      // confirmed. Only fixtures called off with no date at all drop to the end.
      const pa = isPostponedFixture(a.status) ? 1 : 0;
      const pb = isPostponedFixture(b.status) ? 1 : 0;
      if (pa !== pb) return pa - pb;
      return new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime();
    });
  const leagueIds = new Set(fixtures.map((f) => f.id));
  const gws = (existing ?? []) as GwRow[];

  // Remove gameweeks whose fixture is gone or is no longer a league game.
  const stale = gws.filter((g) => !g.fixture_id || !leagueIds.has(g.fixture_id));
  let removed = 0;
  if (stale.length) {
    const { error } = await admin.from("fantasy_gameweeks").delete().in("id", stale.map((g) => g.id));
    if (!error) removed = stale.length;
  }

  const byFixture = new Map<string, GwRow>();
  for (const g of gws) if (g.fixture_id) byFixture.set(g.fixture_id, g);

  const inserts: Array<{ gw_number: number; fixture_id: string; lock_at: string }> = [];
  let added = 0;
  let updated = 0;
  let renumbered = 0;

  // gw_number is UNIQUE, so shuffling numbers has to happen in two passes:
  // park every row that moves on a temporary negative number first.
  const renumbers: Array<{ id: string; to: number }> = [];

  for (let i = 0; i < fixtures.length; i++) {
    const f = fixtures[i]!;
    const gwNumber = i + 1; // chronological, so reschedules renumber cleanly
    const lockAt = lockFor(f.kickoff_at);
    const row = byFixture.get(f.id);
    if (!row) {
      inserts.push({ gw_number: gwNumber, fixture_id: f.id, lock_at: lockAt });
      continue;
    }
    if (row.gw_number !== gwNumber) renumbers.push({ id: row.id, to: gwNumber });
    // Only move the deadline for gameweeks that haven't locked/been scored.
    if ((row.status ?? "upcoming") === "upcoming" && row.lock_at !== lockAt) {
      const { error } = await admin.from("fantasy_gameweeks").update({ lock_at: lockAt }).eq("id", row.id);
      if (!error) updated++;
    }
  }

  if (renumbers.length) {
    for (const r of renumbers) {
      await admin.from("fantasy_gameweeks").update({ gw_number: -r.to }).eq("id", r.id);
    }
    for (const r of renumbers) {
      const { error } = await admin.from("fantasy_gameweeks").update({ gw_number: r.to }).eq("id", r.id);
      if (!error) renumbered++;
    }
  }

  if (inserts.length) {
    const { error } = await admin.from("fantasy_gameweeks").insert(inserts);
    if (error) throw new Error(error.message);
    added = inserts.length;
  }

  return { ok: true, league_fixtures: fixtures.length, added, updated, renumbered, removed };
}
