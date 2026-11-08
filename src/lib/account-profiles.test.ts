import { describe, expect, test } from "bun:test";
import { needsProfileChoice, pickActiveProfile } from "./account-profiles";

const a = { id: "a" };
const b = { id: "b" };

describe("account profiles", () => {
  test("saved profile is shown when it still exists", () => {
    expect(pickActiveProfile([a, b], "b")).toBe(b);
  });
  test("falls back to the first login when the saved one is gone", () => {
    expect(pickActiveProfile([a, b], "gone")).toBe(a);
  });
  test("chooser only opens with two or more logins", () => {
    expect(needsProfileChoice(1, false)).toBe(false);
    expect(needsProfileChoice(2, false)).toBe(true);
    expect(needsProfileChoice(2, true)).toBe(false);
  });
});
