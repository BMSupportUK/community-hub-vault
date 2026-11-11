import { expect, test } from "bun:test";
import { isOfficialSportsChannel } from "./sports-programme-end";
const { fixtureCandidate } = require("../../windows-bm-player/fixture-guide.cjs");
test("Sportsnet+ feeds take website sports guide events", () => {
  expect(isOfficialSportsChannel("Sportsnet+ 04 |")).toBe(false);
  expect(fixtureCandidate("Sportsnet+ 04 |")).toBe(true);
});
test("main Sportsnet channels keep the provider guide", () => {
  expect(isOfficialSportsChannel("CA | Sportsnet One")).toBe(true);
  expect(fixtureCandidate("CA | Sportsnet One")).toBe(false);
});
