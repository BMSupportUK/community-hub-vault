import { test, expect } from "bun:test";
import { vpnRoomVerdict } from "../src/lib/vpn-addon";

test("single package: one VPN, second device must move it", () => expect(vpnRoomVerdict({ here: false, held: 1, slots: 1, rooms: 1 })).toBe("full"));
test("Multi Room can buy a second VPN", () => expect(vpnRoomVerdict({ here: false, held: 1, slots: 1, rooms: 2 })).toBe("buy"));
test("Multi Room with 2 VPNs in use cannot buy a third", () => expect(vpnRoomVerdict({ here: false, held: 2, slots: 2, rooms: 2 })).toBe("full"));
test("Triple Room can buy a third VPN", () => expect(vpnRoomVerdict({ here: false, held: 2, slots: 2, rooms: 3 })).toBe("buy"));
test("an unused bought VPN is offered before buying another", () => expect(vpnRoomVerdict({ here: false, held: 1, slots: 2, rooms: 3 })).toBe("spare"));
