import { describe, expect, test } from "bun:test";
import { backoffMs, catchupUrl, isAppleMobile, liveUrl, playableVod } from "../src/lib/player-web";

describe("web player device check", () => {
  test("iPhone and iPad are allowed", () => {
    expect(isAppleMobile("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", 5)).toBe(true);
    expect(isAppleMobile("Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)", 5)).toBe(true);
  });
  test("iPad reporting as a Mac is allowed, a real Mac is not", () => {
    expect(isAppleMobile("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe(true);
    expect(isAppleMobile("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe(false);
  });
  test("Windows and Android are not", () => {
    expect(isAppleMobile("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", 0)).toBe(false);
    expect(isAppleMobile("Mozilla/5.0 (Linux; Android 14)", 5)).toBe(false);
  });
});

describe("web player formats", () => {
  test("only mp4, m4v and mov films/episodes are shown", () => {
    expect(playableVod("mp4")).toBe(true);
    expect(playableVod("MOV")).toBe(true);
    expect(playableVod("m4v")).toBe(true);
    expect(playableVod("mkv")).toBe(false);
    expect(playableVod("avi")).toBe(false);
    expect(playableVod("")).toBe(false);
  });
  test("live and catch up are always m3u8", () => {
    expect(liveUrl("https://p.example:443/", "u", "p", "12")).toBe("https://p.example:443/live/u/p/12.m3u8");
    // 1 Jul 2026 18:00 UTC is 19:00 UK time (BST)
    const s = Date.UTC(2026, 6, 1, 18, 0);
    expect(catchupUrl("https://p.example", "u", "p", "7", s, s + 90 * 60_000)).toBe("https://p.example/timeshift/u/p/90/2026-07-01:19-00/7.m3u8");
  });
  test("reconnect waits 1, 2, 4, 8 then 10 seconds", () => {
    expect([0, 1, 2, 3, 4, 5].map(backoffMs)).toEqual([1000, 2000, 4000, 8000, 10000, 10000]);
  });
});
