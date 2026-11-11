// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { expect, test } from "bun:test";
import { householdVerdict, shouldBlock } from "./player-household";
const base = { connections: 2, deviceId: "me", homeIp: "1.1.1.1", ip: "1.1.1.1", mobile: false, vpn: false, lastAway: false, mobileDeviceId: null, blockedAway: false, watching: [], otherBoxIps: [] };
test("same home internet is fine", () => expect(householdVerdict(base).kind).toBe("ok"));
test("first box linked sets the home", () => expect(householdVerdict({ ...base, homeIp: null, ip: "2.2.2.2" }).setHome).toBe(true));
test("single logins are never checked", () => expect(householdVerdict({ ...base, connections: 1, ip: "7.7.7.7", watching: [{ id: "x", away: false, mobile: false }] }).kind).toBe("ok"));
test("holiday box can watch when nothing else is", () => { const v = householdVerdict({ ...base, ip: "3.3.3.3" }); expect(v.kind).toBe("ok"); expect(v.away).toBe(true); });
test("home box waits while a holiday box watches", () => { const v = householdVerdict({ ...base, watching: [{ id: "hol", away: true, mobile: false }] }); expect(v.kind).toBe("home_waits"); expect(v.stopIds).toEqual(["hol"]); });
test("away box while home watches is a strike", () => { const v = householdVerdict({ ...base, ip: "3.3.3.3", watching: [{ id: "h", away: false, mobile: false }] }); expect(v.kind).toBe("two_places"); expect(v.strike).toBe(true); });
test("only one device away from home at a time", () => expect(householdVerdict({ ...base, ip: "3.3.3.3", watching: [{ id: "p", away: true, mobile: true }] }).kind).toBe("away_slot"));
test("phone on mobile data can watch alongside home", () => expect(householdVerdict({ ...base, ip: "4.4.4.4", mobile: true, watching: [{ id: "h", away: false, mobile: false }] }).kind).toBe("ok"));
test("a second phone is refused", () => { const v = householdVerdict({ ...base, ip: "5.5.5.5", mobile: true, mobileDeviceId: "other" }); expect(v.kind).toBe("second_mobile"); expect(v.refuse).toBe(true); });
test("VPN is allowed and keeps the last location", () => { const v = householdVerdict({ ...base, ip: "6.6.6.6", vpn: true }); expect(v.kind).toBe("ok"); expect(v.away).toBe(false); });
test("blocked login can't play away from home", () => expect(householdVerdict({ ...base, ip: "3.3.3.3", blockedAway: true }).kind).toBe("blocked"));
test("all boxes moving together moves home", () => { const v = householdVerdict({ ...base, ip: "9.9.9.9", otherBoxIps: ["9.9.9.9", "9.9.9.9"] }); expect(v.newHome).toBe("9.9.9.9"); expect(v.away).toBe(false); });
test("3 strikes in 7 days blocks", () => { expect(shouldBlock(2)).toBe(false); expect(shouldBlock(3)).toBe(true); });
import { boxAllowance } from "./player-security";
test("Multi Room allows 2 boxes + 1 phone, Triple 3 + 1", () => { expect(boxAllowance(2)).toBe(3); expect(boxAllowance(3)).toBe(4); });
