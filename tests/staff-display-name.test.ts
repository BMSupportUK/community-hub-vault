import { expect, test } from "bun:test";
import { staffDisplayName } from "../src/lib/staff-display-name";

test("prefers the username over the display name", () => {
  expect(staffDisplayName({ username: "normanbyred77", display_name: "Normanby Red 77" })).toBe("normanbyred77");
});

test("never returns an email address when the username is missing", () => {
  expect(staffDisplayName({ username: null, display_name: null })).toBe("Staff");
  expect(staffDisplayName({ username: "   ", display_name: null })).toBe("Staff");
  expect(staffDisplayName(null)).toBe("Staff");
});

test("skips a display name that is really an email address", () => {
  expect(staffDisplayName({ username: null, display_name: "normanby@example.com" })).toBe("Staff");
});

test("falls back to the display name when the username is absent", () => {
  expect(staffDisplayName({ username: null, display_name: "Normanby Red 77" })).toBe("Normanby Red 77");
});
