// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { expect, test } from "bun:test";
import { householdVerdict } from "./player-household";
const base = { connections: 2, homeIp: "1.1.1.1", ip: "1.1.1.1", mobile: false, vpn: false, otherMobileWatching: 0 };
test("same home internet is fine", () => expect(householdVerdict(base).kind).toBe("ok"));
test("first box linked sets the home", () => expect(householdVerdict({ ...base, homeIp: null, ip: "2.2.2.2" }).setHome).toBe(true));
test("box at a different house is warned and reported", () => expect(householdVerdict({ ...base, ip: "3.3.3.3" }).kind).toBe("other_house"));
test("one phone on mobile data is allowed", () => expect(householdVerdict({ ...base, ip: "4.4.4.4", mobile: true }).kind).toBe("ok"));
test("a second phone on mobile data is warned", () => expect(householdVerdict({ ...base, ip: "5.5.5.5", mobile: true, otherMobileWatching: 1 }).kind).toBe("second_mobile"));
test("VPN is reported to admins without a warning", () => { const v = householdVerdict({ ...base, ip: "6.6.6.6", vpn: true }); expect(v.kind).toBe("vpn"); expect(v.warn).toBeNull(); });
test("single logins are never checked", () => expect(householdVerdict({ ...base, connections: 1, ip: "7.7.7.7" }).kind).toBe("ok"));
