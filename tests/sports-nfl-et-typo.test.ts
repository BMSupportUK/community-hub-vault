import { expect, test } from "bun:test";
import { parseSportsListingBlock } from "../src/lib/sports-listing-format";

const POST = `US | NFL Sunday Ticket

NFL 02: 9:30am ET | 2:30pm UK

Patriots at Lions

NFL 03: 1pm ET | 6pm ET

Chiefs at Falcons

NFL 12: 4:25pm ET | 9:25pm ET

49ers at Cowboys

NFL 13: SNF 8:20pm ET | 1:20am ET

Steelers at Bengals`;

test("NFL Sunday Ticket imports when the UK clock is mislabelled ET", () => {
  const ev = parseSportsListingBlock(POST);
  expect(ev.map((e) => e.title)).toEqual(["Patriots at Lions", "Chiefs at Falcons", "49ers at Cowboys", "Steelers at Bengals"]);
  expect(ev.map((e) => e.channels)).toEqual([["NFL 02"], ["NFL 03"], ["NFL 12"], ["NFL 13"]]);
  expect(ev.map((e) => e.time)).toEqual(["2:30pm", "6pm", "9:25pm", "1:20am UK"]);
});
