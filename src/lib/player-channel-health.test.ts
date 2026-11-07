// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { describe, expect, test } from "bun:test";
import { channelStatus, crossedChannels, isCrossed, tsVideoPackets } from "./player-channel-health";

const now = Date.parse("2026-11-07T15:00:00Z");
const ago = (min: number) => new Date(now - min * 60_000).toISOString();

describe("channel cross rules", () => {
  test("a problem 14 minutes ago still shows a cross", () => {
    expect(isCrossed({ last_problem_at: ago(14), last_ok_at: null }, now)).toBe(true);
  });
  test("a problem 16 minutes ago no longer shows a cross", () => {
    expect(isCrossed({ last_problem_at: ago(16), last_ok_at: null }, now)).toBe(false);
  });
  test("a clean play after the problem clears the cross", () => {
    expect(isCrossed({ last_problem_at: ago(5), last_ok_at: ago(1) }, now)).toBe(false);
  });
  test("3 stalls in 5 minutes shows a cross, 2 does not", () => {
    const t = (m: number) => now - m * 60_000;
    expect(isCrossed({ last_problem_at: null, last_ok_at: null }, now, [t(1), t(2), t(4)])).toBe(true);
    expect(isCrossed({ last_problem_at: null, last_ok_at: null }, now, [t(1), t(2)])).toBe(false);
    expect(isCrossed({ last_problem_at: null, last_ok_at: null }, now, [t(1), t(2), t(6)])).toBe(false);
  });
  test("crossed list combines health rows and stalls", () => {
    const t = (m: number) => now - m * 60_000;
    expect(crossedChannels(
      [{ channel_key: "leeds united | epl", channel_name: "Leeds United | EPL", last_problem_at: ago(2), last_ok_at: null }],
      [{ name: "Sky Sports 1", at: t(1) }, { name: "Sky Sports 1", at: t(2) }, { name: "sky sports 1", at: t(3) }], now,
    )).toEqual(["Leeds United | EPL", "Sky Sports 1"]);
  });
});

function packet(pid: number, payload: number[], pusi = false) {
  const p = new Uint8Array(188).fill(0xff);
  p[0] = 0x47; p[1] = (pusi ? 0x40 : 0) | (pid >> 8); p[2] = pid & 0xff; p[3] = 0x10;
  p.set(payload, 4);
  return p;
}
test("counts video packets named by the PMT", () => {
  const pat = packet(0, [0, 0x00, 0xb0, 13, 0, 1, 0xc1, 0, 0, 0, 1, 0xe1, 0x00, 0, 0, 0, 0], true);
  const pmt = packet(0x100, [0, 0x02, 0xb0, 18, 0, 1, 0xc1, 0, 0, 0xe1, 0x01, 0xf0, 0, 0x1b, 0xe1, 0x01, 0xf0, 0, 0, 0, 0, 0], true);
  const vids = Array.from({ length: 5 }, () => packet(0x101, [0, 0, 1]));
  const buf = new Uint8Array(188 * 7);
  [pat, pmt, ...vids].forEach((p, i) => buf.set(p, i * 188));
  expect(tsVideoPackets(buf)).toBe(5);
  expect(tsVideoPackets(new Uint8Array(2000))).toBe(null);
});

describe("channelStatus", () => {
  const iso = (ms: number) => new Date(ms).toISOString();
  test("never seen is unchecked", () => expect(channelStatus(undefined, now)).toBe("unchecked"));
  test("recent problem is offline", () => expect(channelStatus({ last_problem_at: iso(now - 5 * 60_000), last_ok_at: null }, now)).toBe("offline"));
  test("clean play within 24h is online", () => expect(channelStatus({ last_problem_at: null, last_ok_at: iso(now - 23 * 3600_000) }, now)).toBe("online"));
  test("clean play over 24h ago is unchecked", () => expect(channelStatus({ last_problem_at: null, last_ok_at: iso(now - 25 * 3600_000) }, now)).toBe("unchecked"));
});

describe("crosses only around event time", () => {
  const { eventUnavailable, acceptProblemReport, isEventChannel } = require("./player-channel-health");
  const start = Date.parse("2026-11-07T23:00:00Z");
  const ev = { start, end: start + 3 * 3600_000, channels: ["UFC 04 |", "Sky Sports Main Event"] };
  const row = (k: string, problemAt: number) => ({ channel_key: k.toLowerCase(), channel_name: k, last_problem_at: new Date(problemAt).toISOString(), last_ok_at: null });
  test("no cross 11 minutes before the start", () => {
    const now = start - 11 * 60_000;
    expect(eventUnavailable(ev, [row("Sky Sports Main Event", now - 60_000)], [], now)).toEqual([]);
  });
  test("cross 9 minutes before the start after a report", () => {
    const now = start - 9 * 60_000;
    expect(eventUnavailable(ev, [row("UFC 04 |", now - 30_000)], [], now)).toEqual(["UFC 04 |"]);
  });
  test("a report from before this event's window doesn't cross a shared event channel", () => {
    const now = start - 5 * 60_000;
    expect(eventUnavailable(ev, [row("UFC 04 |", start - 12 * 60_000)], [], now)).toEqual([]);
  });
  test("24/7 channel is crossed from its earlier report once the window opens", () => {
    const now = start - 5 * 60_000;
    expect(eventUnavailable(ev, [row("Sky Sports Main Event", start - 12 * 60_000)], [], now)).toEqual(["Sky Sports Main Event"]);
  });
  test("early report on an event channel is ignored; 24/7 always counts", () => {
    expect(acceptProblemReport("UFC 04 |", [ev], start - 30 * 60_000)).toBe(false);
    expect(acceptProblemReport("UFC 04 |", [ev], start - 5 * 60_000)).toBe(true);
    expect(acceptProblemReport("Sky Sports Main Event", [ev], start - 30 * 60_000)).toBe(true);
  });
  test("event channels recognised", () => {
    for (const n of ["UFC 04 |", "MonoMax 27 | (Events Only)", "HBO Max UK | Event 1", "Boxing 03 | Billam-Smith", "Channel 15"]) expect(isEventChannel(n)).toBe(true);
    for (const n of ["Sky Sports Main Event", "UK | UFC TV HD", "TNT Sports 1"]) expect(isEventChannel(n)).toBe(false);
  });
});
