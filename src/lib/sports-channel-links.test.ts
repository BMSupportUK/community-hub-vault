// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { expect, test } from "bun:test";
import { readChannelLinks, readReplaceRows } from "./sports-channel-links";

test("a new empty swap row survives readReplaceRows so the editor can show it", () => {
  const rows = readReplaceRows({ replace: [{ from: "", to: "" }] });
  expect(rows).toEqual([{ from: "", to: "" }]);
});

test("readReplaceRows keeps spaces while typing multi-word swaps", () => {
  const rows = readReplaceRows({ replace: [{ from: "CYMRU ", to: "Cymru Football event" }] });
  expect(rows[0].from).toBe("CYMRU ");
});

test("readChannelLinks still sanitises on save: empties dropped, ends trimmed", () => {
  const links = readChannelLinks({ replace: [{ from: "", to: "x" }, { from: " CYMRU FOOTBALL ", to: " Cymru Football event " }] });
  expect(links.replace).toEqual([{ from: "CYMRU FOOTBALL", to: "Cymru Football event" }]);
});

test("readReplaceRows tolerates missing or wrong-shaped replace", () => {
  expect(readReplaceRows(null)).toEqual([]);
  expect(readReplaceRows({ replace: "no" })).toEqual([]);
});

test("assigning a sports category retains the guide's country, numbering and swaps", () => {
  const existing = readChannelLinks({ category: "Old category", country: "CA", numbered: true, replace: [{ from: "DAZN", to: "Dazn CA" }] });
  expect(readChannelLinks({ ...existing, category: "CA | DAZN" })).toEqual({
    category: "CA | DAZN", country: "CA", numbered: true, replace: [{ from: "DAZN", to: "Dazn CA" }],
  });
});

import { resolveInCategory as resolveLive } from "./sports-channel-links";
test("NFL Sunday Ticket guide numbers pick the live feed, never the replay", () => {
  const list = ["NFL | Replay 03", "NFL Sunday Ticket 02 |", "NFL Sunday Ticket 03 |", "NFL | Replay 02"];
  expect(resolveLive("NFL 03", list, {})).toBe("NFL Sunday Ticket 03 |");
  expect(resolveLive("NFL 02", list, {})).toBe("NFL Sunday Ticket 02 |");
  expect(resolveLive("NFL Replay 03", list, {})).toBe("NFL | Replay 03");
});
