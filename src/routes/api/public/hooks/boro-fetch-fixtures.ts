import { createFileRoute } from "@tanstack/react-router";

// 2026/27 Middlesbrough first-team fixtures. Pulled from BBC Sport monthly
// pages — they are authoritative for kick-off times, kept up to date when the
// EFL move games for TV, and clearly mark home/away. Cup ties get added as
// they come up.
const SEASON_MONTHS = [
  "2026-08", "2026-09", "2026-10", "2026-11", "2026-12",
  "2027-01", "2027-02", "2027-03", "2027-04", "2027-05",
];
const BBC_BASE = "https://www.bbc.co.uk/sport/football/teams/middlesbrough/scores-fixtures";

type ParsedFixture = {
  competition?: string | null;
  home_team: string;
  away_team: string;
  kickoff_at: string; // ISO
  venue?: string | null;
};

async function scrapeMonth(monthKey: string): Promise<ParsedFixture[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY is not configured");

  const schema = {
    type: "object",
    properties: {
      fixtures: {
        type: "array",
        items: {
          type: "object",
          properties: {
            competition: { type: "string" },
            home_team: { type: "string" },
            away_team: { type: "string" },
            kickoff_at: { type: "string", description: "ISO 8601 datetime in UTC" },
          },
          required: ["home_team", "away_team", "kickoff_at"],
        },
      },
    },
    required: ["fixtures"],
  };

  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: `${BBC_BASE}/${monthKey}`,
      formats: [
        {
          type: "json",
          schema,
          prompt:
            `Extract every Middlesbrough FC senior men's first-team fixture shown on this page for ${monthKey}. ` +
            "One side of every fixture is Middlesbrough. Identify home/away from the order on the page — " +
            "the team listed first is the home team. competition is the league or cup shown above the match " +
            "(e.g. \"Championship\", \"FA Cup\", \"EFL Cup\"). kickoff_at MUST be a UTC ISO-8601 datetime " +
            `derived from the displayed kick-off time, which is UK local time (BST in Aug-Oct ${monthKey.slice(0,4)}, ` +
            "GMT in Nov-Mar, BST again from late Mar). If only a date is shown, use 15:00 UK time. " +
            "Skip Under-21, Under-18, Academy, Youth, Women's, Reserves, B-team and friendly matches.",
        },
      ],
      onlyMainContent: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Firecrawl scrape failed for ${monthKey} [${res.status}]: ${body}`);
  }
  const json = (await res.json()) as {
    data?: { json?: { fixtures?: ParsedFixture[] } };
  };
  const fixtures = json.data?.json?.fixtures ?? [];
  const boroRe = /middlesbrough/i;
  return fixtures.filter(
    (f) =>
      f.home_team &&
      f.away_team &&
      f.kickoff_at &&
      !Number.isNaN(Date.parse(f.kickoff_at)) &&
      (boroRe.test(f.home_team) || boroRe.test(f.away_team)),
  );
}

function norm(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

async function syncFixtures() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const scraped: ParsedFixture[] = [];
  const scrapeErrors: string[] = [];
  for (const month of SEASON_MONTHS) {
    try {
      const rows = await scrapeMonth(month);
      scraped.push(...rows);
    } catch (e) {
      scrapeErrors.push(e instanceof Error ? e.message : String(e));
    }
  }
  if (scraped.length === 0) {
    return { ok: false, skipped: "no-fixtures-found", scrape_errors: scrapeErrors };
  }

  // Deduplicate within this scrape (same home/away pair can appear in two
  // monthly pages if BBC pre-list the next match).
  const dedup = new Map<string, ParsedFixture>();
  for (const fx of scraped) {
    const key = `${norm(fx.home_team)}|${norm(fx.away_team)}|${new Date(fx.kickoff_at).toISOString().slice(0, 10)}`;
    if (!dedup.has(key)) dedup.set(key, fx);
  }
  const unique = [...dedup.values()];

  type ExistingRow = {
    id: string;
    competition: string;
    home_team: string;
    away_team: string;
    kickoff_at: string;
    venue: string | null;
    status: string;
  };
  const { data: existing } = await supabaseAdmin
    .from("boro_fixtures")
    .select("id, competition, home_team, away_team, kickoff_at, venue, status");
  const byTeams = new Map<string, ExistingRow>();
  for (const f of (existing ?? []) as ExistingRow[]) {
    byTeams.set(`${norm(f.home_team)}|${norm(f.away_team)}`, f);
  }

  const inserted: string[] = [];
  const updated: string[] = [];
  const errors: string[] = [];
  for (const fx of unique) {
    const teamKey = `${norm(fx.home_team)}|${norm(fx.away_team)}`;
    const newKickoff = new Date(fx.kickoff_at).toISOString();
    const existingRow = byTeams.get(teamKey);

    if (!existingRow) {
      const isHome = /middlesbrough/i.test(fx.home_team);
      const { error } = await supabaseAdmin.from("boro_fixtures").insert({
        competition: fx.competition ?? "Championship",
        home_team: fx.home_team,
        away_team: fx.away_team,
        kickoff_at: newKickoff,
        venue: isHome ? "Riverside Stadium" : null,
        status: "SCHEDULED",
      });
      if (error) errors.push(`insert ${fx.home_team} v ${fx.away_team}: ${error.message}`);
      else inserted.push(`${fx.home_team} v ${fx.away_team} @ ${newKickoff}`);
      continue;
    }

    // Update kickoff/competition if BBC have moved the match. Never touch
    // scores or status — those are owned by the live-score sync / admin.
    const changes: {
      kickoff_at?: string;
      competition?: string;
    } = {};
    if (new Date(existingRow.kickoff_at).toISOString() !== newKickoff) {
      changes.kickoff_at = newKickoff;
    }
    if (fx.competition && fx.competition !== existingRow.competition) {
      changes.competition = fx.competition;
    }
    if (Object.keys(changes).length === 0) continue;
    const { error } = await supabaseAdmin
      .from("boro_fixtures")
      .update(changes)
      .eq("id", existingRow.id);
    if (error) errors.push(`update ${fx.home_team} v ${fx.away_team}: ${error.message}`);
    else updated.push(`${fx.home_team} v ${fx.away_team}: ${Object.keys(changes).join(",")}`);
  }

  return {
    ok: true,
    scraped: unique.length,
    inserted: inserted.length,
    updated: updated.length,
    errors,
    scrape_errors: scrapeErrors,
    inserted_list: inserted,
    updated_list: updated,
  };
}

export const Route = createFileRoute("/api/public/hooks/boro-fetch-fixtures")({
  server: {
    handlers: {
      GET: async () => Response.json(await syncFixtures()),
      POST: async () => Response.json(await syncFixtures()),
    },
  },
});