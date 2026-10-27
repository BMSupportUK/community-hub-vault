// @ts-nocheck — tests run with bun test.
import { expect, test } from "bun:test";
import { encryptPin, decryptPin } from "./enabler-pin-crypto.server";

test("stored display restores the exact same six-digit PIN", async () => {
  const secret = "test-only-encryption-key";
  const stored = await encryptPin("001234", secret);
  expect(stored).not.toContain("001234");
  expect(await decryptPin(stored, secret)).toBe("001234");
  await expect(decryptPin(stored, "different-test-key")).rejects.toThrow();
});