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
});