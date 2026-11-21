import { expect, test } from "bun:test";
import { formatSportsListingBlock, parseSportsListingBlock } from "../src/lib/sports-listing-format";
import { assertStableSportsListing } from "../src/lib/public-guide-safety";

const post = `**## MOTO GP**
Portugal : MotoGP Qualifying
10:50am UK | 5:50am ET
TNT Sports 2
Fox Sports 506
beIN Sports English 2
Supersport Motorsport

Portugal : Moto3 Qualifying
12:45pm UK | 7:45am ET
TNT Sports 2
Fox Sports 506
Supersport Motorsport

Portugal : Moto2 Qualifying
1:40pm UK | 8:40am ET
TNT Sports 2
Fox Sports 506
Supersport Motorsport

Portugal : MotoGP Sprint
3:00pm UK | 10:00am ET
TNT Sports 1 & 2
Fox Sports 6
Fox Sports 1
Supersport Motorsport`;

test("real MotoGP post keeps all four sessions and their own channels through saved read-back", () => {
  const formatted = formatSportsListingBlock({raw: post, guideTitle: "Moto GP", sourceZone: "gmt", nowMs: Date.UTC(2026, 10, 21, 12)});
  const events = parseSportsListingBlock(formatted);
  expect(events.map(({time, title, channels}) => ({time, title, channels}))).toEqual([
    {time: "10:50 GMT", title: "MOTO GP: Portugal : MotoGP Qualifying", channels: ["TNT Sports 2", "Fox Sports 506", "beIN Sports English 2", "Supersport Motorsport"]},
    {time: "12:45 GMT", title: "MOTO GP: Portugal : Moto3 Qualifying", channels: ["TNT Sports 2", "Fox Sports 506", "Supersport Motorsport"]},
    {time: "13:40 GMT", title: "MOTO GP: Portugal : Moto2 Qualifying", channels: ["TNT Sports 2", "Fox Sports 506", "Supersport Motorsport"]},
    {time: "15:00 GMT", title: "MOTO GP: Portugal : MotoGP Sprint", channels: ["TNT Sports 1", "TNT Sports 2", "Fox Sports 6", "Fox Sports 1", "Supersport Motorsport"]},
  ]);
  expect(() => assertStableSportsListing(events, formatted ?? "")).not.toThrow();
});