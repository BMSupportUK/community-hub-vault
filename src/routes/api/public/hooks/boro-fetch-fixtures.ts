import { createFileRoute } from "@tanstack/react-router";

// MFC have said the 26/27 fixtures land Thursday 25 June 2026 at 12:00 UK time
// (11:00 UTC during BST). We schedule this hook to run hourly from now, but
// don't waste Firecrawl credits before the release window opens.
const RELEASE_AT_MS = Date.UTC(2026, 5, 25, 11, 0, 0); // 25 Jun 2026 11:00 UTC = 12:00 BST
const FIXTURES_URL = "https://www.mfc.co.uk/matches";

type ParsedFixture = {
  competition?: string | null;
  home_team: string;
  away_team: string;
  kickoff_at: string; // ISO
  venue?: string | null;
};

async function scrapeFixtures(): Promise<ParsedFixture[]> {
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
            venue: { type: "string" },
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
      url: FIXTURES_URL,
      formats: [
        {
          type: "json",
          schema,
          prompt:
            "Extract every Middlesbrough FC 2026/27 senior men's first-team fixture listed. " +
            "kickoff_at must be ISO 8601 in UTC. If only a date is shown, use 15:00 UK time. " +
            "home_team/away_team must be the full club names (one of which is Middlesbrough).",
        },
      ],
      onlyMainContent: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Firecrawl scrape failed [${res.status}]: ${body}`);
  }
  const json = (await res.json()) as {
    data?: { json?: { fixtures?: ParsedFixture[] } };
  };
  const fixtures = json.data?.json?.fixtures ?? [];
  return fixtures.filter(
    (f) => f.home_team && f.away_team && f.kickoff_at && !Number.isNaN(Date.parse(f.kickoff_at)),
  );
}

function norm(s: string) {
  return s.trim().toLowerCase();
}

async function syncFixtures() {
  const now = Date.now();
  if (now < RELEASE_AT_MS) {
    return {
      ok: true,
      skipped: "before-release",
      release_at: new Date(RELEASE_AT_MS).toISOString(),
    };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // If admin has already loaded a full season manually, don't keep re-scraping.
  const { count } = await supabaseAdmin
    .from("boro_fixtures")
    .select("id", { count: "exact", head: true });
  if ((count ?? 0) >= 30) {
    return { ok: true, skipped: "already-populated", count };
  }

  let scraped: ParsedFixture[];
  try {
    scraped = await scrapeFixtures();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (scraped.length === 0) {
    return { ok: true, skipped: "no-fixtures-found" };
  }

  const { data: existing } = await supabaseAdmin
    .from("boro_fixtures")
    .select("id, home_team, away_team, kickoff_at");
  const existingKeys = new Set(
    (existing ?? []).map(
      (f) =>
        `${norm(f.home_team)}|${norm(f.away_team)}|${new Date(f.kickoff_at).toISOString().slice(0, 10)}`,
    ),
  );

  const inserted: string[] = [];
  const errors: string[] = [];
  for (const fx of scraped) {
    const key = `${norm(fx.home_team)}|${norm(fx.away_team)}|${new Date(fx.kickoff_at).toISOString().slice(0, 10)}`;
    if (existingKeys.has(key)) continue;
    const { error } = await supabaseAdmin.from("boro_fixtures").insert({
      competition: fx.competition ?? "Championship",
      home_team: fx.home_team,
      away_team: fx.away_team,
      kickoff_at: new Date(fx.kickoff_at).toISOString(),
      venue: fx.venue ?? null,
      status: "SCHEDULED",
    });
    if (error) {
      errors.push(`${fx.home_team} v ${fx.away_team}: ${error.message}`);
    } else {
      inserted.push(`${fx.home_team} v ${fx.away_team} @ ${fx.kickoff_at}`);
    }
  }

  return { ok: true, scraped: scraped.length, inserted: inserted.length, errors, inserted_list: inserted };
}

export const Route = createFileRoute("/api/public/hooks/boro-fetch-fixtures")({
  server: {
    handlers: {
      GET: async () => Response.json(await syncFixtures()),
      POST: async () => Response.json(await syncFixtures()),
    },
  },
});