import { describe, expect, test } from "bun:test";
import { anyPlayerSectionAllowed, playerPageAllowed, playerSectionAllowed } from "../src/lib/player-sections";
import { permissionSection } from "../src/lib/permission-sections";

const perms = { "bm-player-buffering": ["staff"], "bm-player-security": ["management"] } as Record<string, string[]>;

describe("BM Player section permissions", () => {
  test("staff open only the sections ticked for staff", () => {
    expect(playerSectionAllowed("buffering", ["staff"], perms)).toBe(true);
    expect(playerSectionAllowed("security", ["staff"], perms)).toBe(false);
  });
  test("owner-only sections can never be granted", () => {
    expect(playerSectionAllowed("dns", ["staff"], { "bm-player-dns": ["staff"] })).toBe(false);
    expect(playerSectionAllowed("dns", ["admin"], null)).toBe(true);
  });
  test("staff with no ticked section cannot open the dashboard", () => {
    expect(anyPlayerSectionAllowed(["staff"], { "bm-player-security": ["management"] })).toBe(false);
  });
  test("seeing live connections does not allow messaging a box", () => {
    const liveOnly = { "bm-player-live": ["staff"] };
    expect(playerSectionAllowed("live", ["staff"], liveOnly)).toBe(true);
    expect(playerSectionAllowed("announcements", ["staff"], liveOnly)).toBe(false);
    expect(playerSectionAllowed("announcements", ["staff"], { "bm-player-live": ["staff"], "bm-player-announcements": ["staff"] })).toBe(true);
  });
  test("BM Player pages open from the BM Player ticks, not the BM Support list", () => {
    const liveOnly = { "bm-player-live": ["staff"] };
    expect(playerPageAllowed("admin-player-live", ["staff"], liveOnly)).toBe(true);
    expect(playerPageAllowed("admin-player", ["staff"], liveOnly)).toBe(true);
    expect(playerPageAllowed("admin-player-live", ["staff"], { "bm-player-buffering": ["staff"] })).toBe(false);
    expect(playerPageAllowed("admin", ["staff"], {})).toBe(false);
  });
  test("BM Player rows get their own permissions tab", () => {
    expect(permissionSection("bm-player-buffering")).toBe("player");
    expect(permissionSection("admin-player")).toBe("bm");
  });
});
