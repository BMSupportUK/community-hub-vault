import { createFileRoute } from "@tanstack/react-router";

// 2026/27 Middlesbrough first-team fixtures. Pulled from BBC Sport monthly
// pages — they are authoritative for kick-off times, kept up to date when the
// EFL move games for TV, and clearly mark home/away. We parse the rendered
// HTML directly rather than going through an LLM extractor (which was
// hallucinating fixtures that don't exist).
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

const MONTH_NAMES: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

// Convert "YYYY-MM-DD HH:MM" in Europe/London to a real UTC ISO string.
function ukLocalToUtcIso(year: number, month: number, day: number, hour: number, minute: number): string {
  // British Summer Time runs from the last Sunday of March 01:00 UTC to the
  // last Sunday of October 01:00 UTC. Inside that window UK clocks are UTC+1.
  const lastSunday = (y: number, m: number) => {
    const d = new Date(Date.UTC(y, m, 0)); // last day of month m (1-indexed)
    return d.getUTCDate() - d.getUTCDay();
  };
  const bstStart = Date.UTC(year, 2, lastSunday(year, 3), 1, 0); // March
  const bstEnd = Date.UTC(year, 9, lastSunday(year, 10), 1, 0); // October
  const localGuessUtc = Date.UTC(year, month - 1, day, hour, minute);
  const isBst = localGuessUtc >= bstStart && localGuessUtc < bstEnd;
  const utcMs = localGuessUtc - (isBst ? 60 * 60 * 1000 : 0);
  return new Date(utcMs).toISOString();
}

function stripTags(s: string) {
  return s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").trim();
}

