import { expect, test } from "bun:test";
import { isReplayChannel, pinLiveChannels } from "./sports-live-only";

const live = ["UFC 01 | UFC Fight Night", "UK | UFC TV HD", "HBO Max UK | Event 1"];

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
