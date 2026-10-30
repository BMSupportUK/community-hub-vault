// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { expect, test } from "bun:test";
import { DIRECT_PIN_TTL_MS, pinKindForApp } from "./direct-install";
test("Direct Install PIN lasts 30 minutes", () => { expect(DIRECT_PIN_TTL_MS).toBe(30 * 60 * 1000); });
test("Direct Install signs in only with its own PINs", () => {
  expect(pinKindForApp("direct-1.6")).toBe("direct");
  expect(pinKindForApp("phone-1.71")).toBe("enabler");
  expect(pinKindForApp(undefined)).toBe("enabler");
});