async function scrapeMonth(monthKey: string): Promise<ParsedFixture[]> {
  const [yearStr, monthStr] = monthKey.split("-");
  const year = Number(yearStr);

  const res = await fetch(`${BBC_BASE}/${monthKey}`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; BMSupportBot/1.0; +https://bmsupport.uk)",
      Accept: "text/html",
    },
  });
  if (!res.ok) throw new Error(`BBC fetch failed for ${monthKey}: HTTP ${res.status}`);
  const html = await res.text();

  // Each match block has, in order:
  //   <h2 ...GroupHeader...>Saturday 15th August</h2>
  //   (optionally other dates/headers in between)
  //   <h3 ...SecondaryHeading...>Championship</h3>
  //   <span ...VisuallyHidden...>Middlesbrough versus Lincoln City kick off 15:00</span>
  // We walk the document, tracking the most recent date H2 and competition H3,
  // and emit a fixture each time we see an "X versus Y kick off HH:MM" span.
  const tokenRe =
    /<h2[^>]*GroupHeader[^>]*>([^<]+)<\/h2>|<h3[^>]*SecondaryHeading[^>]*>([^<]+)<\/h3>|<span[^>]*VisuallyHidden[^>]*>([^<]*?versus[^<]*?kick off[^<]*?)<\/span>/g;

  let currentDate: { day: number; month: number; year: number } | null = null;
  let currentComp: string | null = null;
  const out: ParsedFixture[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(html)) !== null) {
    if (m[1]) {
      // e.g. "Saturday 15th August" or "Tuesday 1st September"
      const text = stripTags(m[1]);
      const dm = text.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)/);
      if (dm) {
        const day = Number(dm[1]);
        const monthName = dm[2].toLowerCase();
        const mo = MONTH_NAMES[monthName];
        if (mo) {
          // The page is for monthKey, but BBC sometimes leaks the first
          // fixture of the next month onto this page. If the displayed month
          // name is earlier in the calendar than monthKey's month, it must be
          // next calendar year (Dec -> Jan rollover, etc.).
          let y = year;
          const pageMonth = Number(monthStr);
          if (mo < pageMonth - 6) y = year + 1;
          else if (mo > pageMonth + 6) y = year - 1;
          currentDate = { day, month: mo, year: y };
        }
      }
    } else if (m[2]) {
      currentComp = stripTags(m[2]);
    } else if (m[3] && currentDate) {
      const text = stripTags(m[3]);
      const fm = text.match(/^(.*?)\s+versus\s+(.*?)\s+kick off\s+(\d{1,2}):(\d{2})/i);
      if (!fm) continue;
      const home = fm[1].trim();
      const away = fm[2].trim();
      const hh = Number(fm[3]);
      const mm = Number(fm[4]);
      if (!/middlesbrough/i.test(home) && !/middlesbrough/i.test(away)) continue;
      const kickoff = ukLocalToUtcIso(currentDate.year, currentDate.month, currentDate.day, hh, mm);
      const key = `${home.toLowerCase()}|${away.toLowerCase()}|${kickoff.slice(0, 10)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        competition: currentComp,
        home_team: home,
        away_team: away,
        kickoff_at: kickoff,
      });
    }
  }
  return out;
}

function norm(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

// The predictor is LEAGUE fixtures only. Cups (League Cup / Carabao, FA Cup,
// EFL Trophy, play-offs), friendlies, testimonials and anything else
// non-league must never be imported.
function isCompetitiveCompetition(comp?: string | null): boolean {
  const c = norm(comp ?? "");
  if (!c) return false;
  // Explicit non-league / non-competitive exclusions
  if (
    /friendl|testimonial|trophy tour|training|behind closed doors|cup|carabao|efl trophy|papa|checkatrade|vertu|bristol street|play-?off|shield|europa|conference|champions league|u2\d|under[- ]?2\d|academy|youth|reserves|women/.test(
      c,
    )
  ) {
    return false;
  }
  // Allowlist: only recognised league competitions
  return /championship|premier league|league one|league two|efl league|sky bet/.test(c);
}

// Championship 2026/27 home grounds — used to auto-populate the venue
// for both home and away Boro fixtures. Keys are normalised team names.
const HOME_GROUNDS: Record<string, string> = {
  "middlesbrough": "Riverside Stadium",
  "birmingham city": "St Andrew's",
  "birmingham": "St Andrew's",
  "blackburn rovers": "Ewood Park",
  "blackburn": "Ewood Park",
  "bristol city": "Ashton Gate",
  "charlton athletic": "The Valley",
  "charlton": "The Valley",
  "coventry city": "Coventry Building Society Arena",
  "coventry": "Coventry Building Society Arena",
  "derby county": "Pride Park Stadium",
  "derby": "Pride Park Stadium",
  "hull city": "MKM Stadium",
  "hull": "MKM Stadium",
  "ipswich town": "Portman Road",
  "ipswich": "Portman Road",
  "leicester city": "King Power Stadium",
  "leicester": "King Power Stadium",
  "millwall": "The Den",
  "norwich city": "Carrow Road",
  "norwich": "Carrow Road",
  "oxford united": "Kassam Stadium",
  "oxford": "Kassam Stadium",
  "portsmouth": "Fratton Park",
  "preston north end": "Deepdale",
  "preston": "Deepdale",
  "queens park rangers": "Loftus Road",
  "qpr": "Loftus Road",
  "sheffield united": "Bramall Lane",
  "sheffield wednesday": "Hillsborough",
  "southampton": "St Mary's Stadium",
  "stoke city": "bet365 Stadium",
  "stoke": "bet365 Stadium",
  "swansea city": "Swansea.com Stadium",
  "swansea": "Swansea.com Stadium",
  "watford": "Vicarage Road",
  "west bromwich albion": "The Hawthorns",
  "west brom": "The Hawthorns",
  "wrexham": "Racecourse Ground",
};

function venueFor(homeTeam: string): string | null {
  return HOME_GROUNDS[norm(homeTeam)] ?? null;
}

async function syncFixtures() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { fetchMfcLeagueFixtures } = await import("@/lib/mfc-official-fixtures.server");

  const scraped: ParsedFixture[] = [];
  const scrapeErrors: string[] = [];
  let source = "mfc.co.uk";

  // Primary source: the club's own first-team fixture feed (mfc.co.uk). It is
  // authoritative and updates as soon as a game is moved.
  try {
    const official = await fetchMfcLeagueFixtures();
    for (const fx of official) {
      scraped.push({
        competition: fx.competition,
        home_team: fx.homeTeam,
        away_team: fx.awayTeam,
        kickoff_at: fx.kickoffAt,
        venue: fx.venue,
      });
    }
  } catch (e) {
    scrapeErrors.push(`mfc.co.uk: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Fallback: BBC Sport monthly pages, only if the club feed gave us nothing.
  if (scraped.length === 0) {
    source = "bbc";
    for (const month of SEASON_MONTHS) {
      try {
        const rows = await scrapeMonth(month);
        scraped.push(...rows);
      } catch (e) {
        scrapeErrors.push(e instanceof Error ? e.message : String(e));
      }
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

  // Drop friendlies / non-competitive fixtures before they ever hit the DB.
  const competitive = unique.filter((fx) => isCompetitiveCompetition(fx.competition));
  if (competitive.length === 0) {
    return { ok: false, skipped: "no-competitive-fixtures-found", scrape_errors: scrapeErrors };
  }

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
  for (const fx of competitive) {
    const teamKey = `${norm(fx.home_team)}|${norm(fx.away_team)}`;
    const newKickoff = new Date(fx.kickoff_at).toISOString();
    const existingRow = byTeams.get(teamKey);

    if (!existingRow) {
      const { error } = await supabaseAdmin.from("boro_fixtures").insert({
        competition: fx.competition ?? "Championship",
        home_team: fx.home_team,
        away_team: fx.away_team,
        kickoff_at: newKickoff,
        venue: fx.venue ?? venueFor(fx.home_team),
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
      venue?: string | null;
    } = {};
    if (new Date(existingRow.kickoff_at).toISOString() !== newKickoff) {
      changes.kickoff_at = newKickoff;
    }
    if (fx.competition && fx.competition !== existingRow.competition) {
      changes.competition = fx.competition;
    }
    const expectedVenue = fx.venue ?? venueFor(fx.home_team);
    if (expectedVenue && expectedVenue !== existingRow.venue) {
      changes.venue = expectedVenue;
    }
    if (Object.keys(changes).length === 0) continue;
    const { error } = await supabaseAdmin
      .from("boro_fixtures")
      .update(changes)
      .eq("id", existingRow.id);
    if (error) errors.push(`update ${fx.home_team} v ${fx.away_team}: ${error.message}`);
    else updated.push(`${fx.home_team} v ${fx.away_team}: ${Object.keys(changes).join(",")}`);
  }

  // Fixtures changed → keep fantasy gameweeks in step automatically.
  let fantasy: unknown = null;
  try {
    const { syncFantasyGameweeksFromFixtures } = await import("@/lib/fantasy-gameweeks.server");
    fantasy = await syncFantasyGameweeksFromFixtures(supabaseAdmin as never);
  } catch (e) {
    fantasy = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  // Keep the fantasy player pool in step with the official mfc.co.uk squad —
  // confirmed signings are added into their position, departures marked.
  let fantasySquad: unknown = null;
  try {
    const { syncFantasyPlayersFromClub } = await import("@/lib/fantasy-squad-sync.server");
    fantasySquad = await syncFantasyPlayersFromClub(supabaseAdmin as never);
  } catch (e) {
    fantasySquad = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  return {
    ok: true,
    source,
    scraped: unique.length,
    inserted: inserted.length,
    updated: updated.length,
    errors,
    scrape_errors: scrapeErrors,
    inserted_list: inserted,
    updated_list: updated,
    fantasy,
    fantasy_squad: fantasySquad,
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