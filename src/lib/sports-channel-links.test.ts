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
