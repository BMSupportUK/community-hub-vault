import { expect, test } from "bun:test";
import { pruneExpiredGuideEvents } from "../src/lib/prune-expired-guide-events";
import { parseSportsListingBlock } from "../src/lib/sports-listing-format";

const nowMs = Date.parse("2026-11-13T07:58:00Z");
const html = (text: string) => text.split("\n").map(line => `<div>${line}</div>`).join("");

for (const fixture of [
  { title: "UFC 334: PRESS CONFERENCE", time: "22:55 GMT", end: "04:00 GMT", channel: "UFC 1 HD" },
  { title: "Rinkside Live: Womens", time: "22:45 GMT", end: "00:35 GMT", channel: "PEACOCK 4 HD" },
]) {
  test(`${fixture.title} keeps its overnight finish and channel during cleanup`, () => {
    const body = html(`Thursday, 12th November\n${fixture.time}\n${fixture.title}\nEnd: 13/11/2026 ${fixture.end}\n${fixture.channel}\nFriday, 13th November\n13:45 GMT\nUpcoming programme\nUFC 2 HD`);
    const result = parseSportsListingBlock(pruneExpiredGuideEvents(body, nowMs));
    expect(result.find(event => event.title === fixture.title)).toMatchObject({
      channels: [fixture.channel], endDate: "13/11/2026", endTime: fixture.end,
    });
  });
}

test("cleanup removes an expired event as a whole without leaving its finish or channel", () => {
  const body = html("Thursday, 12th November\n20:00 GMT\nExpired programme\nEnd: 13/11/2026 04:00 GMT\nPEACOCK 4 HD\nFriday, 13th November\n13:45 GMT\nUpcoming programme\nUFC 2 HD");
  const result = parseSportsListingBlock(pruneExpiredGuideEvents(body, nowMs));
  expect(result).toHaveLength(1);
  expect(result[0]?.title).toBe("Upcoming programme");
  expect(result[0]?.channels).toEqual(["UFC 2 HD"]);
});