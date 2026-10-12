import { test, expect } from "bun:test";
import { BREAK_LIMITS, breakLabel, type BreakKind } from "../src/lib/breaks";

test("travelling home is no longer a break kind", () => {
  const kinds: BreakKind[] = ["break", "lunch"];
  expect(kinds.map(breakLabel)).toEqual(["Break", "Main break"]);
});

test("historical travelling-home rows still calculate", () => {
  expect(BREAK_LIMITS.travel).toBe(60 * 60);
});
