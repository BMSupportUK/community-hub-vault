import { describe, expect, test } from "bun:test";
import { sharedLogins } from "../src/lib/player-live";

describe("shared login flag", () => {
  test("four places at once is flagged", () => {
    const rows = Array.from({ length: 4 }, () => ({ iptv_username: "abc", user_id: "u1" }));
    expect(sharedLogins(rows).get("abc")).toBe("Playing in 4 places at once");
  });
  test("three places for one member is fine", () => {
    const rows = Array.from({ length: 3 }, () => ({ iptv_username: "abc", user_id: "u1" }));
    expect(sharedLogins(rows).size).toBe(0);
  });
  test("two different members on one login is flagged", () => {
    expect(sharedLogins([{ iptv_username: "abc", user_id: "u1" }, { iptv_username: "ABC", user_id: "u2" }]).get("abc")).toBe("Used by 2 different members");
  });
  test("an unlinked box alongside a member is flagged", () => {
    expect(sharedLogins([{ iptv_username: "abc", user_id: "u1" }, { iptv_username: "abc", user_id: null }]).has("abc")).toBe(true);
  });
});
