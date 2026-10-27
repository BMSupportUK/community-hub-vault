// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { describe, expect, test } from "bun:test";
import { downloadSourceLabel, isNewDownload } from "./download-log";

describe("download log", () => {
  test("a plain GET is a new download", () => expect(isNewDownload("GET", null)).toBe(true));
  test("a range from byte 0 is a new download", () => expect(isNewDownload("GET", "bytes=0-")).toBe(true));
  test("a resumed range is not logged again", () => expect(isNewDownload("GET", "bytes=5000-")).toBe(false));
  test("HEAD probes are not downloads", () => expect(isNewDownload("HEAD", null)).toBe(false));
  test("Enabler installs on a TV get their own label", () => expect(downloadSourceLabel("tv_install")).toBe("Installed on TV by Enabler"));
});
