// @ts-nocheck — tests run with bun test.
import { describe, expect, test } from "bun:test";
import { needsProfileChoice, pickActiveProfile, profileUsesStaffPortal, requestProfileChooser, saveActiveProfile, wasProfileChosen, selectedSubscription } from "./account-profiles";

const a = { id: "a" };
const b = { id: "b" };

describe("account profiles", () => {
  test("member card shows Coordinated4Audience rather than the original Wobbly8Garden login", () => {
    const rows = [{ id: "first", login: "Wobbly8Garden" }, { id: "second", login: "Coordinated4Audience" }];
    expect(selectedSubscription(rows, "second")?.login).toBe("Coordinated4Audience");
  });
  test("missing selected subscription never falls back to the original login", () => {
    expect(selectedSubscription([{ id: "first", login: "Wobbly8Garden" }], "second")).toBeNull();
  });
  test("switching reopens the chooser after a profile was already chosen", () => {
    const originals = { localStorage: globalThis.localStorage, sessionStorage: globalThis.sessionStorage, window: globalThis.window };
    const storage = () => { const values = new Map(); return { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: (k) => values.delete(k) }; };
    try {
      globalThis.localStorage = storage();
      globalThis.sessionStorage = storage();
      globalThis.window = { dispatchEvent: () => true };
      saveActiveProfile("owner", "b");
      expect(wasProfileChosen("owner")).toBe(true);
      requestProfileChooser("owner");
      expect(needsProfileChoice(2, wasProfileChosen("owner"))).toBe(true);
      expect(wasProfileChosen("other-owner")).toBe(false);
    } finally { Object.assign(globalThis, originals); }
  });
  test("staff primary profile opens staff portal", () => {
    expect(profileUsesStaffPortal(["admin"], { accountNumber: 1 })).toBe(true);
  });
  test("staff customer profile opens customer portal", () => {
    expect(profileUsesStaffPortal(["admin"], { accountNumber: 2 })).toBe(false);
  });
  test("customer primary profile cannot gain staff portal", () => {
    expect(profileUsesStaffPortal(["subscriber"], { accountNumber: 1 })).toBe(false);
  });
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
