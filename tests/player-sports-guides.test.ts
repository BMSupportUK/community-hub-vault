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

test("Derby game written differently across guides becomes one card with every channel", () => {
  const events = playerSportsEvents([
    { title: "Paramount+", category: "Sports Passes", body: "Friday, 6th November\n19:20 GMT\nDerby County v Bolton Wanderers\nParamount+ 3" },
    { title: "Dazn", category: "Sports Passes", body: "Friday, 6th November\n19:57 GMT\nDerby v Bolton\nDazn 10 HD" },
    { title: "MonoMax", category: "Sports Passes", body: "Friday, 6th November\n20:00 GMT\nDerby County - Bolton Wanderers\nMonoMax 11" },
    { title: "EFL Championship", category: "Mens", parent: null, body: "Friday, 6th November\n20:00 GMT\nEFL : CHAMPIONSHIP: Derby County v Bolton Wanderers\nSky Sports Football" },
  ], Date.UTC(2026, 10, 6, 19));
  expect(events.length).toBe(1);
  expect(events[0].competition).toBe("EFL Championship");
  expect(events[0].time).toBe("20:00");
  expect(events[0].channels).toEqual(["Sky Sports Football", "Paramount+ 3", "Dazn 10 HD", "MonoMax 11"]);
});

test("women's side and games hours apart stay separate cards", () => {
  const events = playerSportsEvents([
    { title: "A", category: "Mens", body: "Friday, 6th November\n20:00 GMT\nArsenal v Chelsea\nSky Sports Main Event" },
    { title: "B", category: "Womens", body: "Friday, 6th November\n20:00 GMT\nArsenal Women v Chelsea Women\nSky Sports Mix" },
    { title: "C", category: "Mens", body: "Friday, 6th November\n23:30 GMT\nArsenal v Chelsea\nDazn 1" },
  ], Date.UTC(2026, 10, 6, 19));
  expect(events.length).toBe(3);
});
