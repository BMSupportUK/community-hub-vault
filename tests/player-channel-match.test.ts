import { describe, expect, test } from "bun:test";
import { matchChannel, normChannel } from "../src/lib/player-channel-match";

describe("player channel matching", () => {
  test("strips country prefix and quality tags", () => {
    expect(normChannel("UK: SKY SPORTS MAIN EVENT FHD")).toBe("sky sports main event");
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
});
