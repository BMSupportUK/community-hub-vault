/**
 * Keeps the fantasy player pool in step with the official mfc.co.uk squad.
 *
 * Runs automatically on the 6-hourly club sync: new confirmed signings are
 * added straight into their position, shirt numbers/positions are corrected,
 * and players who have left (or gone out on loan) are marked departed. Every
 * change is also logged in the club transfer feed so managers can see it.
 */
import type { FantasyPosition, MfcSquadLevel, MfcSquadPlayer } from "@/lib/mfc-official-squad.server";

type Admin = { from: (table: string) => any };

type PlayerRow = {
  id: string;
  name: string;
  position: string;
  shirt_number: number | null;
  shirt_number_locked?: boolean | null;
  value_m: number | string;
  status: string;
  sort_order: number | null;
  mfc_player_id: string | null;
  squad_level?: string | null;
  created_at?: string | null;
  status_locked?: boolean | null;
  loan_club?: string | null;
  loan_from?: string | null;
};

const POSITION_ORDER: Record<FantasyPosition, number> = { gk: 0, def: 1, mid: 2, fwd: 3 };
const LEVEL_ORDER: Record<MfcSquadLevel, number> = { first: 0, u21: 1, u18: 2 };

/** Start of the tracked 2026/27 transfer window — signings on/after this date count. */
const TRANSFER_WINDOW_START = "2026-06-01";
const TRANSFER_WINDOW_LABEL = "2026/27";

/** True when the club feed's joinDate falls inside the tracked window. */
function joinedInWindow(joinDate: string | null): boolean {
  return !!joinDate && joinDate >= TRANSFER_WINDOW_START;
}

/** Starting price for a brand-new signing, refined by their detailed role. */
function defaultValueM(position: FantasyPosition, detailed: string | null, level: MfcSquadLevel = "first"): number {
  // Academy/fringe players sit in their own cheap band (£1.0m–£2.5m).
  if (level !== "first") {
    const u18 = level === "u18";
    if (position === "gk") return u18 ? 1.0 : 1.5;
    if (position === "def") return u18 ? 1.0 : 1.5;
    if (position === "mid") return u18 ? 1.5 : 2.0;
    return u18 ? 2.0 : 2.5;
  }
  const d = (detailed ?? "").toLowerCase();
  if (position === "gk") return 5.0;
  if (position === "def") return d.includes("central") ? 5.0 : 4.0;
  if (position === "mid") return d.includes("attack") ? 6.5 : 5.5;
  if (d.includes("strik")) return 7.5;
  return 6.5;
}

function normName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The club's feeds are not consistent about first names (the loan list says
 * "Fin Munroe" while the squad feed says "Finley Munroe"). Match on surname
 * plus a first-name prefix so short forms still line up.
 */
function nameParts(s: string): { first: string; last: string } {
  const bits = normName(s).split(" ").filter(Boolean);
  return { first: bits[0] ?? "", last: bits.length > 1 ? bits[bits.length - 1]! : "" };
}

function samePerson(a: string, b: string): boolean {
  if (normName(a) === normName(b)) return true;
  const x = nameParts(a);
  const y = nameParts(b);
  if (!x.last || !y.last || x.last !== y.last) return false;
  if (!x.first || !y.first) return true;
  return x.first.startsWith(y.first) || y.first.startsWith(x.first);
}

export type FantasySquadSyncResult = {
  ok: boolean;
  squadSize?: number;
  added?: string[];
  updated?: string[];
  departed?: string[];
  loanedOut?: string[];
  error?: string;
};

