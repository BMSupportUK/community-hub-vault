import { createServerFn } from "@tanstack/react-start";

export interface GateStaffPresenceEntry {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  role: string;
  online: boolean;
  on_shift: boolean;
}

export const getGateStaffPresence = createServerFn({ method: "GET" }).handler(
  async (): Promise<GateStaffPresenceEntry[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: roleRows } = await supabaseAdmin
      .from("user_roles")
      .select("user_id,role")
      .in("role", ["admin", "management", "staff", "moderator"]);
    if (!roleRows || roleRows.length === 0) return [];

    const rank: Record<string, number> = { admin: 0, management: 1, staff: 2, moderator: 3 };
    const bestRole = new Map<string, string>();
    for (const r of roleRows) {
      const cur = bestRole.get(r.user_id);
      if (!cur || rank[r.role] < rank[cur]) bestRole.set(r.user_id, r.role);
    }
    const ids = Array.from(bestRole.keys());

    const [{ data: profs }, { data: shifts }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id,username,display_name,avatar_url,last_seen_at")
        .in("id", ids),
      supabaseAdmin
        .from("shifts")
        .select("user_id")
        .is("clock_out", null),
    ]);

    const onShift = new Set((shifts ?? []).map((s) => s.user_id));
    const now = Date.now();

    const entries: GateStaffPresenceEntry[] = (profs ?? []).map((p) => ({
      user_id: p.id,
      display_name: p.display_name || p.username || "Staff",
      avatar_url: p.avatar_url,
      role: bestRole.get(p.id) ?? "staff",
      online: p.last_seen_at ? now - new Date(p.last_seen_at).getTime() < 5 * 60 * 1000 : false,
      on_shift: onShift.has(p.id),
    }));

    entries.sort((a, b) => {
      const oa = a.online ? 0 : 1;
      const ob = b.online ? 0 : 1;
      if (oa !== ob) return oa - ob;
      const ra = rank[a.role] ?? 9;
      const rb = rank[b.role] ?? 9;
      if (ra !== rb) return ra - rb;
      return a.display_name.localeCompare(b.display_name);
    });

    return entries;
  },
);
