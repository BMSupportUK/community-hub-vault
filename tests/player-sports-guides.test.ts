import { expect, test } from "bun:test";
import { playerSportsEvents } from "../src/lib/player-sports";

test("same fixture stays in each Premier League guide", () => {
  const body = "Friday, 6th November\n20:00 GMT\nEverton v Coventry City\n";
  const events = playerSportsEvents([
    { title: "English Premier League TV Channels", category: "Mens", parent: "Football", body: body + "Sky Sports Main Event" },
    { title: "English Premier League Hub", category: "Mens", parent: "Football", body: body + "MonoMax" },
  ], Date.UTC(2026, 10, 6, 19));
  expect(events.map((e) => e.competition)).toEqual(["English Premier League TV Channels", "English Premier League Hub"]);
});