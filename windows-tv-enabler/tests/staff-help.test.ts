import { describe, expect, test } from "bun:test";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const core = require("../core.cjs");

describe("staff help ticket", () => {
  test("create posts the sharing token to the staff-help endpoint with the PIN login token", async () => {
    core.setEnablerToken("a".repeat(40));
    let seen: { url: string; init: { headers: Record<string, string>; body: string } } | null = null;
    const post = async (url: string, init: { headers: Record<string, string>; body: string }) => { seen = { url, init }; return new Response(JSON.stringify({ ok: true, connected: true }), { status: 200 }); };
    const r = await core.staffHelp({ mode: "create", shareToken: "b".repeat(64), device: "amazon", apps: ["App"] }, post);
    expect(r.connected).toBe(true);
    expect(seen!.url).toBe("https://bmsupport.uk/api/public/enabler-staff-help");
    expect(seen!.init.headers["x-enabler-token"]).toBe("a".repeat(40));
    expect(JSON.parse(seen!.init.body).shareToken).toBe("b".repeat(64));
    core.setEnablerToken("");
  });
  test("office closed reply is shown to the customer", async () => {
    const post = async () => new Response(JSON.stringify({ error: "Our office is closed right now" }), { status: 409 });
    await expect(core.staffHelp({ mode: "create", shareToken: "b".repeat(64), device: "amazon", apps: [] }, post)).rejects.toThrow("Our office is closed right now");
  });
});
