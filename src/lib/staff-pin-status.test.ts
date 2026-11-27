// @ts-expect-error Bun supplies test types at runtime in this project.
import { expect, test } from "bun:test";
import { existingPinStatus } from "./staff-pin-status";

test("an existing staff PIN is recognised without revealing its hash", () => {
  expect(existingPinStatus({ user_id: "staff-user" }, null)).toBe(true);
});
test("a confirmed missing PIN is the only read that returns false", () => {
  expect(existingPinStatus(null, null)).toBe(false);
});
test("locked or failed PIN reads never report that a PIN needs creating", () => {
  expect(() => existingPinStatus(null, { code: "PT423" })).toThrow("Unable to check your existing PIN");
});