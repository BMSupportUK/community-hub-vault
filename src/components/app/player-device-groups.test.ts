import { describe, expect, test } from "bun:test";
import { groupDevicesByPlace, isDeviceOn } from "./player-device-groups";

describe("linked box grouping", () => {
  test("groups by house before the dash", () => {
    const g = groupDevicesByPlace([{ nickname: "Mum's house - living room" }, { nickname: "Mum's house - bedroom" }, { nickname: null }]);
    expect(g.map((x) => [x.place, x.devices.length])).toEqual([["Mum's house", 2], ["Unnamed boxes", 1]]);
  });
  test("On only within 3 minutes", () => {
    const now = Date.parse("2026-11-09T15:00:00Z");
    expect(isDeviceOn("2026-11-09T14:58:00Z", now)).toBe(true);
    expect(isDeviceOn("2026-11-09T14:56:00Z", now)).toBe(false);
  });
});
