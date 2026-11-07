// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { describe, expect, test } from "bun:test";
import { crossedChannels, isCrossed, tsVideoPackets } from "./player-channel-health";

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
