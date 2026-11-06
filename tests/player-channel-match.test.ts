import { describe, expect, test } from "bun:test";
import { matchChannel, normChannel } from "../src/lib/player-channel-match";

describe("player channel matching", () => {
  test("Coupang Play guide matches shortened Coupang playlist feeds", () => {
    expect(matchChannel("Coupang Play 1", ["Coupang 01 HD", "Coupang 2 HD", "Coupang 10 HD"]))
      .toEqual(["Coupang 01 HD"]);
  });
  test("Coupang short guide matches Play feed with programme details", () => {
    expect(matchChannel("Coupang 02", ["KR: Coupang Play 2 HD | Boston Celtics v Houston Rockets"]))
      .toEqual(["KR: Coupang Play 2 HD | Boston Celtics v Houston Rockets"]);
  });
  test("Coupang does not select another provider with the same number", () => {
    expect(matchChannel("Coupang Play 1", ["DAZN 1 HD", "Peacock 1 HD"])).toEqual([]);
  });
  test("strips country prefix and quality tags", () => {
    expect(normChannel("UK: SKY SPORTS MAIN EVENT FHD")).toBe("sky sport main event");
  });
  test("prefers FHD over SD copies", () => {
    expect(matchChannel("Sky Sports Main Event", ["UK: Sky Sports Main Event SD", "UK: Sky Sports Main Event FHD"])[0])
      .toBe("UK: Sky Sports Main Event FHD");
  });
  test("built-in alias maps BT Sport to TNT", () => {
    expect(matchChannel("BT Sport 1", ["UK: TNT Sports 1 HD"])).toEqual(["UK: TNT Sports 1 HD"]);
  });
  test("admin alias wins", () => {
    expect(matchChannel("Viaplay", ["UK: Premier Sports 1"], [{ from: "Viaplay", to: "Premier Sports 1" }])).toEqual(["UK: Premier Sports 1"]);
  });
  test("no match returns empty", () => {
    expect(matchChannel("DAZN 1", ["UK: Sky Sports News"])).toEqual([]);
  });
  test("partial match does not cross numbers", () => {
    expect(matchChannel("TNT Sports 1", ["UK: TNT Sports 10", "UK: TNT Sports 1 HD"])).toEqual(["UK: TNT Sports 1 HD"]);
  });
  test("bare MonoMax does not list every numbered MonoMax feed", () => {
    expect(matchChannel("MonoMax", ["MonoMax 1 HD", "MonoMax 2 HD", "MonoMax HD"])).toEqual(["MonoMax HD"]);
  });
  test("numbered MonoMax keeps only its listed feed", () => {
    expect(matchChannel("MonoMax 1", ["MonoMax 1 HD", "MonoMax 10 HD", "MonoMax 2 HD"])).toEqual(["MonoMax 1 HD"]);
  });
});

describe("country labels and spacing", () => {

  const list = ["UK: DAZN 1 FHD", "US: ESPN 2 HD", "AU | FOX SPORTS 505", "NHL 1", "|UK| PREMIER SPORTS 1 HD", "UK: SKY SPORTS PREMIER LEAGUE HD", "CA: TSN2"];
  test("USA: ESPN 2 matches US: ESPN 2", () => expect(matchChannel("USA: ESPN 2", list)).toEqual(["US: ESPN 2 HD"]));
  test("Australia: Fox Sports 505", () => expect(matchChannel("Australia: Fox Sports 505", list)).toEqual(["AU | FOX SPORTS 505"]));
  test("Dazn 1 HD", () => expect(matchChannel("Dazn 1 HD", list)).toEqual(["UK: DAZN 1 FHD"]));
  test("NHL 01 matches NHL 1", () => expect(matchChannel("NHL 01", list)).toEqual(["NHL 1"]));
  test("UK Premier Sports 1 without colon", () => expect(matchChannel("UK Premier Sports 1", list)).toEqual(["|UK| PREMIER SPORTS 1 HD"]));
  test("trailing UK", () => expect(matchChannel("Sky Sports Premier League UK", list)).toEqual(["UK: SKY SPORTS PREMIER LEAGUE HD"]));
  test("Canada: TSN 2 matches TSN2", () => expect(matchChannel("Canada: TSN 2", list)).toEqual(["CA: TSN2"]));
});
