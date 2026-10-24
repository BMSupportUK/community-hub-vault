import { expect, test } from "bun:test";
import { shiftAlertSoundEvent } from "../src/lib/shift-alert-sound";

test("the still-working question plays its ended clip even after the ten-minute warning", () => {
  const end = Date.parse("2026-10-20T18:00:00Z");
  const warning = shiftAlertSoundEvent("today", "end", end, end - 600_000, false);
  const prompt = shiftAlertSoundEvent("today", "end", end, end, true);
  expect(warning?.tone).toBe("shift_end");
  expect(prompt?.tone).toBe("shift_over");
  expect(prompt?.key).not.toBe(warning?.key);
  const seen = new Set([warning?.key]);
  expect(seen.has(prompt?.key)).toBe(false);
  seen.add(prompt?.key);
  expect(seen.has(shiftAlertSoundEvent("today", "end", end, end + 1000, true)?.key)).toBe(true);
});

test("end sound waits for the visible question instead of being consumed in the background", () => {
  expect(shiftAlertSoundEvent("today", "end", 1000, 1000, false)).toBeNull();
  expect(shiftAlertSoundEvent("today", "end", 1000, 2000, true)?.tone).toBe("shift_over");
});
import { test as lateTest, expect as lateExpect } from "bun:test";
import { shiftAlertSoundEvent as lateEvent } from "../src/lib/shift-alert-sound";
lateTest("ending-soon warning is skipped in the final 2 minutes", () => {
  lateExpect(lateEvent("s", "end", 100_000, 0, false)).toBeNull();
  lateExpect(lateEvent("s", "end", 600_000, 0, false)?.tone).toBe("shift_end");
});
