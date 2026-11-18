import { expect, mock, test } from "bun:test";

let expiryError: { message: string } | null = null;
const owner = "b6ec8f38-2e2a-41ce-98fc-94681047a288";
mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table !== "player_devices") throw new Error("Quote must not read the profile-filtered credential view");
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { credential_id: "8cdafca2-dbd9-4906-a7b1-b7642555fa05" } }) }) }) };
    },
    rpc: (name: string) => {
      if (name !== "vpn_credential_expiry") throw new Error("Unexpected expiry read");
      return { maybeSingle: async () => ({ data: { owner_id: owner, expiry_at: "2027-12-07T13:36:00Z" }, error: expiryError }) };
    },
  },
}));
const { vpnQuote } = await import("../src/lib/vpn-purchase.server");
const now = Date.parse("2026-11-18T12:08:00Z");
test("Get VPN quotes the linked subscription to 7 December 2027", async () => {
  expect(await vpnQuote({ id: "device", user_id: owner }, now)).toMatchObject({ ok: true, pence: 2530, until: "2027-12-07T13:36:00.000Z", userId: owner });
});
test("Get VPN refuses an expiry belonging to another profile", async () => {
  expect((await vpnQuote({ id: "device", user_id: "other" }, now)).ok).toBe(false);
});
test("Get VPN distinguishes failed expiry reads from missing dates", async () => {
  expiryError = { message: "permission denied" };
  try {
    expect(await vpnQuote({ id: "device", user_id: owner }, now)).toEqual({ ok: false, reason: "Couldn't check your subscription end date. Try again shortly." });
  } finally { expiryError = null; }
});