import { test, expect } from "bun:test";
import { weakPin, hashPin, pinMatches, newSalt } from "../src/lib/player-pin";

test("refuses 0000, 1234, 4321 and non-4-digit PINs", () => {
  for (const p of ["0000", "1111", "1234", "4321", "7890", "123", "12345", "12a4"]) expect(weakPin(p)).toBe(true);
});

test("accepts an ordinary PIN", () => {
  expect(weakPin("4817")).toBe(false);
});

test("right PIN matches, wrong PIN does not", async () => {
  const salt = newSalt();
  const hash = await hashPin("4817", salt);
  expect(await pinMatches("4817", salt, hash)).toBe(true);
  expect(await pinMatches("4818", salt, hash)).toBe(false);
});
