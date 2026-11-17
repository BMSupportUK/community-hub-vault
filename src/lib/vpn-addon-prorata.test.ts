// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { expect, test } from "bun:test";
import { vpnProRata, vpnCostPence, vpnLineDays, vpnAppLineName } from "./vpn-addon";
const now = Date.UTC(2026, 10, 17, 12);
const inDays = (d: number) => new Date(now + d * 864e5).toISOString();
test("30 days left costs £1.97 (£2 a month by the day)", () => expect(vpnProRata(inDays(30), now)?.pence).toBe(197));
test("a year left costs about £24", () => expect(vpnProRata(inDays(365), now)?.pence).toBe(2398));
test("part months are charged by the day: 2 months 15 days ≈ £5", () => expect(vpnProRata(inDays(76), now)?.pence).toBe(499));
test("a part day counts as a day", () => expect(vpnProRata(inDays(10.2), now)?.days).toBe(11));
test("ends on the subscription's own end date", () => expect(vpnProRata(inDays(40), now)?.until).toBe(inDays(40)));
test("nothing to buy once the subscription has ended", () => expect(vpnProRata(inDays(-1), now)).toBeNull());
test("nothing to buy without an end date", () => expect(vpnProRata(null, now)).toBeNull());
test("cost for a month at £1.57 is £1.57", () => expect(vpnCostPence(30.4375, 157)).toBe(157));
test("app lines read back their days", () => expect(vpnLineDays(vpnAppLineName(76), 1)).toBe(76));
