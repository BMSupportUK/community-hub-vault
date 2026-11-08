// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { expect, test } from "bun:test";
import { createLiveChannelPinner, isReplayChannel, pinLiveChannels } from "./sports-live-only";

const live = ["UFC 01 | UFC Fight Night", "UK | UFC TV HD", "HBO Max UK | Event 1"];
test("indexed sports matching preserves existing exact, alias, numbered and fallback results", () => {
  const names = [...live, "Coupang | Event 1", "Sky Sports Main Event HD", "DAZN 01 CA", "DAZN 02 CA"];
  const aliases = [{ from: "My main sport", to: "Sky Sports Main Event" }];
  const pin = createLiveChannelPinner(names, aliases);
  for (const c of ["UFC 01", "HBO Max Event 1", "Coupang Event 1", "Sky Sports ME", "My main sport", "DAZN 1", "DAZN", "Channel 15", "Boxing 02", "Unknown channel"]) {
    expect(pin([c])).toEqual(pinLiveChannels([c], names, aliases));
  }
  expect(pin(["Coupang Event 1"])).toEqual(["Coupang | Event 1"]);
});
test("indexed matching retains fuzzy quality ranking and numeric catalogue feeds", () => {
  const names = ["7 | Live football", "Sky Sports Main Event UHD", "Sky Sports Main Event FHD", "Coupang Event 11", "Coupang Event 1 HD"];
  const pin = createLiveChannelPinner(names);
  for (const channel of ["7", "Sky Sport Main", "Coupang Event 1", "Sky Sports Main Event", "Missing"]) expect(pin([channel])).toEqual(pinLiveChannels([channel], names));
});

test("a guide channel that only loosely matches a Replay feed is dropped, not linked", () => {
  expect(pinLiveChannels(["UFC 3 HD"], live)).toEqual([]);
});
test("exact live names are kept as they are", () => {
  expect(pinLiveChannels(["UFC 01 | UFC Fight Night", "HBO Max UK | Event 1"], live)).toEqual(["UFC 01 | UFC Fight Night", "HBO Max UK | Event 1"]);
});
test("Daily Sports and Boxing numbered labels are left for the apps", () => {
  expect(pinLiveChannels(["Channel 15", "Boxing 02 | Buatsi"], live)).toEqual(["Channel 15", "Boxing 02 | Buatsi"]);
});
test("replay names and replay categories are recognised", () => {
  expect(isReplayChannel("Replay | UFC 03")).toBe(true);
  expect(isReplayChannel("MMA 01", "VIP | Sport Replays")).toBe(true);
  expect(isReplayChannel("UFC 01 | UFC Fight Night", "VIP | UFC & Triller Tv")).toBe(false);
});
