import { expect, mock, test } from "bun:test";
const owner = "owner";
const inserted: Record<string, any> = {};
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  rpc: () => ({ maybeSingle: async () => ({ data: { owner_id: owner, expiry_at: "2027-12-07T13:36:00Z" } }) }),
  from: (table: string) => {
    const chain: any = {
      select: () => chain, eq: () => chain, is: () => chain, gte: () => chain, order: () => chain, limit: () => chain,
      maybeSingle: async () => ({ data: table === "player_devices" ? { credential_id: "credential" } : table === "profiles" ? { username: "Test" } : null }),
      insert: (value: any) => {
        if (table === "order_checkout_links" && value.skip_registration) throw new Error("Only admin can change account creation");
        inserted[table] = value; return chain;
      },
      single: async () => ({ data: { id: "order" } }),
      then: (resolve: (x: any) => unknown) => resolve({ error: null }),
    }; return chain;
  },
} }));
test("VPN purchase creates a private link without requesting the manual registration exception", async () => {
  const { vpnBuy } = await import("../src/lib/vpn-purchase.server");
  const result = await vpnBuy({ id: "device", user_id: owner });
  expect(result.url).toMatch(/^https:\/\/bmsupport.uk\/vpn-pay\/[a-f0-9]{64}#/);
  expect(inserted.order_checkout_links.claimed_by).toBe(owner);
  expect(inserted.order_checkout_links.skip_registration).toBeUndefined();
  expect(inserted.orders.credential_id).toBe("credential");
  expect(inserted.vpn_purchases.paid_until).toBe("2027-12-07T13:36:00.000Z");
});