// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { describe, expect, it } from "bun:test";
import { isSafePublicUrl } from "./safe-public-url";

describe("link preview only fetches public addresses", () => {
  it("allows ordinary public sites", () => {
    expect(isSafePublicUrl("https://www.bbc.co.uk/sport")).toBe(true);
    expect(isSafePublicUrl("http://8.8.8.8/")).toBe(true);
  });
  it("blocks private and internal addresses", () => {
    for (const u of ["http://localhost/", "http://127.0.0.1/", "http://10.0.0.5/", "http://192.168.1.1/",
      "http://172.20.0.1/", "http://169.254.169.254/latest/meta-data", "http://[::1]/", "http://[fd00::1]/",
      "http://[::ffff:127.0.0.1]/", "http://intranet/", "http://printer.local/", "http://2130706433/",
      "http://0x7f000001/", "https://example.com:8443/", "ftp://example.com/", "http://user:pw@example.com/"]) {
      expect(isSafePublicUrl(u), u).toBe(false);
    }
  });
});
