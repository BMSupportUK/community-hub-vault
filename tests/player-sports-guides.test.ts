import { expect, test } from "bun:test";
import { playerSportsEvents } from "../src/lib/player-sports";

test("Scottish club feeds offer both teams and retain real TV names", () => {
  const events = playerSportsEvents([{ title: "Scotland Premier League Streams", category: "Sports Passes", body: "Saturday, 7th November\n15:00 GMT\nDundee United v Rangers\nSky Sports Football\nUnder Team Channels" }], Date.UTC(2026, 10, 7, 14));
  expect(events[0].channels).toEqual(["Sky Sports Football", "Dundee United", "Rangers"]);
  expect(events[0].teamChannels).toBe(true);
});

test("ordinary TV guides retain broadcasters without invented team channels", () => {
  const events = playerSportsEvents([{ title: "Scottish Cup TV Channels", category: "Mens", parent: "Football", body: "Saturday, 7th November\n15:00 GMT\nDundee United v Rangers\nSky Sports Football" }], Date.UTC(2026, 10, 7, 14));
  expect(events[0].channels).toEqual(["Sky Sports Football"]);
  expect(events[0].teamChannels).toBeUndefined();
});

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
  expect(events[0].time).toBe("20:00 GMT");
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

test("card names drop shouting competition prefixes and sports-pass channels are marked", () => {
  const events = playerSportsEvents([
    { title: "EFL Championship", category: "Mens", body: "Friday, 6th November\n20:00 GMT\nEFL : CHAMPIONSHIP: Derby County v Bolton Wanderers\nSky Sports Football" },
    { title: "Dazn", category: "Sports Passes", body: "Friday, 6th November\n19:57 GMT\nDerby v Bolton\nDazn 10 HD" },
    { title: "Paramount+", category: "Sports Passes", body: "Friday, 6th November\n22:30 GMT\nUFC Fight Night Preview Show: Cortes Acosta v Walker\nParamount+ 1" },
  ], Date.UTC(2026, 10, 6, 19));
  expect(events[0].title).toBe("Derby County v Bolton Wanderers");
  expect(events[0].passChannels).toEqual(["Dazn 10 HD"]);
  expect(events[1].title).toBe("UFC Fight Night Preview Show: Cortes Acosta v Walker");
});