export async function syncFantasyPlayersFromClub(admin: Admin): Promise<FantasySquadSyncResult> {
  const { fetchMfcSquad, fetchMfcAcademySquads, fetchMfcLoanedOutPlayers } = await import(
    "@/lib/mfc-official-squad.server"
  );

  let squad: MfcSquadPlayer[];
  try {
    squad = await fetchMfcSquad();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (squad.length < 11) {
    return { ok: false, error: `squad feed returned only ${squad.length} players — ignoring` };
  }

  // Fringe players: the Under-21 and Under-18 squads. Non-fatal on failure so a
  // flaky academy feed can never mark the whole fringe pool as departed.
  const academy = await fetchMfcAcademySquads().catch(() => [] as MfcSquadPlayer[]);
  // If the academy feed is empty/broken we must NOT treat every fringe player as
  // departed — skip departures for academy levels on that run instead.
  const academyOk = academy.length > 0;
  const seenIds = new Set(squad.map((p) => p.mfcPlayerId));
  for (const p of academy) {
    if (seenIds.has(p.mfcPlayerId)) continue; // already in the senior squad
    seenIds.add(p.mfcPlayerId);
    squad.push(p);
  }

  const loanedOut = await fetchMfcLoanedOutPlayers().catch(() => []);
  const loanClubFor = (name: string): string | null | undefined => {
    const hit = loanedOut.find((p) => samePerson(p.name, name));
    return hit ? hit.loanClub : undefined;
  };
  const isLoanedOut = (name: string) => loanClubFor(name) !== undefined;

  // Players out on loan stay in the pool (shown struck through, unselectable).
  const available = squad;

  const { data: existingRows, error: readErr } = await admin
    .from("fantasy_players")
    .select(
      "id, name, position, shirt_number, shirt_number_locked, value_m, status, sort_order, mfc_player_id, squad_level, created_at, status_locked, loan_club, loan_from",
    );
  if (readErr) return { ok: false, error: readErr.message };
  const existing = (existingRows ?? []) as PlayerRow[];

  const byMfcId = new Map<string, PlayerRow>();
  const byName = new Map<string, PlayerRow>();
  for (const r of existing) {
    if (r.mfc_player_id) byMfcId.set(r.mfc_player_id, r);
    byName.set(normName(r.name), r);
  }

  // Stable ordering: goalkeepers → defenders → midfielders → forwards, then shirt number.
  const ordered = [...available].sort((a, b) => {
    const p = POSITION_ORDER[a.position] - POSITION_ORDER[b.position];
    if (p !== 0) return p;
    const l = LEVEL_ORDER[a.squadLevel] - LEVEL_ORDER[b.squadLevel];
    if (l !== 0) return l;
    const s = (a.shirtNumber ?? 99) - (b.shirtNumber ?? 99);
    if (s !== 0) return s;
    return a.name.localeCompare(b.name);
  });

  const nowIso = new Date().toISOString();
  const added: string[] = [];
  const updated: string[] = [];
  const matchedIds = new Set<string>();

  // The transfer feed logs genuine 2026/27 movement only: first-team players who
  // join the official squad after the baseline snapshot, and players who joined
  // during this window and then left it. Anyone who was already in the pool at
  // baseline (i.e. left the club in an earlier season) is never logged, nor is
  // academy churn, and the very first baseline run logs nothing at all.
  const { data: baselineRow } = await admin
    .from("app_settings")
    .select("key, value")
    .eq("key", "fantasy_squad_baseline_at")
    .maybeSingle();
  const isBaseline = !baselineRow;
  const baselineAt = (() => {
    const raw = baselineRow?.value;
    const s = typeof raw === "string" ? raw : (raw as any)?.at;
    const t = s ? Date.parse(String(s)) : NaN;
    return Number.isFinite(t) ? t : null;
  })();

  void baselineAt;

  /** Record a club movement once — never duplicate the same player+direction. */
  async function logTransfer(
    playerName: string,
    direction: "in" | "out",
    playerId: string | null,
    note: string,
    transferDate?: string | null,
    otherClub?: string | null,
  ) {
    if (isBaseline) return;
    const { data: seen } = await admin
      .from("fantasy_club_transfers")
      .select("id")
      .eq("player_name", playerName)
      .eq("direction", direction)
      .maybeSingle();
    if (seen) return;
    await admin.from("fantasy_club_transfers").insert({
      player_name: playerName,
      direction,
      player_id: playerId,
      transfer_date: transferDate || nowIso.slice(0, 10),
      window_label: TRANSFER_WINDOW_LABEL,
      note,
      other_club: otherClub ?? null,
    });
  }

  for (let i = 0; i < ordered.length; i++) {
    const p = ordered[i]!;
    const row = byMfcId.get(p.mfcPlayerId) ?? byName.get(normName(p.name));
    const sortOrder = i;
    const onLoan = isLoanedOut(p.name);
    const loanClub = loanClubFor(p.name) ?? null;

    if (!row) {
      const { data: inserted, error } = await admin
        .from("fantasy_players")
        .insert({
          name: p.name,
          position: p.position,
          shirt_number: p.shirtNumber,
          value_m: defaultValueM(p.position, p.detailedPosition, p.squadLevel),
          status: onLoan ? "loaned_out" : "active",
          loan_club: onLoan ? loanClub : null,
          loan_from: p.onLoanFrom ?? null,
          sort_order: sortOrder,
          mfc_player_id: p.mfcPlayerId,
          squad_level: p.squadLevel,
          last_seen_at: nowIso,
        })
        .select("id")
        .single();
      if (error) continue;
      added.push(p.name);
      matchedIds.add((inserted as any).id as string);
      if (onLoan && p.squadLevel === "first") {
        await logTransfer(p.name, "out", (inserted as any).id as string, loanClub ? `Out on loan at ${loanClub}` : "Out on loan", null, loanClub);
      }
      if (p.squadLevel === "first" && joinedInWindow(p.joinDate)) {
        await logTransfer(
          p.name,
          "in",
          (inserted as any).id as string,
          p.onLoanFrom ? `Loan signing from ${p.onLoanFrom}` : "Signed for the 2026/27 season",
          p.joinDate,

          p.onLoanFrom ?? null,
        );
      }
      continue;
    }

    matchedIds.add(row.id);
    // Existing pool rows can still be genuine 2026/27 signings (e.g. added by an
    // earlier sync before the feed carried a join date) — log them once.
    if (p.squadLevel === "first" && joinedInWindow(p.joinDate)) {
      await logTransfer(
        p.name,
        "in",
        row.id,
        p.onLoanFrom ? `Loan signing from ${p.onLoanFrom}` : "Signed for the 2026/27 season",
        p.joinDate,

        p.onLoanFrom ?? null,
      );
    }
    const changes: Record<string, unknown> = { last_seen_at: nowIso };
    if ((row.loan_from ?? null) !== (p.onLoanFrom ?? null)) changes.loan_from = p.onLoanFrom ?? null;
    if (row.mfc_player_id !== p.mfcPlayerId) changes.mfc_player_id = p.mfcPlayerId;
    if (row.name !== p.name) changes.name = p.name;
    if (row.position !== p.position) changes.position = p.position;
    if ((row.squad_level ?? "first") !== p.squadLevel) changes.squad_level = p.squadLevel;
    // The academy feeds carry no shirt numbers, so never let a null from the feed
    // wipe a number we already hold — only write a real number the club publish.
    if (
      !(row as any).shirt_number_locked &&
      p.shirtNumber != null &&
      (row.shirt_number ?? null) !== p.shirtNumber
    ) {
      changes.shirt_number = p.shirtNumber;
    }
    if (row.status === "departed" && !row.status_locked) {
      changes.status = "active";
      changes.departed_at = null;
    }
    if (!row.status_locked) {
      if (onLoan && row.status !== "loaned_out") {
        changes.status = "loaned_out";
        changes.departed_at = null;
        changes.loan_club = loanClub;
        if (p.squadLevel === "first") {
          await logTransfer(p.name, "out", row.id, loanClub ? `Out on loan at ${loanClub}` : "Out on loan", null, loanClub);
        }
      } else if (!onLoan && row.status === "loaned_out") {
        // Loan over — back at the club and selectable again.
        changes.status = "active";
        changes.loan_club = null;
      } else if (onLoan && (row as any).loan_club !== loanClub) {
        changes.loan_club = loanClub;
      }
    }
    if ((row.sort_order ?? -1) !== sortOrder) changes.sort_order = sortOrder;
    const keys = Object.keys(changes).filter((k) => k !== "last_seen_at");
    await admin.from("fantasy_players").update(changes).eq("id", row.id);
    if (keys.length) updated.push(`${p.name}: ${keys.join(",")}`);
  }

  // Anyone we still hold who is no longer in the squad has left the club (or
  // gone out on loan) — mark them departed and log the exit.
  const departed: string[] = [];
  for (const row of existing) {
    if (matchedIds.has(row.id)) continue;
    // Out on loan, not gone: keep them in the pool, struck through.
    if (isLoanedOut(row.name)) continue;
    if (row.status === "departed") continue;
    // Manually added players (announced signings the club feed hasn't published
    // yet) have no club player id — never auto-depart them on a feed miss.
    if (!row.mfc_player_id) continue;
    // Fringe (academy) players are only judged against a healthy academy feed.
    if (!academyOk && (row.squad_level ?? "first") !== "first") continue;
    const { error } = await admin
      .from("fantasy_players")
      .update({ status: "departed", departed_at: nowIso })
      .eq("id", row.id);
    if (error) continue;
    departed.push(row.name);
    // Any first-team player who drops out of the official squad after the
    // baseline snapshot is a genuine 2026/27 departure — log it so the transfer
    // feed reflects the exit straight away.
    if ((row.squad_level ?? "first") === "first") {
      await logTransfer(row.name, "out", row.id, "Left the club — no longer in the official first-team squad");
    }
  }

  if (isBaseline) {
    await admin
      .from("app_settings")
      .upsert({ key: "fantasy_squad_baseline_at", value: nowIso as any }, { onConflict: "key" });
  }

  // Reconcile the official loaned-out list against everyone we hold, including
  // players the senior squad feed no longer lists.
  const loanedApplied: string[] = [];
  for (const row of existing) {
    if (!isLoanedOut(row.name)) continue;
    if (row.status_locked) continue;
    const club = loanClubFor(row.name) ?? null;
    if (row.status === "loaned_out" && (row.loan_club ?? null) === club) continue;
    const { error } = await admin
      .from("fantasy_players")
      .update({ status: "loaned_out", loan_club: club, departed_at: null })
      .eq("id", row.id);
    if (error) continue;
    loanedApplied.push(row.name);
    await logTransfer(row.name, "out", row.id, club ? `Out on loan at ${club}` : "Out on loan", null, club);
  }

  return { ok: true, squadSize: ordered.length, added, updated, departed, loanedOut: loanedApplied };
}
