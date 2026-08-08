/**
 * Official Middlesbrough FC first-team squad feed (mfc.co.uk).
 *
 * The club's Teams page is rendered from this endpoint, so it is the
 * authoritative source for who is in the first-team squad, their shirt
 * numbers and positions. Players arriving on a confirmed transfer appear
 * here as soon as the club announce them; departures disappear (or move to
 * the loaned-out list), which is how we keep the fantasy pool in step
 * without any admin involvement.
 */
const MFC_SQUAD_API =
  "https://teams.football.web.gc.middlesbroughfcservices.co.uk/v2/squads/opta";
const MFC_LOANED_OUT_API =
  "https://teams.football.web.gc.middlesbroughfcservices.co.uk/v2/loaned-out-players/team/t25/";
const MFC_TEAM_ID = "t25"; // Middlesbrough first team

export type FantasyPosition = "gk" | "def" | "mid" | "fwd";

export type MfcSquadPlayer = {
  mfcPlayerId: string;
  name: string;
  position: FantasyPosition;
  detailedPosition: string | null;
  shirtNumber: number | null;
  onLoanFrom: string | null;
};

export type MfcLoanedOutPlayer = {
  name: string;
  loanClub: string | null;
};

type OptaSquadPlayer = {
  playerID?: string | null;
  firstName?: string | null;
  surname?: string | null;
  knownName?: string | null;
  shirtNumber?: string | number | null;
  position?: string | null;
  realPosition?: string | null;
  onLoanFrom?: string | null;
  leaveDate?: string | null;
  published?: number | null;
};

const HEADERS = {
  Referer: "https://www.mfc.co.uk/",
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0 (compatible; BMSupportBot/1.0; +https://bmsupport.uk)",
};

function groupToPosition(group: string, realPosition?: string | null): FantasyPosition | null {
  const g = group.toLowerCase();
  if (g.startsWith("goalkeep")) return "gk";
  if (g.startsWith("defend")) return "def";
  if (g.startsWith("midfield")) return "mid";
  if (g.startsWith("forward") || g.startsWith("striker") || g.startsWith("attack")) return "fwd";
  // Fall back to the detailed Opta position if the club rename a group.
  const r = (realPosition ?? "").toLowerCase();
  if (r.includes("goalkeeper")) return "gk";
  if (r.includes("defender") || r.includes("back")) return "def";
  if (r.includes("midfield")) return "mid";
  if (r.includes("strik") || r.includes("winger") || r.includes("forward")) return "fwd";
  return null; // staff and anything unrecognised is ignored
}

function displayName(p: OptaSquadPlayer): string {
  const known = (p.knownName ?? "").trim();
  if (known) return known;
  return [(p.firstName ?? "").trim(), (p.surname ?? "").trim()].filter(Boolean).join(" ").trim();
}

/** Fetch the current first-team squad from the club site. */
export async function fetchMfcSquad(): Promise<MfcSquadPlayer[]> {
  const res = await fetch(`${MFC_SQUAD_API}?teamID=${MFC_TEAM_ID}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`MFC squad feed failed: HTTP ${res.status}`);
  const json = (await res.json()) as { body?: Record<string, OptaSquadPlayer[]> };
  const body = json.body ?? {};

  const out: MfcSquadPlayer[] = [];
  const seen = new Set<string>();
  for (const [group, players] of Object.entries(body)) {
    if (group.toLowerCase() === "staff") continue;
    const position = groupToPosition(group);
    for (const p of players ?? []) {
      const pos = position ?? groupToPosition(group, p.realPosition);
      if (!pos) continue;
      const id = (p.playerID ?? "").trim();
      const name = displayName(p);
      if (!id || !name) continue;
      if (p.published === 0) continue;
      if (p.leaveDate) continue; // already gone
      if (seen.has(id)) continue;
      seen.add(id);
      const shirtRaw = String(p.shirtNumber ?? "").trim();
      const shirt = shirtRaw ? Number(shirtRaw) : NaN;
      out.push({
        mfcPlayerId: id,
        name,
        position: pos,
        detailedPosition: (p.realPosition ?? null) || null,
        shirtNumber: Number.isFinite(shirt) && shirt > 0 ? shirt : null,
        onLoanFrom: (p.onLoanFrom ?? null) || null,
      });
    }
  }
  return out;
}

/** Players the club currently have out on loan — not eligible for the game. */
export async function fetchMfcLoanedOutPlayers(): Promise<MfcLoanedOutPlayer[]> {
  const res = await fetch(MFC_LOANED_OUT_API, { headers: HEADERS });
  if (!res.ok) return [];
  const json = (await res.json()) as {
    data?: Array<{ attributes?: { firstName?: string | null; lastName?: string | null; loanClub?: string | null; published?: number | null } }>;
  };
  const out: MfcLoanedOutPlayer[] = [];
  for (const row of json.data ?? []) {
    const a = row.attributes ?? {};
    if (a.published === 0) continue;
    const name = [(a.firstName ?? "").trim(), (a.lastName ?? "").trim()].filter(Boolean).join(" ").trim();
    if (!name) continue;
    out.push({ name, loanClub: (a.loanClub ?? null) || null });
  }
  return out;
}
