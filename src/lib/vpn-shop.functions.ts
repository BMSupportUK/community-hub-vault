import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Public-facing server locations for the shop VPN page: names and places only, no IPs or load. */
export const vpnShopServers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { vpnServers } = await import("./vpnresellers.server");
    const list = await vpnServers();
    return list
      .map((s) => ({ id: s.id, name: s.city || s.country_code, country: s.country_code, city: s.city }))
      .sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  });

/** The signed-in customer's own linked BM Player devices that can take the VPN. */
export const vpnShopDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("player_devices")
      .select("id, name, nickname, credential_id, last_seen_at")
      .eq("user_id", context.userId)
      .not("credential_id", "is", null)
      .order("last_seen_at", { ascending: false });
    return (data ?? []).map((d) => ({ id: String(d.id), name: String(d.nickname || d.name || "BM Player") }));
  });

/** Make the "ask to buy" link for one of the caller's own devices. No order is created here. */
export const vpnShopStart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ deviceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: dev } = await supabaseAdmin.from("player_devices").select("id, user_id").eq("id", data.deviceId).maybeSingle();
    if (!dev || dev.user_id !== context.userId) return { error: "That device isn't linked to your account." } as const;
    const { vpnBuy } = await import("./vpn-purchase.server");
    const r = await vpnBuy({ id: String(dev.id), user_id: String(dev.user_id) });
    if ("error" in r && r.error) return { error: String(r.error) } as const;
    const u = new URL((r as { url: string }).url);
    return { path: `${u.pathname}?from=shop${u.hash}` } as const;
  });
