import { describe, expect, it } from "bun:test";
import { eplFamilies, eplFamily } from "../src/lib/epl-merge-family";

const hub = "2:00pm UK\nCrystal Palace v Nottingham\nStan Sport\nAstro Premier League 2\nHub Premier 1\nMonoMax";
const sky = "2:00pm UK\nCrystal Palace v Nottingham\nSky Sports Main Event\nSky Sport 8 NZ";
const team = "2:00pm UK\nCrystal Palace v Nottingham\nCrystal Palace EPL ˢᴰ\nNottingham EPL ˢᴰ";

describe("EPL merge families", () => {
  it("tags Hub, Sky and team cards separately", () => {
    expect(eplFamily(hub)).toBe("Premier League Hub");
    expect(eplFamily(sky)).toBe("Sky Sports");
    expect(eplFamily(team)).toBe("Team Channels");
  });
  it("detects a Hub + Sky mix so it can be refused", () => {
    expect(eplFamilies([hub, sky]).length).toBe(2);
    expect(eplFamilies([hub, hub]).length).toBe(1);
  });
});
