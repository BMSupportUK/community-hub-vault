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

import { seriesKey as _seriesKey, playerSportsEvents as _pse } from "../src/lib/player-sports";
const _g = (title: string, body: string) => ({ title, category: null, body });
test("BKFC fight cards with different headline bouts share one card", () => {
  const now = Date.UTC(2026, 10, 7, 12);
  const ev = _pse([
    _g("Todays Live Events", "Saturday, 7th November\n\n19:00 GMT\nBKFC 96: Cooke v Weir\nChannel 19"),
    _g("Triller TV", "Saturday, 7th November\n\n20:00 GMT\nBKFC 96 Glasgow: Sean Weir v Leigh Cohoon\nTriller TV 6"),
  ], now).filter((e) => /bkfc/i.test(e.title));
  expect(ev.length).toBe(1);
  expect(ev[0].channels.length).toBe(2);
});
test("MotoGP and F1 sessions key by series and session", () => {
  expect(_seriesKey("Qatar : Moto GP Sprint")).toBe(_seriesKey("MotoGP: Round 20: Qatar Sprint Race"));
  expect(_seriesKey("Sao Paulo : Practice 3", "F1")).toBe(_seriesKey("São Paulo Grand Prix Practice 3"));
  expect(_seriesKey("Qatar : Moto GP Qualying")).not.toBe(_seriesKey("Qatar : Moto GP Sprint"));
});
