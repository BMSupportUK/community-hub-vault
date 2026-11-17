// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { describe, expect, test } from "bun:test";
import { pickServer } from "./vpn-pick-server";
const s = (id, cc, cpu) => ({ id, name: "", country_code: cc, city: "", status: 1, visible: 1, cpu });
describe("best VPN server", () => {
  test("picks the UK server with the fewest of our customers", () => {
    expect(pickServer([s(1, "GB", 1), s(2, "GB", 9)], "GB", { 1: 5, 2: 1 })?.id).toBe(2);
  });
  test("uses the provider's lower load when customer counts match", () => {
    expect(pickServer([s(1, "GB", 9), s(2, "GB", 1)], "GB", { 1: 2, 2: 2 })?.id).toBe(2);
  });
});
