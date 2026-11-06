import { expect, test } from "bun:test";
import { playerSportsEvents } from "../src/lib/player-sports";

test("same fixture from several guides becomes one card with every channel", () => {
  const events = playerSportsEvents([
    { title: "English Premier League TV Channels", category: "Mens", parent: "Football", body: "Friday, 6th November\n20:00 GMT\nEverton v Coventry City\nSky Sports Main Event" },
    { title: "Sports Pass", category: "Mens", parent: "Football", body: "Friday, 6th November\n20:00 GMT\nEverton vs Coventry City\nMonoMax 1" },
  ], Date.UTC(2026, 10, 6, 19));
  expect(events.length).toBe(1);
  expect(events[0].competition).toBe("English Premier League TV Channels");
  expect(events[0].channels).toEqual(["Sky Sports Main Event", "MonoMax 1"]);
});
