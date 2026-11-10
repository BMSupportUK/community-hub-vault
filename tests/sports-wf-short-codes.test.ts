import { expect, test } from "bun:test";
import { resolveInCategory } from "../src/lib/sports-channel-links";

const faCategory = [
  "FA Player 01 | (Event Only)", "FA Player 02 | (Event Only)", "W-Sport",
  "Womens Football 00 |", "Womens Football 01 |", "Womens Football 02 |",
];

test("WF short codes link to the matching Womens Football feed in the FA Player category", () => {
  expect(resolveInCategory("WF01", faCategory, { numbered: false })).toBe("Womens Football 01 |");
  expect(resolveInCategory("WF02", faCategory, { numbered: false })).toBe("Womens Football 02 |");
});

test("an unknown short code is never guessed onto a different brand", () => {
  expect(resolveInCategory("XY01", faCategory, { numbered: false })).toBeNull();
});
