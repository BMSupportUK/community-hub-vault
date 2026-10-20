import { test, expect } from "bun:test";
import { checkSportsImport } from "../src/lib/sports-import-check";

const now = Date.UTC(2026, 9, 20, 9, 30);

test("Center Ice fixture stuck to the UK clock on the same row is split out", () => {
  const r = checkSportsImport("US | NHL Center Ice\nNHL | 11 - 10:30pm ET | 3:30am UKLightning at Golden Knights", "gmt", now, "NHL Center Ice");
  expect(r.events).toEqual([{ date: "Wednesday, 21st October", time: "03:30 BST", title: "Lightning at Golden Knights", channels: ["NHL 11"] }]);
});

test("Center Ice ET clock without am/pm is an evening game", () => {
  const r = checkSportsImport("NHL | 09 - 9:40 ET | 2:40 UK\nRed Wings at Kraken", "gmt", now, "NHL Center Ice");
  expect(r.events[0]).toMatchObject({ date: "Wednesday, 21st October", time: "02:40 BST", title: "Red Wings at Kraken" });
});

test("Center Ice ET without the ET label or with brackets still reads the ET clock", () => {
  for (const raw of ["NHL | 09 - 9:40pm | 2:40am UK\nRed Wings at Kraken", "NHL | 09 - 9:40pm ET (2:40am UK)\nRed Wings at Kraken"]) {
    const r = checkSportsImport(raw, "gmt", now, "NHL Center Ice");
    expect(r.events).toEqual([{ date: "Wednesday, 21st October", time: "02:40 BST", title: "Red Wings at Kraken", channels: ["NHL 09"] }]);
  }
});
