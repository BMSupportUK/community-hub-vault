/**
 * Keeps the fantasy player pool in step with the official mfc.co.uk squad.
 *
 * Runs automatically on the 6-hourly club sync: new confirmed signings are
 * added straight into their position, shirt numbers/positions are corrected,
 * and players who have left (or gone out on loan) are marked departed. Every
 * change is also logged in the club transfer feed so managers can see it.
 */
import type { FantasyPosition, MfcSquadPlayer } from "@/lib/mfc-official-squad.server";

type Admin = { from: (table: string) => any };

type PlayerRow = {
  id: string;
  name: string;
  position: string;
  shirt_number: number | null;
  value_m: number | string;
  status: string;
  sort_order: number | null;
  mfc_player_id: string | null;
};

const POSITION_ORDER: Record<FantasyPosition, number> = { gk: 0, def: 1, mid: 2, fwd: 3 };

/** Starting price for a brand-new signing, refined by their detailed role. */
function defaultValueM(position: FantasyPosition, detailed: string | null): number {
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

export type FantasySquadSyncResult = {
  ok: boolean;
  squadSize?: number;
  added?: string[];
  updated?: string[];
  departed?: string[];
  error?: string;
};

export async function syncFantasyPlayersFromClub(admin: Admin): Promise<FantasySquadSyncResult> {
  const { fetchMfcSquad, fetchMfcLoanedOutPlayers } = await import("@/lib/mfc-official-squad.server");

  let squad: MfcSquadPlayer[];
  try {
    squad = await fetchMfcSquad();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (squad.length < 11) {
    return { ok: false, error: `squad feed returned only ${squad.length} players — ignoring` };
  }

  const loanedOut = await fetchMfcLoanedOutPlayers().catch(() => []);
  const loanedNames = new Set(loanedOut.map((p) => normName(p.name)));
  const loanClubByName = new Map(loanedOut.map((p) => [normName(p.name), p.loanClub] as const));

  // Players out on loan are not selectable.
  const available = squad.filter((p) => !loanedNames.has(normName(p.name)));

  const { data: existingRows, error: readErr } = await admin
    .from("fantasy_players")
    .select("id, name, position, shirt_number, value_m, status, sort_order, mfc_player_id");
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
    return (a.shirtNumber ?? 99) - (b.shirtNumber ?? 99);
  });

  const nowIso = new Date().toISOString();
  const added: string[] = [];
  const updated: string[] = [];
  const matchedIds = new Set<string>();

  // The very first sync imports the whole existing squad — those players were
  // already at the club, so nothing from a baseline run belongs in the club
  // transfer feed. Only later runs log genuine arrivals/exits.
  const { data: baselineRow } = await admin
    .from("app_settings")
    .select("key")
    .eq("key", "fantasy_squad_baseline_at")
    .maybeSingle();
  const isBaseline = !baselineRow;
  const logTransfers = !isBaseline;

  for (let i = 0; i < ordered.length; i++) {
    const p = ordered[i]!;
    const row = byMfcId.get(p.mfcPlayerId) ?? byName.get(normName(p.name));
    const sortOrder = i;

    if (!row) {
      const { data: inserted, error } = await admin
        .from("fantasy_players")
        .insert({
          name: p.name,
          position: p.position,
          shirt_number: p.shirtNumber,
          value_m: defaultValueM(p.position, p.detailedPosition),
          status: "active",
          sort_order: sortOrder,
          mfc_player_id: p.mfcPlayerId,
          last_seen_at: nowIso,
        })
        .select("id")
        .single();
      if (error) continue;
      added.push(p.name);
      matchedIds.add((inserted as any).id as string);
      // Log the confirmed arrival in the club transfer feed (once).
      if (!logTransfers) continue;
      const { data: dupe } = await admin
        .from("fantasy_club_transfers")
        .select("id")
        .eq("direction", "in")
        .ilike("player_name", p.name)
        .limit(1);
      if (!dupe || dupe.length === 0) {
        await admin.from("fantasy_club_transfers").insert({
          player_name: p.name,
          direction: "in",
          other_club: p.onLoanFrom,
          window_label: null,
          transfer_date: nowIso.slice(0, 10),
          player_id: (inserted as any).id,
          note: p.onLoanFrom ? "Loan signing — added automatically from mfc.co.uk" : "Added automatically from mfc.co.uk squad",
        });
      }
      continue;
    }

    matchedIds.add(row.id);
    const changes: Record<string, unknown> = { last_seen_at: nowIso };
    if (row.mfc_player_id !== p.mfcPlayerId) changes.mfc_player_id = p.mfcPlayerId;
    if (row.name !== p.name) changes.name = p.name;
    if (row.position !== p.position) changes.position = p.position;
    if ((row.shirt_number ?? null) !== (p.shirtNumber ?? null)) changes.shirt_number = p.shirtNumber;
    if (row.status === "departed") {
      changes.status = "active";
      changes.departed_at = null;
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
    if (row.status === "departed") continue;
    const { error } = await admin
      .from("fantasy_players")
      .update({ status: "departed", departed_at: nowIso })
      .eq("id", row.id);
    if (error) continue;
    departed.push(row.name);
    if (!logTransfers) continue;
    const { data: dupe } = await admin
      .from("fantasy_club_transfers")
      .select("id")
      .eq("direction", "out")
      .ilike("player_name", row.name)
      .limit(1);
    if (!dupe || dupe.length === 0) {
      const loanClub = loanClubByName.get(normName(row.name)) ?? null;
      await admin.from("fantasy_club_transfers").insert({
        player_name: row.name,
        direction: "out",
        other_club: loanClub,
        transfer_date: nowIso.slice(0, 10),
        player_id: row.id,
        note: loanClub
          ? `Out on loan at ${loanClub} — removed automatically from mfc.co.uk squad`
          : "No longer in the mfc.co.uk first-team squad",
      });
    }
  }

  if (isBaseline) {
    await admin
      .from("app_settings")
      .upsert({ key: "fantasy_squad_baseline_at", value: nowIso as any }, { onConflict: "key" });
  }

  return { ok: true, squadSize: ordered.length, added, updated, departed };
}
