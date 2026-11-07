import { expect, test } from "bun:test";
import { resolveInCategory } from "../src/lib/sports-channel-links";
import { playerSportsEvents } from "../src/lib/player-sports";

const cymru = ["UK | Cymru Football event 1", "UK | Cymru Football event 3", "UK | Cymru Football event 8"];

test("guide channel links to the same-numbered channel in the chosen category", () => {
  expect(resolveInCategory("CYMRU FOOTBALL 3", cymru, {})).toBe("UK | Cymru Football event 3");
  expect(resolveInCategory("CYMRU FOOTBALL 8", cymru, {})).toBe("UK | Cymru Football event 8");
});

test("a number the category does not have links to nothing, never a lookalike", () => {
  expect(resolveInCategory("CYMRU FOOTBALL 5", cymru, {})).toBeNull();
});

const now = Date.UTC(2026, 10, 7, 10, 34);
const frenchGuide = { title: "Ligue 1 Streams", category: "France", links: { category: "FR | Ligue 1", numbered: false }, body: "Saturday, 7th November\n16:15 GMT\nAuxerre v Paris\nMatch 1\n19:45 GMT\nPSG v Troyes\nMatch 2" };

test("Ligue 1 Streams uses verified French category channels without requiring FR in their names", () => {
  const events = playerSportsEvents([frenchGuide], now, new Map([["fr | ligue 1", ["Ligue 1 | Match 1", "Ligue 1 | Match 2"]]]));
  expect(events.map(e => e.channels)).toEqual([["Ligue 1 | Match 1"], ["Ligue 1 | Match 2"]]);
  expect(events.map(e => e.channelCountry)).toEqual([undefined, undefined]);
});

test("unresolved French category channels retain the FR restriction", () => {
  const events = playerSportsEvents([frenchGuide], now, new Map([["fr | ligue 1", []]]));
  expect(events[0].channelCountry).toEqual({ "Match 1": "FR" });
});

test("resolved US Paramount channels retain the US restriction against AU lookalikes", () => {
  const events = playerSportsEvents([{ ...frenchGuide, title: "Paramount+", links: { category: "US | Paramount+" }, body: "Saturday, 7th November\n16:15 GMT\nAuxerre v Paris\nParamount+ 3" }], now, new Map([["us | paramount+", ["US | Paramount+ Event 03"]]]));
  expect(events[0].channels).toEqual(["US | Paramount+ Event 03"]);
  expect(events[0].channelCountry).toEqual({ "US | Paramount+ Event 03": "US" });
});
