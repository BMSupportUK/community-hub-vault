// @ts-nocheck — tests run with bun test.
import { expect, test } from "bun:test";
import { activeFaultChannels, eventTicketFaults, faultChannelKey } from "./player-ticket-faults";
const row = (status: string, name = "Sky Sports Main Event") => ({ status, player_channel_name: name, player_channel_key: faultChannelKey(name) });
test("an unresolved channel fault remains visible regardless of ticket age", () => {
  expect(activeFaultChannels([row("open"), row("in_progress", "DAZN CA 18"), row("waiting", "TNT Sports 1")])).toEqual(["DAZN CA 18", "Sky Sports Main Event", "TNT Sports 1"]);
});
test("resolving a ticket removes its channel fault", () => expect(activeFaultChannels([row("resolved")])).toEqual([]));
test("completing a ticket removes its channel fault", () => expect(activeFaultChannels([row("closed")])).toEqual([]));
test("duplicate faults share one channel identity", () => expect(activeFaultChannels([row("open"), row("open", " SKY  SPORTS Main Event ")])).toHaveLength(1));
test("only the reported channel receives a ticket fault", () => expect(eventTicketFaults({ channels: ["DAZN CA 18", "DAZN CA 19"] }, ["dazn ca 18"])).toEqual(["DAZN CA 18"]));
test("Unicode compatibility and whitespace use the same identity", () => expect(faultChannelKey(" ＳＫＹ   Sports ")).toBe("sky sports"));