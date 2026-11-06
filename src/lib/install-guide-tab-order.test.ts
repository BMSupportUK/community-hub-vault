// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { expect, test } from "bun:test";
import { moveTab, resolveInstallTabOrder } from "./install-guide-tab-order";

test("saved order is used and missing pills are appended", () => {
  const o = resolveInstallTabOrder(["guides", "bogus", "welcome"]);
  expect(o.slice(0, 3)).toEqual(["guides", "welcome", "setup"]);
  expect(o.length).toBe(9);
});

test("phone and Windows setup remains hidden even in a saved order", () => {
  expect(resolveInstallTabOrder(["phone-windows-setup", "welcome"])).not.toContain("phone-windows-setup");
});

test("staff help remains available when an older saved order omits it", () => {
  expect(resolveInstallTabOrder(["welcome", "setup", "guides"])).toContain("staff-help");
});

test("up/down arrows swap neighbours and stop at the ends", () => {
  const o = resolveInstallTabOrder(null);
  expect(moveTab(o, 1, -1).slice(0, 2)).toEqual(["setup", "welcome"]);
  expect(moveTab(o, 0, -1)).toBe(o);
  expect(moveTab(o, o.length - 1, 1)).toBe(o);
});

import { installTabLabel, resolveInstallTabLabels } from "./install-guide-tab-order";
test("Backup Apps follows Link Device in defaults and older saved orders", () => {
  for (const saved of [null, ["guides", "link-device", "welcome", "setup"]]) {
    const order = resolveInstallTabOrder(saved);
    expect(order[order.indexOf("link-device") + 1]).toBe("backup-apps");
  }
});
test("custom pill name replaces default; blank falls back", () => {
  const l = resolveInstallTabLabels({ welcome: " Start here ", guides: "  ", bogus: "x" });
  expect(installTabLabel("welcome", l)).toBe("Start here");
  expect(installTabLabel("guides", l)).toBe("Guides");
  expect("bogus" in l).toBe(false);
});
