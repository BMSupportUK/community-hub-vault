// @ts-nocheck
import { describe, expect, test } from "bun:test";
import { capPrelims, sportsEventState } from "./player-sports";
const H = 3600_000, t0 = Date.UTC(2026, 10, 7, 16);
const ev = (title, start, end) => ({ sport: "Boxing", subcategory: "", competition: "", title, date: null, time: "", start, end, channels: [], passChannels: [] });
describe("boxing prelims", () => {
  test("prelims finish when the main card starts", () => {
    const [p] = capPrelims([ev("Buatsi v Hutchinson 2: Prelims", t0, t0 + 5 * H), ev("Buatsi v Hutchinson 2", t0 + 3 * H, t0 + 8 * H)]);
    expect(p.end).toBe(t0 + 3 * H);
    expect(sportsEventState(p, t0 + 3 * H + 1)).toBe("finished");
  });
  test("prelims with no main card finish after 3 hours", () => {
    expect(capPrelims([ev("Big Fight: Prelims", t0, t0 + 5 * H)])[0].end).toBe(t0 + 3 * H);
  });
});
