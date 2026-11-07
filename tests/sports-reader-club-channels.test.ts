import { expect, test } from "bun:test";
import { isSportsChannelLine } from "../src/lib/parse-event-times";

test("St. Johnstone and Dundee are club feed labels, not a descriptive sentence", () => {
  expect(isSportsChannelLine("St. Johnstone | Dundee", "St. Johnstone v Dundee")).toBe(true);
});
test("St. Mirren and Rangers are club feed labels, not a descriptive sentence", () => {
  expect(isSportsChannelLine("St. Mirren | Rangers", "St. Mirren v Rangers")).toBe(true);
});
test("ordinary descriptive sentences are not converted into channels", () => {
  expect(isSportsChannelLine("Watch the match. Coverage starts soon", "St. Mirren v Rangers")).toBe(false);
});