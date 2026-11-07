// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { describe, expect, test } from "bun:test";
import { clubChannelListingHtml, fixtureTeams, parseSportsListingBlock } from "./sports-listing-format";

const html = "Friday 31-07-26<div><br></div><div>8:00pm UK</div><div>Dundee United v Rangers</div><div>Sky Sports Football</div>";

describe("club channel guides", () => {
  test("splits fixture into both clubs", () => {
    expect(fixtureTeams("Dundee United v Rangers")).toEqual(["Dundee United", "Rangers"]);
  });
  test("Scottish guide lists the fixture under each club", () => {
    const out = clubChannelListingHtml(html, "Scotland Premier League Channels");
    expect(parseSportsListingBlock(out ?? html)[0].channels).toEqual(["Sky Sports Football", "Dundee United", "Rangers"]);
  });
  test("iFollow guide renamed too", () => {
    expect(clubChannelListingHtml(html, "iFollow | League One")).not.toBeNull();
  });
  test("other guides untouched", () => {
    expect(clubChannelListingHtml(html, "Premier League")).toBeNull();
  });
});
