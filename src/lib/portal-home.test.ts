// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { describe, expect, test } from "bun:test";
import { portalHomePath } from "./portal-home";

describe("portalHomePath", () => {
  test("staff roles land on the Staff Portal", () => {
    for (const r of ["admin", "management", "staff", "moderator"]) expect(portalHomePath([r])).toBe("/staff-portal");
  });
  test("members land on the Customer Portal", () => {
    expect(portalHomePath(["member"])).toBe("/portal");
    expect(portalHomePath([])).toBe("/portal");
  });
});
