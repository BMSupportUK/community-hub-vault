import { expect, test } from "bun:test";
import { playerSportsEvents, sameFixture, seriesKey } from "../src/lib/player-sports";

const now = Date.UTC(2026, 10, 7, 0);
const body = (time: string, title: string, channels: string) => `Saturday, 7th November\n${time} GMT\n${title}\n${channels}`;
const main = { title: "Aussie Rules", parent: "Aussie Rules", category: "Women", body: body("02:05", "Geelong v Melbourne", "Fox Footy 504") };
const hbo = { title: "HBO Max", category: "Sports Passes", body: body("02:00", "Geelong Cats - Melbourne AFLW: Qualifying Final", "HBO Max UK 1 | HBO Max UK 2") };

for (const reverse of [false, true]) test(`HBO AFLW adds both channels to main card, source order ${reverse}`, () => {
  const events = playerSportsEvents(reverse ? [hbo, main] : [main, hbo], now);
  expect(events).toHaveLength(1);
  expect(events[0].competition).toBe("Aussie Rules");
  expect(events[0].time).toBe("02:05 GMT");
  expect(events[0].channels).toEqual(["Fox Footy 504", "HBO Max UK 1", "HBO Max UK 2"]);
  expect(events[0].passChannels).toEqual(["HBO Max UK 1", "HBO Max UK 2"]);
});
test("HBO suffixes do not hide football fixtures", () => {
  expect(sameFixture("Leeds United - Tottenham Hotspur: Xtra Time Premier League", "Leeds v Tottenham")).toBe(true);
  expect(sameFixture("Peterborough United - Reading The Emirates FA Cup: First Round", "Peterborough v Reading")).toBe(true);
  expect(sameFixture("Geelong Cats - Melbourne AFLW: Qualifying Final", "Geelong v Melbourne")).toBe(false);
  expect(sameFixture("Arsenal Women v Chelsea Women", "Arsenal v Chelsea")).toBe(false);
});
test("HBO on-board feeds join the main MotoGP sprint without qualifying or Moto2", () => {
  const events = playerSportsEvents([
    { title: "Moto GP", category: "Motorcycling", body: body("16:00", "Qatar : Moto GP Sprint", "TNT Sports 2") },
    { title: "HBO Max", category: "Sports Passes", body: [body("16:00", "MotoGP: Round 20: Qatar Sprint Race", "HBO Max UK 3"), body("16:00", "On-Board 4", "HBO Max UK 1 | MotoGP | Round 20 | Qatar Sprint Race"), body("16:00", "On-Board 1", "HBO Max UK 4 | MotoGP | Round 20 | Qatar Sprint Race")].join("\n\n") },
    { title: "Moto GP", category: "Motorcycling", body: body("16:00", "Qatar : Moto 2 Qualifying", "TNT Sports 3") },
  ], now);
  const sprint = events.find(e => e.channels.includes("TNT Sports 2"));
  expect(events).toHaveLength(2);
  expect(sprint?.channels).toContain("HBO Max UK 1");
  expect(sprint?.channels).toContain("HBO Max UK 4");
  expect(sprint?.channels).toContain("HBO Max UK 3");
  expect(sprint?.channels).not.toContain("TNT Sports 3");
  expect(sprint?.channels).not.toContain("MotoGP");
  expect(sprint?.channels).not.toContain("Round 20");
  expect(sprint?.channels).not.toContain("Qatar Sprint Race");
});
test("HBO Supercars race joins main TV card but other races and venues stay separate", () => {
  const events = playerSportsEvents([
    { title: "Motorcar Racing | Supercars", category: "Motorsports", body: body("04:30", "SUPERCARS: Sandown : Race 33", "TNT Sports 2") },
    { title: "HBO Max", category: "Sports Passes", body: body("04:30", "Supercars Championship Race 33: Sandown", "HBO Max UK 1") },
  ], now);
  expect(events).toHaveLength(1);
  expect(events[0].channels).toEqual(["TNT Sports 2", "HBO Max UK 1"]);
  expect(seriesKey("Supercars Championship Race 34: Sandown")).not.toBe(seriesKey("SUPERCARS: Sandown : Race 33"));
  expect(seriesKey("Supercars Championship Race 33: Bathurst")).not.toBe(seriesKey("SUPERCARS: Sandown : Race 33"));
});