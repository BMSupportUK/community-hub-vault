import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RegisteredDevice = {
  id: string;
  kind: "phone" | "browser";
  label: string;
  last_seen_at: string;
};
export type RegisteredAccount = {
  user_id: string;
  name: string;
  roles: string[];
  isStaff: boolean;
  devices: RegisteredDevice[];
};

const STAFF_ROLES = ["admin", "management", "staff", "moderator"];

function browserLabel(ua: string | null) {
  const u = ua ?? "";
  const b = /Edg\//.test(u) ? "Edge" : /Firefox\//.test(u) ? "Firefox" : /Chrome\//.test(u) ? "Chrome" : /Safari\//.test(u) ? "Safari" : "Browser";
  const os = /Android/.test(u) ? "Android" : /iPhone|iPad/.test(u) ? "iPhone" : /Windows/.test(u) ? "Windows" : /Mac OS/.test(u) ? "Mac" : /Linux/.test(u) ? "Linux" : "";
  return os ? `${b} on ${os}` : b;
}

/** Admin/management only: every account with a registered phone or browser. */
export const listRegisteredDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: mine } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId).in("role", ["admin", "management"]);
    if (!mine?.length) throw new Error("Admins only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: phones }, { data: subs }] = await Promise.all([
      supabaseAdmin.from("device_push_tokens").select("id, user_id, platform, last_seen_at"),
      supabaseAdmin.from("push_subscriptions").select("id, user_id, user_agent, last_seen_at"),
    ]);
    const map = new Map<string, RegisteredDevice[]>();
    const add = (uid: string, d: RegisteredDevice) => map.set(uid, [...(map.get(uid) ?? []), d]);
    for (const p of phones ?? []) add(p.user_id, { id: p.id, kind: "phone", label: `${p.platform === "ios" ? "iPhone" : "Android"} app`, last_seen_at: p.last_seen_at });
    for (const s of subs ?? []) add(s.user_id, { id: s.id, kind: "browser", label: browserLabel(s.user_agent), last_seen_at: s.last_seen_at });

    const ids = [...map.keys()];
    if (!ids.length) return [] as RegisteredAccount[];
    const [{ data: profs }, { data: roles }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, display_name, username").in("id", ids),
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
    ]);
    const out: RegisteredAccount[] = ids.map((uid) => {
      const p = (profs ?? []).find((x: any) => x.id === uid) as any;
      const r = (roles ?? []).filter((x: any) => x.user_id === uid).map((x: any) => String(x.role));
      return {
        user_id: uid,
        name: p?.username || p?.display_name || "Unknown account",
        roles: r,
        isStaff: r.some((x) => STAFF_ROLES.includes(x)),
        devices: map.get(uid)!.sort((a, b) => b.last_seen_at.localeCompare(a.last_seen_at)),
      };
    });
    return out.sort((a, b) => a.name.localeCompare(b.name));
  });
