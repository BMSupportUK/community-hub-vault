import { expect, test } from "bun:test";
import { resolveInCategory } from "../src/lib/sports-channel-links";

const cymru = ["UK | Cymru Football event 1", "UK | Cymru Football event 3", "UK | Cymru Football event 8"];

test("guide channel links to the same-numbered channel in the chosen category", () => {
  expect(resolveInCategory("CYMRU FOOTBALL 3", cymru, {})).toBe("UK | Cymru Football event 3");
  expect(resolveInCategory("CYMRU FOOTBALL 8", cymru, {})).toBe("UK | Cymru Football event 8");
});

test("a number the category does not have links to nothing, never a lookalike", () => {
  expect(resolveInCategory("CYMRU FOOTBALL 5", cymru, {})).toBeNull();
});
