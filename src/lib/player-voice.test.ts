// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { describe, expect, test } from "bun:test";
import { voiceAllowed } from "./player-voice";

describe("BM Player voice search limit", () => {
  test("allows 12 searches a minute per device, then blocks the 13th", () => {
    const t = 1_000_000;
    for (let i = 0; i < 12; i++) expect(voiceAllowed("dev-a", t + i)).toBe(true);
    expect(voiceAllowed("dev-a", t + 20)).toBe(false);
    expect(voiceAllowed("dev-b", t + 20)).toBe(true);
  });
  test("allows again once a minute has passed", () => {
    const t = 5_000_000;
    for (let i = 0; i < 12; i++) voiceAllowed("dev-c", t);
    expect(voiceAllowed("dev-c", t + 60_001)).toBe(true);
  });
});
