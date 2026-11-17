// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { describe, expect, test } from "bun:test";
import { pickServer, serverTrafficList, vpnHomeCountry } from "./vpn-pick-server";
const s = (id, cc, cpu) => ({ id, name: "", country_code: cc, city: "", status: 1, visible: 1, cpu });
test("server list puts lowest raw traffic first and keeps unknown readings last", () => {
  const rows = serverTrafficList([s(1,"GB",900000000),s(2,"BE",180000000),s(3,"NL",undefined)]);
  expect(rows.map(r=>r.id)).toEqual([2,1,3]);
  expect(rows[0].traffic).toBe(180000000);
  expect(rows[0].traffic_bar).toBe(20);
  expect(rows[1].traffic_bar).toBe(100);
  expect(rows[2].traffic).toBeNull();
});
describe("best VPN server", () => {
  test("picks the UK server with the least traffic", () => {
    expect(pickServer([s(1, "GB", 1546468705.0268512), s(2, "GB", 187040866.22304505)], "GB", { 1: 0, 2: 5 })?.id).toBe(2);
  });
  test("stays in the box's own country before a quieter abroad one", () => {
    expect(pickServer([s(1, "NL", 6), s(2, "GB", 9)], "GB")?.id).toBe(2);
  });
  test("equal traffic: fewest of our customers wins", () => {
    expect(pickServer([s(1, "GB", 3), s(2, "GB", 3)], "GB", { 1: 4, 2: 1 })?.id).toBe(2);
  });
  test("unknown load never counts as an empty server", () => {
    expect(pickServer([s(1, "GB", undefined), s(2, "GB", 187040866.22304505)], "GB")?.id).toBe(2);
  });
  test("invalid nearby load never pulls a customer abroad", () => {
    expect(pickServer([s(1, "GB", 1546468705.0268512), s(2, "BE", NaN)], "GB")?.id).toBe(1);
  });
});
describe("busy UK servers", () => {
  test("a UK box stays in the UK even when Brussels is much quieter", () => {
    expect(pickServer([s(1, "GB", 451e6), s(2, "BE", 188e6)], "GB")?.id).toBe(1);
  });
  test("raw UK 451e6 vs Berlin 368e6 (more than half): stays in the UK", () => {
    expect(pickServer([s(1, "GB", 451e6), s(2, "DE", 368e6)], "GB")?.id).toBe(1);
  });
  test("never jumps to a far-away country", () => {
    expect(pickServer([s(1, "GB", 900e6), s(2, "US", 1)], "GB")?.id).toBe(1);
  });
});

test("box server list puts home country first, nearby next, far-away servers last", () => {
  const rows = serverTrafficList([s(1,"SE",1000),s(2,"GB",900000000),s(3,"NL",5000),s(4,"GB",800000000)], "GB");
  expect(rows.map(r=>r.id)).toEqual([4,2,3,1]);
});

test("a box seen through the VPN exit country still counts as UK", () => {
  expect(vpnHomeCountry({ geo_country: "SE", vpn_status: "yes" })).toBe("GB");
  expect(vpnHomeCountry({ geo_country: "IE", vpn_status: "no" })).toBe("IE");
});

test("overseas: a box in Spain is offered Spain, then nearby Portugal/France, before the UK", async () => {
  const { serverTrafficList } = await import("./vpn-pick-server");
  const s = (id: number, cc: string, cpu: number) => ({ id, name: cc, country_code: cc, city: cc, status: 1, visible: 1, cpu });
  const order = serverTrafficList([s(1, "GB", 1), s(2, "ES", 9), s(3, "PT", 5), s(4, "US", 0)], "ES").map(r => r.country);
  expect(order).toEqual(["ES", "PT", "GB", "US"]);
});

test("overseas: Australia with no local server uses its nearest countries, not the UK", async () => {
  const { pickServer } = await import("./vpn-pick-server");
  const s = (id: number, cc: string, cpu: number) => ({ id, name: cc, country_code: cc, city: cc, status: 1, visible: 1, cpu });
  expect(pickServer([s(1, "GB", 1), s(2, "SG", 50), s(3, "NZ", 40)], "AU")?.country_code).toBe("NZ");
});

test("home country saved with the VPN off wins over the VPN exit", async () => {
  const { vpnHomeCountry } = await import("./vpn-pick-server");
  expect(vpnHomeCountry({ home_country: "es", geo_country: "GB", vpn_status: "yes" })).toBe("ES");
});
