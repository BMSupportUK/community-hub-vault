// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { describe, expect, test } from "bun:test";
import { pickServer } from "./vpn-pick-server";
const s = (id, cc, cpu) => ({ id, name: "", country_code: cc, city: "", status: 1, visible: 1, cpu });
describe("best VPN server", () => {
  test("picks the UK server with the least traffic", () => {
    expect(pickServer([s(1, "GB", 9), s(2, "GB", 1)], "GB", { 1: 0, 2: 5 })?.id).toBe(2);
  });
  test("stays in the box's own country before a quieter abroad one", () => {
    expect(pickServer([s(1, "NL", 1), s(2, "GB", 9)], "GB")?.id).toBe(2);
  });
  test("equal traffic: fewest of our customers wins", () => {
    expect(pickServer([s(1, "GB", 3), s(2, "GB", 3)], "GB", { 1: 4, 2: 1 })?.id).toBe(2);
  });
});
describe("busy UK servers", () => {
  test("UK busy (80) and Netherlands quiet (30): uses the Netherlands", () => {
    expect(pickServer([s(1, "GB", 80), s(2, "NL", 30)], "GB")?.id).toBe(2);
  });
  test("UK busy (80) but nearby only slightly quieter (70): stays in the UK", () => {
    expect(pickServer([s(1, "GB", 80), s(2, "NL", 70)], "GB")?.id).toBe(1);
  });
  test("UK not busy (50): stays in the UK even if abroad is quieter", () => {
    expect(pickServer([s(1, "GB", 50), s(2, "NL", 5)], "GB")?.id).toBe(1);
  });
  test("never jumps to a far-away country", () => {
    expect(pickServer([s(1, "GB", 95), s(2, "US", 1)], "GB")?.id).toBe(1);
  });
});
