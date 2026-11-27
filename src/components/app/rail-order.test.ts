// @ts-nocheck — tests run with bun test.
import { expect, test } from "bun:test";
import { railOrderRows, sortRailItems } from "./rail-order";

test("staff and user rail orders remain separate", () => {
  expect(railOrderRows("staff", ["portal:/tickets"])).toEqual([{ key: "rail:staff:portal:/tickets", sort_order: 10 }]);
  expect(railOrderRows("member", ["portal:/tickets"])).toEqual([{ key: "rail:member:portal:/tickets", sort_order: 10 }]);
});
test("the stored order is restored instead of the default sequence", () => {
  const rows = railOrderRows("member", ["shop", "home"]);
  const saved = Object.fromEntries(rows.map(row => [row.key, row.sort_order]));
  expect(sortRailItems(["home", "shop"], saved, "member", i => i)).toEqual(["shop", "home"]);
  expect(sortRailItems(["home", "shop"], saved, "staff", i => i)).toEqual(["home", "shop"]);
});test("staff rail groups keep shifts together and community last", () => {
  const { staffRailGroup } = require("./rail-order");
  expect(staffRailGroup("portal:/tickets")).toBe(0);
  expect(staffRailGroup("portal:my-shift")).toBe(1);
  expect(staffRailGroup("portal:admin-customers")).toBe(2);
  expect(staffRailGroup("portal:admin-orders")).toBe(3);
  expect(staffRailGroup("/forum")).toBe(4);
});
test("customer rail puts Shop and Download App & Install guides at the top", () => {
  const { memberRailGroup, RAIL_EDITOR_ITEMS } = require("./rail-order");
  // Both pages sit in the first rail group, so they render straight under Home.
  expect(memberRailGroup("portal:/shop")).toBe(0);
  expect(memberRailGroup("portal:/install-guides")).toBe(0);
  // Owner Tools can reorder them with the rest of the customer rail.
  const ids = RAIL_EDITOR_ITEMS.member.map((i) => i.id);
  expect(ids).toContain("portal:/shop");
  expect(ids).toContain("portal:/install-guides");
  expect(ids.indexOf("portal:/shop")).toBeLessThan(ids.indexOf("portal:/tickets"));
  expect(ids.indexOf("portal:/install-guides")).toBeLessThan(ids.indexOf("portal:/tickets"));
});
