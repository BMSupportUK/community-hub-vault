// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { expect, test } from "bun:test";
import { moveTab, resolveInstallTabOrder } from "./install-guide-tab-order";

test("saved order is used and missing pills are appended", () => {
  const o = resolveInstallTabOrder(["guides", "bogus", "welcome"]);
  expect(o.slice(0, 3)).toEqual(["guides", "welcome", "setup"]);
  expect(o.length).toBe(8);
});

test("up/down arrows swap neighbours and stop at the ends", () => {
  const o = resolveInstallTabOrder(null);
  expect(moveTab(o, 1, -1).slice(0, 2)).toEqual(["setup", "welcome"]);
  expect(moveTab(o, 0, -1)).toBe(o);
  expect(moveTab(o, 7, 1)).toBe(o);
});
