import { test, expect } from "bun:test";
import { normalizeEarlyFinishReason } from "../src/lib/shift-finish";

test("an early finish request cannot be sent without a reason", () => {
  expect(normalizeEarlyFinishReason("")).toBeNull();
  expect(normalizeEarlyFinishReason("   ")).toBeNull();
  expect(normalizeEarlyFinishReason("\n\t ")).toBeNull();
  expect(normalizeEarlyFinishReason(null)).toBeNull();
  expect(normalizeEarlyFinishReason(undefined)).toBeNull();
});

test("a written reason is kept for admin and management to read", () => {
  expect(normalizeEarlyFinishReason("  Feeling unwell  ")).toBe("Feeling unwell");
  expect(normalizeEarlyFinishReason("Home\nemergency")).toBe("Home emergency");
});

test("a long reason is capped rather than rejected", () => {
  expect(normalizeEarlyFinishReason("a".repeat(500))).toHaveLength(300);
});
