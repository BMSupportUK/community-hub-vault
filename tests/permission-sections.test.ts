import { expect, test } from "bun:test";
import { permissionSection } from "../src/lib/permission-sections";

test("Fan Zone pages go to the Boro Fan Zone tab", () => {
  for (const k of ["forum", "admin-fan-zone", "fan-zone-appeals", "admin-fantasy-scoring", "admin-boro-team-sheet", "admin-predictions"])
    expect(permissionSection(k)).toBe("fanzone");
});

test("BM Support pages stay in the BM Support tab", () => {
  for (const k of ["home", "tickets", "admin-shifts", "inbox", "shop"]) expect(permissionSection(k)).toBe("bm");
});
