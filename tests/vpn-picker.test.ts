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
