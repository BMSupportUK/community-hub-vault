import { expect, test } from "bun:test";
import { broadbandFields, hasBroadbandTest } from "../src/lib/player-network-test";
test("traffic estimates never become broadband results", () => {
  expect(broadbandFields(undefined, 1000)).toBeNull();
  expect(broadbandFields({ down: 5000, up: 10, measured_at: 1000, method: "traffic" }, 1000)).toBeNull();
  expect(hasBroadbandTest("firetv", "5.34")).toBe(false);
  expect(hasBroadbandTest("windows", "0.4.101")).toBe(false);
  expect(hasBroadbandTest("mac", "0.1.104")).toBe(false);
  expect(hasBroadbandTest("firetv", "5.35")).toBe(true);
  expect(hasBroadbandTest("windows", "0.4.102")).toBe(true);
  expect(hasBroadbandTest("mac", "0.1.105")).toBe(true);
});
test("real test timestamp is retained, not replaced with check-in time", () => {
  expect(broadbandFields({ down: 100000, up: 20000, measured_at: 1000, method: "cloudflare-adaptive-v1" }, 2000)).toEqual({ net_down_kbps: 100000, net_up_kbps: 20000, net_measured_at: new Date(1000).toISOString() });
});
test("failed, stale and future tests cannot overwrite results", () => {
  const t = { down: 100000, up: 20000, measured_at: 1000, method: "cloudflare-adaptive-v1" };
  expect(broadbandFields({ ...t, up: 0 }, 2000)).toBeNull();
  expect(broadbandFields(t, 1000 + 24 * 3600_000 + 1)).toBeNull();
  expect(broadbandFields({ ...t, measured_at: 62001 }, 1000)).toBeNull();
});