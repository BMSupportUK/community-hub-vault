import { describe, expect, test } from "bun:test";
import { hostFromTemplate, pickBestServer } from "../src/lib/vpn-picker";

describe("VPN best server", () => {
  const servers = [
    { host: "uk-lon-busy", cc: "GB", city: "London", load: 80 },
    { host: "uk-man-quiet", cc: "GB", city: "Manchester", load: 10 },
    { host: "uk-man-busy", cc: "GB", city: "Manchester", load: 60 },
    { host: "nl-quiet", cc: "NL", city: "Amsterdam", load: 1 },
  ];
  test("picks the customer's own city with the fewest connections", () => {
    expect(pickBestServer(servers, { cc: "gb", city: "manchester" })?.host).toBe("uk-man-quiet");
  });
  test("closer beats quieter: same country wins over a quiet server abroad", () => {
    expect(pickBestServer(servers, { cc: "GB", city: "Middlesbrough" })?.host).toBe("uk-man-quiet");
  });
  test("unknown area falls back to the lowest load anywhere", () => {
    expect(pickBestServer(servers, {})?.host).toBe("nl-quiet");
  });
  test("templates use the customer's country", () => {
    expect(hostFromTemplate("{cc}.windscribe.com", { cc: "IE" })).toBe("ie.windscribe.com");
  });
});

import { checkWgFile, wgConfig } from "../src/lib/vpn-picker";
describe("WireGuard files", () => {
  const key = "a".repeat(43) + "=";
  test("built setup sends all traffic through the chosen server", () => {
    const c = wgConfig({ privateKey: key, address: "10.5.0.2/32", dns: "103.86.96.100", publicKey: key, endpoint: "uk1.example:51820" });
    expect(c).toContain("AllowedIPs = 0.0.0.0/0");
    expect(c).toContain("Endpoint = uk1.example:51820");
  });
  test("a pasted file needs a private key and server", () => {
    expect(checkWgFile(`[Interface]\nPrivateKey = ${key}\n[Peer]\nPublicKey = ${key}\nEndpoint = uk-lon.example.net:51820`)).toEqual({ ok: true, server: "uk-lon.example.net" });
    expect(checkWgFile("username: bob").ok).toBe(false);
  });
});
