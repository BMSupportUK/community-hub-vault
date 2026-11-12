// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { expect, test } from "bun:test";
import { DIRECT_PIN_EXPIRES_AT, pinKindForApp } from "./direct-install";
import { pinUsable } from "./enabler-pin";
test("Direct Install PIN stays valid beyond three hours until All done", () => { expect(pinUsable({ expires_at: DIRECT_PIN_EXPIRES_AT, revoked_at: null }, Date.parse("2026-11-13T08:00:00Z"))).toBe(true); });
test("All done revocation stops the Direct Install PIN", () => { expect(pinUsable({ expires_at: DIRECT_PIN_EXPIRES_AT, revoked_at: "2026-11-12T09:00:00Z" }, Date.parse("2026-11-12T09:00:01Z"))).toBe(false); });
test("Direct Install signs in only with its own PINs", () => {
  expect(pinKindForApp("direct-1.6")).toBe("direct");
  expect(pinKindForApp("phone-1.71")).toBe("enabler");
  expect(pinKindForApp(undefined)).toBe("enabler");
});
