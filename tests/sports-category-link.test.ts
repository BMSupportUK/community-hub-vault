import { expect, test } from "bun:test";
import { resolveInCategory } from "../src/lib/sports-channel-links";
import { playerSportsEvents } from "../src/lib/player-sports";

const cymru = ["UK | Cymru Football event 1", "UK | Cymru Football event 3", "UK | Cymru Football event 8"];

const daznCategory = Array.from({ length: 30 }, (_, i) => `ᴰᴬᶻᴺ ¹ ${String(i + 1).padStart(2, "0")} (CA | Main)`);

test("DAZN decorative brand lettering resolves every numbered feed and retains its exact playlist name", () => {
  const list = [...daznCategory, "DAZN UK | Event 1", "DAZN 1 UK New"];
  for (let n = 1; n <= 30; n++) expect(resolveInCategory(`Dazn ${n} HD`, list, {})).toBe(daznCategory[n - 1]);
});

test("category linking strips quality suffixes without confusing 4K with the feed number", () => {
  expect(resolveInCategory("Triller TV 4 HD", ["01 | Boxing 4K", "04 | Main Card HD"], {})).toBe("04 | Main Card HD");
});

test("DAZN fixtures carry the original decorative playlist names for installed players", () => {
  const events = playerSportsEvents([{ title: "Dazn", category: "Sports Passes", links: { category: "VIP | DAZN" }, body: "Saturday, 7th November\n15:00 GMT\nCoventry v Derby\nDazn 19 HD" }], Date.UTC(2026, 10, 7, 10, 40), new Map([["vip | dazn", daznCategory]]));
  expect(events[0].channels).toEqual(["ᴰᴬᶻᴺ ¹ 19 (CA | Main)"]);
});

const trillerCategory = ["UK | UFC TV HD", "UFC 01 | UFC Fight Night", "UFC 04 | ", "TrillerTv (24/7)", "TrillerTv 01 | ", "TrillerTv 04 | "];

test("Triller uses its own numbered feed rather than UFC in their shared category", () => {
  expect(resolveInCategory("Triller TV 1", trillerCategory, {})).toBe("TrillerTv 01 | ");
  expect(resolveInCategory("Triller TV 4", trillerCategory, {})).toBe("TrillerTv 04 | ");
});

test("programme numbers and 4K never override the numbered channel label", () => {
  expect(resolveInCategory("Triller TV 4", ["01 | Boxing Show 4", "02 | Boxing 4K", "04 | Main Card HD"], {})).toBe("04 | Main Card HD");
});

test("category number fallback honours the administrator's replacement", () => {
  expect(resolveInCategory("Triller TV 4", ["05 | Main Card HD", "04 | Undercard HD"], { replace: [{ from: "4", to: "5" }] })).toBe("05 | Main Card HD");
});

test("unknown brands do not guess between conflicting same-number feeds", () => {
  expect(resolveInCategory("Other TV 1", trillerCategory, {})).toBeNull();
});

test("Triller fixtures reach the player with exact playlist names", () => {
  const events = playerSportsEvents([{ title: "Triller TV", category: "Sports Passes", links: { category: "VIP | UFC & Triller Tv" }, body: "Saturday, 7th November\n11:00 GMT\nSuea Games v Satangthong\nTriller TV 1\n16:00 GMT\nMemphis Wrestling\nTriller TV 4" }], Date.UTC(2026, 10, 7, 10, 37), new Map([["vip | ufc & triller tv", trillerCategory]]));
  expect(events.map((e) => e.channels)).toEqual([["TrillerTv 01 | "], ["TrillerTv 04 | "]]);
});

test("guide channel links to the same-numbered channel in the chosen category", () => {
  expect(resolveInCategory("CYMRU FOOTBALL 3", cymru, {})).toBe("UK | Cymru Football event 3");
  expect(resolveInCategory("CYMRU FOOTBALL 8", cymru, {})).toBe("UK | Cymru Football event 8");
});

test("a number the category does not have links to nothing, never a lookalike", () => {
  expect(resolveInCategory("CYMRU FOOTBALL 5", cymru, {})).toBeNull();
});

const now = Date.UTC(2026, 10, 7, 10, 34);

test("EPL category never becomes a Peacock country restriction when the playlist lookup is unavailable", () => {
  const events = playerSportsEvents([{ title: "Peacock Sports", category: "Sports Passes", links: { category: "EPL | Premier League Hub" }, body: "Saturday, 7th November\n14:00 GMT\nMens Qualification: Part 2\nPEACOCK 2 HD" }], now);
  expect(events[0].channels).toEqual(["PEACOCK 2 HD"]);
  expect(events[0].channelCountry).toBeUndefined();
});

test("Peacock uses its exact numbered playlist feed without an EPL country gate", () => {
  const events = playerSportsEvents([{ title: "Peacock Sports", category: "Sports Passes", links: { category: "EPL | Premier League Hub" }, body: "Saturday, 7th November\n14:00 GMT\nMens Qualification: Part 2\nPEACOCK 2 HD" }], now, new Map([["epl | premier league hub", ["Peacock 2 | (Events Only)"]]]));
  expect(events[0].channels).toEqual(["Peacock 2 | (Events Only)"]);
  expect(events[0].channelCountry).toBeUndefined();
});
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
