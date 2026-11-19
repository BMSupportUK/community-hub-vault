import { describe, expect, it } from "bun:test";
import { panelPackageId } from "../src/lib/provider-panel-packages";

describe("provider panel package choice", () => {
  it("no adult content picks the plain package", () => expect(panelPackageId(12, "single", false)).toBe(98));
  it("adult content picks the XXX package", () => expect(panelPackageId(12, "single", true)).toBe(99));
  it("multi room 6 months without adult", () => expect(panelPackageId(6, "multi", false)).toBe(90));
  it("triple room 1 month with adult", () => expect(panelPackageId(1, "triple", true)).toBe(73));
  it("unknown length returns nothing", () => expect(panelPackageId(2, "single", false)).toBeNull());
});
