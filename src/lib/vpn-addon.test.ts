// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { describe, expect, test } from "bun:test";
import { vpnAddonMonths, vpnAddonPence, vpnAddonLineName } from "./vpn-addon";

describe("VPN add-on price", () => {
  test("£2 a month: 1 month is £2", () => expect(vpnAddonPence(vpnAddonMonths([{ name: "Single 1 Month", qty: 1 }]))).toBe(200));
  test("6 months is £12", () => expect(vpnAddonPence(vpnAddonMonths([{ name: "Single 6 Months", qty: 1 }]))).toBe(1200));
  test("12 months is £24", () => expect(vpnAddonPence(vpnAddonMonths([{ name: "Single 12 Months", qty: 1 }]))).toBe(2400));
  test("Multi Room 12 months is also £24", () => expect(vpnAddonPence(vpnAddonMonths([{ name: "Multi Room 12 Months", qty: 1 }]))).toBe(2400));
  test("an existing VPN line never counts twice", () => expect(vpnAddonMonths([{ name: "Single 6 Months", qty: 1 }, { name: vpnAddonLineName(6), qty: 6 }])).toBe(6));
});

test("real shop names: 12 Months | Triple Room adds £24", () =>
  expect(vpnAddonPence(vpnAddonMonths([{ name: "BM Support Digital Service 12 Months | Triple Room", qty: 1 }]))).toBe(2400));
