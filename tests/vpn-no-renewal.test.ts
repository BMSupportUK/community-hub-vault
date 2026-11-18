import { expect, mock, test } from "bun:test";
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { active: true, source: "app", paid_until: "2027-12-07T13:36:00Z" } }) }) }) }),
  rpc: () => ({ maybeSingle: async () => ({ data: { expiry_at: "2028-12-07T13:36:00Z" } }) }),
} }));
const { vpnEntitlement } = await import("../src/lib/vpnresellers.server");
test("TV renewal does not extend the paid VPN end date", async () => {
  expect(await vpnEntitlement("credential")).toEqual({ until: "2027-12-07T13:36:00Z" });
});