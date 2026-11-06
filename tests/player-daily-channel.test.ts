import { test, expect } from "bun:test";
import { matchChannel } from "../src/lib/player-channel-match";
const list = ["07 | 12:00 Trackside Live!", "13 | ONE Friday Fights 177 & The Inner Circle 37 13:30", "Sky Sports 7 | HD |"];
test("Daily Sports 'Channel 07' picks the feed numbered 07", () => {
  expect(matchChannel("Channel 07", list)).toEqual(["07 | 12:00 Trackside Live!"]);
});
test("Daily Sports 'Channel 13' picks the feed whose name starts 13 |", () => {
  expect(matchChannel("Channel 13", list)).toEqual(["13 | ONE Friday Fights 177 & The Inner Circle 37 13:30"]);
});
