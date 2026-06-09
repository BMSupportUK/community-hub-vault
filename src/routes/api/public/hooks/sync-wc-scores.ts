import { createFileRoute } from "@tanstack/react-router";

// Aliases for matching football-data.org team names to our wc_fixtures.home_team / away_team values.
const ALIASES: Record<string, string[]> = {
  "United States": ["USA", "United States of America"],
  "South Korea": ["Korea Republic", "Republic of Korea"],
  "Iran": ["IR Iran", "Islamic Republic of Iran"],
  "Ivory Coast": ["Côte d'Ivoire", "Cote d'Ivoire"],
  "Türkiye": ["Turkey", "Turkiye"],
  "DR Congo": ["Democratic Republic of the Congo", "DR Congo"],
  "Republic of Ireland": ["Ireland"],
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
  homeTeam: { name: string };
  awayTeam: { name: string };
  score: { fullTime: { home: number | null; away: number | null } };
};

async function syncScores() {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "FOOTBALL_DATA_API_KEY not configured" };
  }

  const res = await fetch(
    "https://api.football-data.org/v4/competitions/WC/matches?status=FINISHED",
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
    .select("id, home_team, away_team, kickoff_at, home_score, away_score");
  if (fxErr) return { ok: false, error: fxErr.message };

  let updated = 0;
  const skipped: string[] = [];

  for (const m of json.matches) {
    const hs = m.score?.fullTime?.home;
    const as = m.score?.fullTime?.away;
    if (hs === null || as === null || hs === undefined || as === undefined) continue;

    const kickoffMs = new Date(m.utcDate).getTime();
    const match = fixtures!.find((f) => {
      const sameTeams =
        nameMatches(f.home_team, m.homeTeam.name) &&
        nameMatches(f.away_team, m.awayTeam.name);
      if (!sameTeams) return false;
      const diff = Math.abs(new Date(f.kickoff_at).getTime() - kickoffMs);
      return diff <= 36 * 60 * 60 * 1000; // within 36h
    });

    if (!match) {
      skipped.push(`${m.homeTeam.name} v ${m.awayTeam.name}`);
      continue;
    }
    if (match.home_score === hs && match.away_score === as) continue;

    const { error: upErr } = await supabaseAdmin
      .from("wc_fixtures")
      .update({ home_score: hs, away_score: as })
      .eq("id", match.id);
    if (upErr) {
      skipped.push(`${m.homeTeam.name} v ${m.awayTeam.name}: ${upErr.message}`);
      continue;
    }
    updated += 1;
  }

  return { ok: true, updated, skipped, totalFinished: json.matches.length };
}

export const Route = createFileRoute("/api/public/hooks/sync-wc-scores")({
  server: {
    handlers: {
      GET: async () => Response.json(await syncScores()),
      POST: async () => Response.json(await syncScores()),
    },
  },
});
