import { expect, test } from "bun:test";
import { dedupeSportsListingHtml, parseSportsListingBlock } from "../src/lib/sports-listing-format";
test("same event listed twice is removed before saving", () => {
  const html = ["03-10-2026","","20:55 BST","UFC FIGHTPASS: UFC 332: PRELIMS","UFC 2 HD","","20:55 BST","UFC FIGHTPASS: UFC 332: PRELIMS","UFC 2 HD","","22:55 BST","UFC FIGHTPASS: UFC 332: MAIN CARD","UFC 1 HD"].map((l) => `<div>${l || "<br>"}</div>`).join("");
  const out = dedupeSportsListingHtml(html);
  expect(out).not.toBeNull();
  expect(parseSportsListingBlock(out!)).toHaveLength(2);
});
