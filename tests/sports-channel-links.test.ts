import { test, expect } from "bun:test";
import { testChannelLinks } from "../src/lib/sports-channel-links";
import { playerSportsEvents } from "../src/lib/player-sports";
test("numbered guide: Channel 07 links to '07 | ...'", () => {
  const r = testChannelLinks(["Channel 07"], ["07 | 12:00 Trackside Live!", "Sky Sports 7"], { numbered: true });
  expect(r[0].found).toEqual(["07 | 12:00 Trackside Live!"]);
});
test("country rule: US only, never AU", () => {
  const r = testChannelLinks(["Paramount+ 3"], ["AU | Paramount+ Event 03", "US | Paramount+ Event 03"], { country: "US" });
  expect(r[0].found).toEqual(["US | Paramount+ Event 03"]);
});
test("word swap: CYMRU FOOTBALL 1 → Cymru Football event 1", () => {
  const r = testChannelLinks(["CYMRU FOOTBALL 1"], ["Cymru Football event 1", "Cymru Football event 2"], { replace: [{ from: "CYMRU FOOTBALL", to: "Cymru Football event" }] });
  expect(r[0].found).toEqual(["Cymru Football event 1"]);
});
test("guide rules reach the app feed (rewritten channel + country)", () => {
  const body = `<div>Friday, 6th November</div><div>19:30 GMT</div><div>Leeds - Hull</div><div>Paramount+ 3</div>`;
  const ev = playerSportsEvents([{ title: "P", body, category: "X", links: { country: "US" } }], Date.parse("2026-11-06T12:00:00Z"));
  expect(ev[0].channelCountry).toEqual({ "Paramount+ 3": "US" });
});
