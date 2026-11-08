// @ts-nocheck — tests run with bun:test.
import { expect, test } from "bun:test";
import { isOfficialSportsChannel } from "./sports-programme-end";

test("official broadcaster quality pipes do not make them event-only feeds", () => {
  for (const name of ["Sky Sports Cricket | FHD |", "Sky Sports Football | HD |", "TNT Sports 1 | FHD |", "Fox Sports 501 | HD |"])
    expect(isOfficialSportsChannel(name)).toBe(true);
  for (const name of ["DAZN CA 18 |", "Sky Sports Cricket | (Events Only)", "Sky Sports Cricket Replay | HD |"])
    expect(isOfficialSportsChannel(name)).toBe(false);
});