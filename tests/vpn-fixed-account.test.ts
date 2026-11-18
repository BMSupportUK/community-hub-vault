import { expect, mock, test } from "bun:test";

mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
const { createFixedVpnAccount } = await import("../src/lib/vpnresellers.server");

async function exercise(failExpiry: boolean) {
  const originalFetch = globalThis.fetch;
  const oldKey = process.env.LOVABLE_API_KEY, oldConnector = process.env.UDC_VPNRESELLERS_3_API_KEY;
  const calls: { method?: string; path: string; body: unknown }[] = [];
  process.env.LOVABLE_API_KEY = "test-only";
  process.env.UDC_VPNRESELLERS_3_API_KEY = "test-only";
  globalThis.fetch = mock(async (input, init) => {
    const path = new URL(String(input)).pathname.replace("/udc_vpnresellers_3", "");
    calls.push({ method: init?.method, path, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (path.endsWith("/expire") && failExpiry) return new Response("Rejected", { status: 422 });
    return Response.json({ data: { id: 42 } });
  }) as typeof fetch;
  try {
    const work = createFixedVpnAccount({ username: "test-user", password: "test-password" }, "2027-12-07T13:36:00Z");
    if (failExpiry) await expect(work).rejects.toThrow("422");
    else expect((await work).data.id).toBe(42);
    return calls;
  } finally {
    globalThis.fetch = originalFetch;
    if (oldKey === undefined) delete process.env.LOVABLE_API_KEY; else process.env.LOVABLE_API_KEY = oldKey;
    if (oldConnector === undefined) delete process.env.UDC_VPNRESELLERS_3_API_KEY; else process.env.UDC_VPNRESELLERS_3_API_KEY = oldConnector;
  }
}

test("new paid VPN gets the TV end date and disables provider auto-renewal before use", async () => {
  const calls = await exercise(false);
  expect(calls.map(c => c.path)).toEqual(["/accounts", "/accounts/42/expire"]);
  expect(calls[1].body).toEqual({ expire_at: "2027-12-07" });
});
test("expiry failure prevents returning the account and disables it", async () => {
  const calls = await exercise(true);
  expect(calls.map(c => c.path)).toEqual(["/accounts", "/accounts/42/expire", "/accounts/42/disable"]);
});