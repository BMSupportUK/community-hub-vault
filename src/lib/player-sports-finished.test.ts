// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { describe, expect, test } from "bun:test";
import { applyGuideEnds, sportsEventState, typicalLengthMs, type PlayerSportsEvent } from "./player-sports";

const H = 3600_000;
const ev = (start: number, end?: number): PlayerSportsEvent => ({ sport: "Football", subcategory: "", competition: "EFL", title: "Derby v Bolton", date: null, time: "15:00", start, channels: ["Sky Sports Football"], passChannels: [], end, endSource: "estimate" });

describe("finished sports games", () => {
  test("football starting 15:00 is finished at 17:01", () => {
    const start = Date.UTC(2026, 10, 7, 15);
    const e = ev(start, start + typicalLengthMs("Football EFL"));
    expect(sportsEventState(e, start + 60 * 60_000)).toBe("live");
    expect(sportsEventState(e, start + 2 * H + 60_000)).toBe("finished");
  });
  test("a TV guide end time beats the estimate", () => {
    const start = Date.UTC(2026, 10, 7, 15);
    const out = applyGuideEnds([ev(start, start + 2 * H)], new Map([["sky sports football", [{ title: "Live EFL: Derby v Bolton", start: start - 30 * 60_000, end: start + 2.5 * H }]]]), start);
    expect(out[0].end).toBe(start + 2.5 * H);
    expect(out[0].endSource).toBe("epg");
  });
  test("a finished game drops off 2 hours after it ends", () => {
    const start = Date.UTC(2026, 10, 7, 15), end = start + 2 * H;
    expect(applyGuideEnds([ev(start, end)], new Map(), end + 2 * H - 60_000)).toHaveLength(1);
    expect(applyGuideEnds([ev(start, end)], new Map(), end + 2 * H + 60_000)).toHaveLength(0);
  });
  test("cricket lasts 8 hours, boxing 5", () => {
    expect(typicalLengthMs("Cricket Test Match")).toBe(8 * H);
    expect(typicalLengthMs("Boxing")).toBe(5 * H);
  });
});
