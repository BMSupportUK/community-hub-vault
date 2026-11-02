// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { expect, test } from "bun:test";
import {
  checkDeviceVpn,
  clearVpnCache,
  isPublicIp,
  needsVpnCheck,
  vpnStatusFromVerdict,
  VPN_CHECK_TTL_MS,
  VPN_RETRY_TTL_MS,
} from "./player-vpn";

const NOW = Date.parse("2026-11-02T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

test("private, loopback and CGNAT addresses are never looked up", () => {
  expect(isPublicIp("127.0.0.1")).toBe(false);
  expect(isPublicIp("10.1.2.3")).toBe(false);
  expect(isPublicIp("192.168.1.50")).toBe(false);
  expect(isPublicIp("172.16.0.9")).toBe(false);
  expect(isPublicIp("100.64.0.1")).toBe(false);
  expect(isPublicIp("::1")).toBe(false);
  expect(isPublicIp("fe80::1")).toBe(false);
  expect(isPublicIp(null)).toBe(false);
  expect(isPublicIp("80.6.105.43")).toBe(true);
  expect(isPublicIp("2a00:1410:9e:1234::1")).toBe(true);
});

test("a device with no verdict yet is checked, a private one never is", () => {
  expect(needsVpnCheck({ ip: "80.6.105.43", checkedAt: null, status: null, now: NOW })).toBe(true);
  expect(needsVpnCheck({ ip: "192.168.1.5", checkedAt: null, status: null, now: NOW })).toBe(false);
});

test("a fresh answer is kept until its 6-hour window closes", () => {
  expect(needsVpnCheck({ ip: "80.6.105.43", checkedAt: ago(60_000), status: "no", now: NOW })).toBe(false);
  expect(
    needsVpnCheck({ ip: "80.6.105.43", checkedAt: ago(VPN_CHECK_TTL_MS - 60_000), status: "yes", now: NOW }),
  ).toBe(false);
  expect(needsVpnCheck({ ip: "80.6.105.43", checkedAt: ago(VPN_CHECK_TTL_MS), status: "yes", now: NOW })).toBe(true);
});

test("an unknown verdict is retried after 10 minutes, not 6 hours", () => {
  expect(needsVpnCheck({ ip: "80.6.105.43", checkedAt: ago(VPN_RETRY_TTL_MS - 60_000), status: "unknown", now: NOW })).toBe(false);
  expect(needsVpnCheck({ ip: "80.6.105.43", checkedAt: ago(VPN_RETRY_TTL_MS), status: "unknown", now: NOW })).toBe(true);
});

test("proxy or VPN flags count as a VPN connection, a clean entry does not", () => {
  expect(vpnStatusFromVerdict(null)).toBe("unknown");
  expect(vpnStatusFromVerdict({ is_proxy: true, is_vpn: true })).toBe("yes");
  expect(vpnStatusFromVerdict({ is_proxy: true, is_vpn: false })).toBe("yes");
  expect(vpnStatusFromVerdict({ is_proxy: false, is_vpn: false })).toBe("no");
});

test("checkDeviceVpn caches per IP so repeated polls ask once", async () => {
  clearVpnCache();
  let calls = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any) => {
    calls++;
    return new Response(JSON.stringify({ status: "ok", "80.6.105.43": { proxy: "no", type: "Residential", provider: "Virgin Media Limited" } }), { status: 200 });
  }) as any;
  try {
    const a = await checkDeviceVpn("80.6.105.43");
    const b = await checkDeviceVpn("80.6.105.43");
    expect(a.vpn_status).toBe("no");
    expect(b.vpn_status).toBe("no");
    expect(a.vpn_provider).toBe("Virgin Media Limited");
    // One clean answer: proxycheck, then the ipapi.is confirmation — nothing more.
    expect(calls).toBe(2);
    expect(a.vpn_checked_at).toBeTruthy();
  } finally {
    globalThis.fetch = realFetch;
    clearVpnCache();
  }
});
