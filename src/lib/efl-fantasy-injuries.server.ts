/**
 * Injury + suspension flags for the fantasy pool, sourced from the official EFL
 * Fantasy feed (fantasy.efl.com). Public JSON, no auth.
 *
 * The feed names players abbreviated ("R. McGree"), so matching is surname +
 * first-initial against our pool. Rows an admin has set by hand are never
 * touched — `injury_source = 'admin'` wins until an admin clears it.
 */

type Admin = { from: (table: string) => any };

/** Middlesbrough's squad id in the EFL Fantasy feed. */
const EFL_SQUAD_ID = 25;
const PLAYERS_URL = "https://fantasy.efl.com/json/fantasy/players.json";

type EflInjuryDetails = {
  type?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  expectedEndDate?: string | null;
  status?: string | null;
};

type EflPlayer = {
  squadId?: number;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  status?: string | null;
  injuryDetails?: EflInjuryDetails | null;
  suspensionDetails?: { type?: string | null; expectedEndDate?: string | null } | null;
};

export type InjuryStatus = "none" | "doubtful" | "out" | "suspended";

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parts(s: string): { first: string; last: string } {
  const bits = norm(s).split(" ").filter(Boolean);
  return { first: bits[0] ?? "", last: bits.length > 1 ? bits[bits.length - 1]! : (bits[0] ?? "") };
}

/** Surname must match; first names match on either being a prefix (initials included). */
function samePerson(a: string, b: string): boolean {
  const x = parts(a);
  const y = parts(b);
  if (!x.last || !y.last || x.last !== y.last) return false;
  if (!x.first || !y.first) return true;
  return x.first.startsWith(y.first) || y.first.startsWith(x.first);
}

function fmtDate(d: string | null | undefined): string | null {
  if (!d) return null;
  const t = Date.parse(d);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** A knock due back within 10 days is "doubtful"; anything else injured is "out". */
function severity(det: EflInjuryDetails | null | undefined): "doubtful" | "out" {
  const type = (det?.type ?? "").toLowerCase();
  const end = det?.expectedEndDate ? Date.parse(det.expectedEndDate) : NaN;
  const soon = Number.isFinite(end) && end - Date.now() < 10 * 24 * 60 * 60 * 1000;
  if (/knock|illness|ill|fatigue|minor/.test(type) && soon) return "doubtful";
  if (/\bout\b/.test((det?.status ?? "").toLowerCase())) return "out";
  return "out";
}

type Flag = { status: InjuryStatus; note: string | null; ret: string | null };

function flagFor(p: EflPlayer): Flag {
  const raw = (p.status ?? "").toLowerCase();
  if (raw === "suspended" || p.suspensionDetails) {
    return {
      status: "suspended",
      note: p.suspensionDetails?.type ?? "Suspended",
      ret: fmtDate(p.suspensionDetails?.expectedEndDate ?? null),
    };
  }
  if (raw === "injured" || p.injuryDetails) {
    const det = p.injuryDetails ?? null;
    return { status: severity(det), note: det?.type ?? "Injured", ret: fmtDate(det?.expectedEndDate ?? null) };
  }
  return { status: "none", note: null, ret: null };
}

export type EflInjurySyncResult = {
  ok: boolean;
  error?: string;
  feedPlayers?: number;
  flagged?: string[];
  cleared?: string[];
  unmatched?: string[];
};

export async function syncFantasyInjuriesFromEfl(admin: Admin): Promise<EflInjurySyncResult> {
  let feed: EflPlayer[];
  try {
    const res = await fetch(PLAYERS_URL, {
      headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (compatible; BMSupportFantasy/1.0)" },
    });
    if (!res.ok) return { ok: false, error: `EFL feed HTTP ${res.status}` };
    feed = (await res.json()) as EflPlayer[];
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (!Array.isArray(feed) || feed.length < 100) return { ok: false, error: "EFL feed looked empty" };

  const boro = feed.filter((p) => p.squadId === EFL_SQUAD_ID);
  if (!boro.length) return { ok: false, error: "no Middlesbrough players in EFL feed" };

  const { data: rows, error } = await admin
    .from("fantasy_players")
    .select("id, name, injury_status, injury_note, injury_return, injury_source");
  if (error) return { ok: false, error: error.message };

  const pool = (rows ?? []) as {
    id: string;
    name: string;
    injury_status: string | null;
    injury_note: string | null;
    injury_return: string | null;
    injury_source: string | null;
  }[];

  const nowIso = new Date().toISOString();
  const flagged: string[] = [];
  const cleared: string[] = [];
  const unmatched: string[] = [];
  const seen = new Set<string>();

  for (const fp of boro) {
    const feedName = `${fp.firstName ?? ""} ${fp.lastName ?? ""}`.trim() || (fp.displayName ?? "");
    if (!feedName) continue;
    const row = pool.find((r) => samePerson(r.name, feedName));
    const flag = flagFor(fp);
    if (!row) {
      if (flag.status !== "none") unmatched.push(feedName);
      continue;
    }
    seen.add(row.id);
    if (row.injury_source === "admin") continue;

    if (flag.status === "none") {
      if ((row.injury_status ?? "none") !== "none") {
        await admin
          .from("fantasy_players")
          .update({ injury_status: "none", injury_note: null, injury_return: null, injury_source: null, injury_updated_at: nowIso })
          .eq("id", row.id);
        cleared.push(row.name);
      }
      continue;
    }

    if (
      row.injury_status === flag.status &&
      (row.injury_note ?? null) === flag.note &&
      (row.injury_return ?? null) === flag.ret
    ) {
      continue;
    }
    await admin
      .from("fantasy_players")
      .update({
        injury_status: flag.status,
        injury_note: flag.note,
        injury_return: flag.ret,
        injury_source: "feed",
        injury_updated_at: nowIso,
      })
      .eq("id", row.id);
    flagged.push(`${row.name}: ${flag.status}${flag.note ? ` (${flag.note})` : ""}`);
  }

  // Anyone the feed no longer lists at all: drop stale feed-set flags.
  for (const row of pool) {
    if (seen.has(row.id)) continue;
    if (row.injury_source !== "feed") continue;
    if ((row.injury_status ?? "none") === "none") continue;
    await admin
      .from("fantasy_players")
      .update({ injury_status: "none", injury_note: null, injury_return: null, injury_source: null, injury_updated_at: nowIso })
      .eq("id", row.id);
    cleared.push(row.name);
  }

  return { ok: true, feedPlayers: boro.length, flagged, cleared, unmatched };
}
