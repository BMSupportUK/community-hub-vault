import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { serverTrafficList } from "./vpn-pick-server";

/** Live-section access only; never return VPN account credentials or configuration. */
export const liveVpnTraffic = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: allowed, error: accessError } = await context.supabase.rpc("player_section_allowed", { _section: "live" });
    if (accessError || !allowed) throw new Error("Live connections access required.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { vpnServers } = await import("./vpnresellers.server");
    const [servers, { data: accounts, error }] = await Promise.all([
      vpnServers(),
      supabaseAdmin.from("vpn_accounts").select("device_id, server_id").eq("enabled", true).not("device_id", "is", null),
    ]);
    if (error) throw new Error("Could not read VPN server assignments.");
    const readings = new Map(serverTrafficList(servers).map(s => [s.id, s]));
    return {
      checked_at: new Date().toISOString(),
      devices: (accounts ?? []).flatMap(account => {
        const server = account.server_id ? readings.get(account.server_id) : undefined;
        return account.device_id && server ? [{ device_id: account.device_id, ...server }] : [];
      }),
    };
  });