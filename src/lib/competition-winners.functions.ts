import { createServerFn } from "@tanstack/react-start";

export type CompetitionWinnerSummary = {
  competition: "wc2026" | "boro2026";
  finished: boolean;
  winners: { place: number; displayName: string; confirmed: boolean }[];
};

export const getCompetitionWinnersSummary = createServerFn({ method: "GET" }).handler(
  async (): Promise<CompetitionWinnerSummary[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("prediction_winners")
      .select("competition, place, user_id, is_guest, confirmed_at")
      .order("place");

    const keys: ("wc2026" | "boro2026")[] = ["wc2026", "boro2026"];
    const out: CompetitionWinnerSummary[] = [];

    for (const key of keys) {
      const mine = (rows ?? []).filter((r: any) => r.competition === key);
      const winners: CompetitionWinnerSummary["winners"] = [];
      for (const r of mine) {
        let displayName = "Winner";
        if (r.is_guest) {
          const { data: g } = await supabaseAdmin
            .from(key === "wc2026" ? "wc_guest_entrants" : "boro_guest_entrants")
            .select("display_name")
            .eq("id", r.user_id)
            .maybeSingle();
          displayName = (g as any)?.display_name || "Guest";
        } else {
          const { data: p } = await supabaseAdmin
            .from("profiles")
            .select("display_name, username")
            .eq("id", r.user_id)
            .maybeSingle();
          displayName = (p as any)?.display_name || (p as any)?.username || "Winner";
        }
        winners.push({ place: r.place, displayName, confirmed: !!r.confirmed_at });
      }
      out.push({ competition: key, finished: winners.length > 0, winners });
    }

    return out;
  },
);
