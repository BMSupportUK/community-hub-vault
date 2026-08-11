import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";

export type EntrantSquadPickDTO = {
  playerId: string;
  name: string;
  shirtNumber: number | null;
  position: "gk" | "def" | "mid" | "fwd";
  pickedPosition: "gk" | "def" | "mid" | "fwd" | null;
  isStarter: boolean;
  slotOrder: number;
  points: number | null;
  autoSubbed: boolean;
  isCaptain: boolean;
  isVice: boolean;
};

export type EntrantSquadViewDTO = {
  found: boolean;
  formation: string | null;
  points: number | null;
  transferCost: number;
  picks: EntrantSquadPickDTO[];
};

/**
 * Public read of another manager's squad for a gameweek. Only ever returns picks
 * once that gameweek has locked, so nobody can copy a rival's team in advance.
 */
export const getEntrantFantasySquad = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        entrantId: z.string().uuid(),
        isGuest: z.boolean(),
        gameweekId: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<EntrantSquadViewDTO> => {
    setResponseHeader("cache-control", "no-store, max-age=0");
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");

    const { data: gw, error: gwErr } = await admin
      .from("fantasy_gameweeks")
      .select("id, lock_at, status")
      .eq("id", data.gameweekId)
      .maybeSingle();
    if (gwErr) throw new Error(gwErr.message);
    if (!gw) throw new Error("Gameweek not found");
    const locked =
      (gw as any).status !== "upcoming" ||
      new Date((gw as any).lock_at).getTime() <= Date.now();
    if (!locked) throw new Error("This gameweek hasn't locked yet — squads stay hidden until lock-in.");

    const col = data.isGuest ? "guest_id" : "user_id";
    const { data: squad, error: sqErr } = await admin
      .from("fantasy_squads")
      .select(
        "id, formation, captain_id, vice_id, transfer_cost, points, picks:fantasy_squad_picks(player_id, is_starter, slot_order, points, auto_subbed, picked_position)",
      )
      .eq(col, data.entrantId)
      .eq("gameweek_id", data.gameweekId)
      .maybeSingle();
    if (sqErr) throw new Error(sqErr.message);
    if (!squad) return { found: false, formation: null, points: null, transferCost: 0, picks: [] };

    const s = squad as any;
    const ids: string[] = [
      ...new Set(((s.picks ?? []) as any[]).map((p) => p.player_id as string)),
    ];
    const { data: players } = ids.length
      ? await admin.from("fantasy_players").select("id, name, shirt_number, position").in("id", ids)
      : { data: [] as any[] };
    const pMap = new Map<string, any>(((players ?? []) as any[]).map((p) => [p.id, p]));

    const picks: EntrantSquadPickDTO[] = ((s.picks ?? []) as any[])
      .map((p) => {
        const pl = pMap.get(p.player_id) ?? {};
        return {
          playerId: p.player_id,
          name: pl.name ?? "Unknown player",
          shirtNumber: pl.shirt_number ?? null,
          position: (pl.position ?? "mid") as EntrantSquadPickDTO["position"],
          pickedPosition: (p.picked_position ?? null) as EntrantSquadPickDTO["pickedPosition"],
          isStarter: !!p.is_starter,
          slotOrder: p.slot_order ?? 0,
          points: p.points ?? null,
          autoSubbed: !!p.auto_subbed,
          isCaptain: p.player_id === s.captain_id,
          isVice: p.player_id === s.vice_id,
        };
      })
      .sort((a, b) =>
        a.isStarter === b.isStarter ? a.slotOrder - b.slotOrder : a.isStarter ? -1 : 1,
      );

    return {
      found: true,
      formation: s.formation ?? null,
      points: s.points ?? null,
      transferCost: s.transfer_cost ?? 0,
      picks,
    };
  });
