import { describe, expect, test } from "bun:test";
import { anyPlayerSectionAllowed, playerSectionAllowed } from "../src/lib/player-sections";
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
  test("BM Player rows get their own permissions tab", () => {
    expect(permissionSection("bm-player-buffering")).toBe("player");
    expect(permissionSection("admin-player")).toBe("bm");
  });
});
