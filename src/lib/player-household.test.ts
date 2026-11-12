// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { expect, test } from "bun:test";
import { householdVerdict, shouldBlock } from "./player-household";
const base = { connections: 2, deviceId: "me", homeIp: "1.1.1.1", ip: "1.1.1.1", mobile: false, vpn: false, lastAway: false, mobileDeviceId: null, blockedAway: false, watching: [], otherBoxIps: [] };
test("same home internet is fine", () => expect(householdVerdict(base).kind).toBe("ok"));
test("IPv6 TVs on the same /64 can watch together without a strike", () => {
  const v = householdVerdict({ ...base, homeIp: "2a00:1234:5678:abcd::1", ip: "2a00:1234:5678:abcd:abcd:1234:5678:9999", watching: [{ id: "home", away: false, mobile: false }] });
  expect(v.kind).toBe("ok"); expect(v.away).toBe(false); expect(v.strike).toBe(false);
});
test("rotated IPv6 address remains home even when away playback is blocked", () => {
  const v = householdVerdict({ ...base, homeIp: "2A00:1234:0:1::1", ip: "2a00:1234:0000:0001:0:0:2:3", blockedAway: true });
  expect(v.kind).toBe("ok"); expect(v.refuse).toBe(false); expect(v.away).toBe(false);
});
test("a different IPv6 /64 still causes an away-use strike", () => {
  const v = householdVerdict({ ...base, homeIp: "2a00:1234:5678:abcd::1", ip: "2a00:1234:5678:abce::2", watching: [{ id: "home", away: false, mobile: false }] });
  expect(v.kind).toBe("two_places"); expect(v.strike).toBe(true);
});
test("IPv6 boxes moving to the same new /64 move home together", () => {
  const v = householdVerdict({ ...base, homeIp: "2a00:1234:5678:abcd::1", ip: "2a00:1234:5678:ffff::2", otherBoxIps: ["2a00:1234:5678:ffff::3", "2a00:1234:5678:ffff::4"] });
  expect(v.newHome).toBe("2a00:1234:5678:ffff::2"); expect(v.away).toBe(false);
});
test("saved false-away IPv6 peer does not stop a home TV", () => {
  const v = householdVerdict({ ...base, homeIp: "2a00:1234:5678:abcd::1", ip: "2a00:1234:5678:abcd::2", watching: [{ id: "peer", away: true, mobile: false, ip: "2a00:1234:5678:abcd::3" }] });
  expect(v.kind).toBe("ok"); expect(v.stopIds).toEqual([]);
});
test("IPv4 addresses are not grouped by prefix", () => {
  const v = householdVerdict({ ...base, homeIp: "80.6.105.43", ip: "80.6.105.44", watching: [{ id: "home", away: false, mobile: false }] });
  expect(v.kind).toBe("two_places"); expect(v.strike).toBe(true);
});
test("IPv4-mapped IPv6 does not group different IPv4 homes", () => {
  const v = householdVerdict({ ...base, homeIp: "::ffff:80.6.105.43", ip: "::ffff:80.6.105.44", watching: [{ id: "home", away: false, mobile: false }] });
  expect(v.kind).toBe("two_places"); expect(v.strike).toBe(true);
});
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
