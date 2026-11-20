// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { describe, expect, test } from "bun:test";
import { clubChannelListingHtml, fixtureTeams, parseSportsListingBlock } from "./sports-listing-format";
import { playerSportsEvents } from "./player-sports";

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
  test("Scottish Championship retains supplied streams on save and player read-back", () => {
    const body = "<div>Friday, 20th November</div><div><br></div><div>19:30 GMT</div><div>Inverness CT v Ayr United</div><div>SPFL Championship 01 | Inverness CT | Ayr United</div>";
    for (const title of ["Scottish Championship Streams", "Scotland Championship Streams", "SPFL Championship", "Scottish SPFL Championship Streams"]) {
      expect(clubChannelListingHtml(body, title)).toBeNull();
      const event = playerSportsEvents([{ title, body, category: "Scotland" }], Date.UTC(2026, 10, 20, 18))[0];
      expect(event?.channels).toEqual(["SPFL Championship 01", "Inverness CT", "Ayr United"]);
      expect(event?.teamChannels).toBeUndefined();
      const streamOnly = body.replace("SPFL Championship 01 | Inverness CT | Ayr United", "SPFL Championship 01");
      expect(clubChannelListingHtml(streamOnly, title)).toBeNull();
      const streamEvent = playerSportsEvents([{ title, body: streamOnly, category: "Scotland" }], Date.UTC(2026, 10, 20, 18))[0];
      expect(streamEvent?.channels).toEqual(["SPFL Championship 01"]);
      expect(streamEvent?.teamChannels).toBeUndefined();
    }
  });
});

import { parseSportsListingBlock as parseMma } from "./sports-listing-format";
test("MMA import keeps the numbered fight name as the event title", () => {
  const ev = parseMma("ONE CHAMPIONSHIP\n\n\nOne Friday Fights 179\n1:30pm UK | 8:30am ET\n\nStar Select 2\nbeIN Sports English 2");
  expect(ev[0]?.title).toBe("One Friday Fights 179");
  expect(ev[0]?.channels).toEqual(["Star Select 2", "beIN Sports English 2"]);
});
