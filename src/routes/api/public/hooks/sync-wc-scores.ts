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
    .select("id, home_team, away_team, kickoff_at, home_score, away_score, status, minute");
  if (fxErr) return { ok: false, error: fxErr.message };

  let updated = 0;
  const skipped: string[] = [];

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

    const nextMinute = isLive ? (typeof m.minute === "number" ? m.minute : null) : null;
    const update: {
      status: string;
      minute: number | null;
      home_score?: number | null;
      away_score?: number | null;
    } = { status, minute: nextMinute };
    if (isLive || isFinished) {
      update.home_score = hs;
      update.away_score = as;
    }

    const unchanged =
      (match as { status?: string }).status === status &&
      (match as { minute?: number | null }).minute === nextMinute &&
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

  return { ok: true, updated, skipped, total: json.matches.length };
}

export const Route = createFileRoute("/api/public/hooks/sync-wc-scores")({
  server: {
    handlers: {
      GET: async () => Response.json(await syncScores()),
      POST: async () => Response.json(await syncScores()),
    },
  },
});
