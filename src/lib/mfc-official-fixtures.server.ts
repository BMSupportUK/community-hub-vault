/**
 * Official Middlesbrough FC fixture feed (mfc.co.uk).
 *
 * The club site is a Nuxt app that renders its Matches page from this feed —
 * it is the authoritative first-team source (teamID t25) and is updated as
 * soon as the club/EFL move a game, so we use it for kick-off times, venues
 * and matchday numbers.
 */
const MFC_MATCHES_API =
  "https://matches.football.web.gc.middlesbroughfcservices.co.uk/v2/opta";
const MFC_TEAM_ID = "t25"; // Middlesbrough first team

export type MfcFixture = {
  competition: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string; // ISO UTC
  venue: string | null;
  matchDay: number | null;
  /** Draw made but date/kick-off time not confirmed yet. */
  dateTbc?: boolean;
};

type OptaTeam = { teamName?: string | null; teamID?: string | null };
type OptaMatch = {
  competitionName?: string | null;
  kickOffUTC?: string | null;
  kickOffUTCTimestamp?: number | null;
  venue?: string | null;
  matchDay?: string | number | null;
  matchType?: string | null;
  homeTeamID?: string | null;
  awayTeamID?: string | null;
  teamData?: OptaTeam[] | null;
  published?: number | null;
  tbc?: number | null;
};

/** Season ID used by the club feed — "2026" is the 2026/27 season. */
export function currentMfcSeasonId(now = new Date()): string {
  // A season that starts in August is labelled by its starting year; before
  // July we are still inside the previous season.
  const y = now.getUTCFullYear();
  return String(now.getUTCMonth() + 1 >= 7 ? y : y - 1);
}

/** League-only: the fantasy + predictor games never include cups or friendlies. */
export function isMfcLeagueCompetition(name: string | null | undefined): boolean {
  const c = (name ?? "").toLowerCase();
  if (!c) return false;
  if (/friendl|cup|trophy|play-?off|shield|europa|conference|champions league/.test(c)) return false;
  return /championship|premier league|league one|league two/.test(c);
}

/** Normalised competition name we store in boro_fixtures. */
function normaliseCompetition(name: string): string {
  const c = name.toLowerCase();
  if (c.includes("championship")) return "Championship";
  if (c.includes("premier league")) return "Premier League";
  if (c.includes("league one")) return "League One";
  if (c.includes("league two")) return "League Two";
  return name;
}

/**
 * Competitive first-team competitions: league, cups and play-offs.
 * Friendlies, testimonials and non-first-team games are never included.
 */
export function isMfcCompetitiveCompetition(name: string | null | undefined): boolean {
  const c = (name ?? "").toLowerCase();
  if (!c) return false;
  if (/friendl|testimonial|tour|u2\d|under[- ]?2\d|academy|youth|reserve|women/.test(c)) return false;
  return /championship|premier league|league one|league two|carabao|league cup|fa cup|efl trophy|papa|vertu|bristol street|checkatrade|play-?off|shield/.test(
    c,
  );
}

/**
 * Every competitive first-team fixture from the club feed — including cup and
 * play-off ties that have only just been drawn and still have no confirmed
 * date. Those come back with `dateTbc: true` and a provisional kick-off, and
 * the feed flips them to a real date once the club/EFL confirm it.
 */
export async function fetchMfcCompetitiveFixtures(
  seasonId = currentMfcSeasonId(),
): Promise<MfcFixture[]> {
  const url = `${MFC_MATCHES_API}?clientMatches=true&teamID=${MFC_TEAM_ID}&seasonID=${seasonId}&pageSize=200&pageNumber=1`;
  const res = await fetch(url, {
    headers: {
      Referer: "https://www.mfc.co.uk/",
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; BMSupportBot/1.0; +https://bmsupport.uk)",
    },
  });
  if (!res.ok) throw new Error(`MFC fixtures feed failed: HTTP ${res.status}`);
  const json = (await res.json()) as { success?: boolean; body?: OptaMatch[] };
  const body = json.body ?? [];

  const out: MfcFixture[] = [];
  for (const m of body) {
    const comp = m.competitionName ?? "";
    if (!isMfcCompetitiveCompetition(comp)) continue;
    const iso = m.kickOffUTC
      ? new Date(m.kickOffUTC).toISOString()
      : m.kickOffUTCTimestamp
        ? new Date(m.kickOffUTCTimestamp).toISOString()
        : null;
    if (!iso || Number.isNaN(new Date(iso).getTime())) continue;
    const teams = m.teamData ?? [];
    const home = teams.find((t) => t.teamID && t.teamID === m.homeTeamID)?.teamName ?? teams[0]?.teamName;
    const away = teams.find((t) => t.teamID && t.teamID === m.awayTeamID)?.teamName ?? teams[1]?.teamName;
    if (!home || !away) continue;
    if (!/middlesbrough/i.test(home) && !/middlesbrough/i.test(away)) continue;
    const md = m.matchDay == null ? null : Number(m.matchDay);
    out.push({
      competition: normaliseCompetition(comp),
      homeTeam: home,
      awayTeam: away,
      kickoffAt: iso,
      venue: m.venue ?? null,
      matchDay: Number.isFinite(md) ? (md as number) : null,
      dateTbc: m.tbc === 1,
    });
  }
  out.sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt));
  return out;
}

/** Fetch this season's first-team league fixtures from mfc.co.uk. */
export async function fetchMfcLeagueFixtures(seasonId = currentMfcSeasonId()): Promise<MfcFixture[]> {
  const url = `${MFC_MATCHES_API}?clientMatches=true&teamID=${MFC_TEAM_ID}&seasonID=${seasonId}&pageSize=200&pageNumber=1`;
  const res = await fetch(url, {
    headers: {
      Referer: "https://www.mfc.co.uk/",
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; BMSupportBot/1.0; +https://bmsupport.uk)",
    },
  });
  if (!res.ok) throw new Error(`MFC fixtures feed failed: HTTP ${res.status}`);
  const json = (await res.json()) as { success?: boolean; body?: OptaMatch[] };
  const body = json.body ?? [];

  const out: MfcFixture[] = [];
  for (const m of body) {
    const comp = m.competitionName ?? "";
    if (!isMfcLeagueCompetition(comp)) continue; // league games only
    // Only genuine league rounds — never play-offs or one-off specials.
    if (m.matchType && m.matchType !== "Regular") continue;
    const iso = m.kickOffUTC
      ? new Date(m.kickOffUTC).toISOString()
      : m.kickOffUTCTimestamp
        ? new Date(m.kickOffUTCTimestamp).toISOString()
        : null;
    if (!iso) continue;
    const teams = m.teamData ?? [];
    const home = teams.find((t) => t.teamID && t.teamID === m.homeTeamID)?.teamName ?? teams[0]?.teamName;
    const away = teams.find((t) => t.teamID && t.teamID === m.awayTeamID)?.teamName ?? teams[1]?.teamName;
    if (!home || !away) continue;
    // First team only — the feed is already t25, this is belt and braces.
    if (!/middlesbrough/i.test(home) && !/middlesbrough/i.test(away)) continue;
    const md = m.matchDay == null ? null : Number(m.matchDay);
    out.push({
      competition: normaliseCompetition(comp),
      homeTeam: home,
      awayTeam: away,
      kickoffAt: iso,
      venue: m.venue ?? null,
      matchDay: Number.isFinite(md) ? (md as number) : null,
    });
  }
  out.sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt));
  return out;
}
