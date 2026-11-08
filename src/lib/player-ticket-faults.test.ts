// @ts-nocheck — tests run with bun test.
import { expect, test } from "bun:test";
import { activeFaultChannels, eventTicketFaults, faultChannelKey } from "./player-ticket-faults";
import { isCrossed } from "./player-channel-health";
const row = (status: string, name = "Sky Sports Main Event") => ({ status, player_channel_name: name, player_channel_key: faultChannelKey(name) });
test("an unresolved channel fault remains visible regardless of ticket age", () => {
  expect(activeFaultChannels([row("open"), row("in_progress", "DAZN CA 18"), row("waiting", "TNT Sports 1")])).toEqual(["DAZN CA 18", "Sky Sports Main Event", "TNT Sports 1"]);
});
test("resolving a ticket removes its channel fault", () => expect(activeFaultChannels([row("resolved")])).toEqual([]));
test("completing a ticket removes its channel fault", () => expect(activeFaultChannels([row("closed")])).toEqual([]));
test("duplicate faults share one channel identity", () => expect(activeFaultChannels([row("open"), row("open", " SKY  SPORTS Main Event ")])).toHaveLength(1));
test("only the reported channel receives a ticket fault", () => expect(eventTicketFaults({ channels: ["DAZN CA 18", "DAZN CA 19"] }, ["dazn ca 18"])).toEqual(["DAZN CA 18"]));
test("Unicode compatibility and whitespace use the same identity", () => expect(faultChannelKey(" ＳＫＹ   Sports ")).toBe("sky sports"));
test("Tennis 05 resolution clears the earlier playback failure and preceding stalls", () => {
  const resolved = Date.parse("2026-11-08T15:11:08.648788Z");
  expect(isCrossed({ last_problem_at: "2026-11-08T15:10:12.430Z", last_ok_at: new Date(resolved).toISOString() }, resolved + 30_000,
    [resolved - 10_000, resolved - 20_000, resolved - 30_000])).toBe(false);
});
test("a new failure after ticket resolution still shows a channel warning", () => {
  expect(isCrossed({ last_problem_at: "2026-11-08T15:12:00Z", last_ok_at: "2026-11-08T15:11:08Z" }, Date.parse("2026-11-08T15:12:10Z"))).toBe(true);
});