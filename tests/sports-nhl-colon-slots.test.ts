import { expect, test } from "bun:test";
import { checkSportsImport } from "../src/lib/sports-import-check";
import { parseSportsListingBlock, splitListingSections } from "../src/lib/sports-listing-format";

// Exact NHL section from the queued 31 October post.
const raw = `**US | NHL Center Ice**

NHL 01: 1pm ET | 5pm UK
Blackhawks @ Bruins
NHL 02: 1pm ET | 5pm UK
Blues @ Redwings
NHL 03: 2pm ET | 6pm UK
Lightning @ Predators
NHL 04: 2pm ET | 6pm UK
Oilers @ Islanders
NHL 05: 4pm ET | 8pm UK
Sabres @ Kings
NHL 06: 4pm ET | 8pm UK
Senators @ Sharks
NHL 07: 7pm ET | 11pm UK
Penguins @ Canadiens
NHL 08: 7pm ET | 11pm UK
Maple Leafs @ Canucks
NHL 09: 8pm ET | 12am UK
Blue Jackets @ Stars
NHL 10: 10pm ET | 2am UK
Flames @ Avalanche`;
const now = Date.UTC(2026, 9, 31, 10, 42);

test("today's NHL colon slots retain all ten matchups, channels and UK dates", () => {
  const result = checkSportsImport(raw, "gmt", now, "NHL Center Ice");
  const names = ["Blackhawks @ Bruins", "Blues @ Redwings", "Lightning @ Predators", "Oilers @ Islanders", "Sabres @ Kings", "Senators @ Sharks", "Penguins @ Canadiens", "Maple Leafs @ Canucks", "Blue Jackets @ Stars", "Flames @ Avalanche"];
  const times = ["17:00", "17:00", "18:00", "18:00", "20:00", "20:00", "23:00", "23:00", "00:00", "02:00"];
  expect(result.errors).toBe(0);
  expect(result.warnings).toBe(0);
  expect(result.events).toEqual(names.map((title, i) => ({
    title,
    date: i < 8 ? "Saturday, 31st October" : "Sunday, 1st November",
    time: `${times[i]} GMT`,
    channels: [`NHL ${String(i + 1).padStart(2, "0")}`],
  })));
  expect(parseSportsListingBlock(result.formatted)).toEqual(result.events);
});

test("colon slots keep ET authoritative even if the supplied UK clock is wrong", () => {
  const result = checkSportsImport("NHL 01: 1pm ET | 6pm UK\nBlackhawks @ Bruins", "gmt", now, "NHL Center Ice");
  expect(result.errors).toBe(0);
  expect(result.events[0]).toEqual({ date: "Saturday, 31st October", time: "17:00 GMT", title: "Blackhawks @ Bruins", channels: ["NHL 01"] });
});

test("multi-provider splitting keeps the NHL section and its ten fixtures intact", () => {
  const sections = splitListingSections(`${raw}\n\n**US | NBA League Pass**\nwnba: 1 name: Golden State Valkyries x Atlanta Dream start:2026-10-31 23:50:00 stop:2026-11-01 04:00:00`);
  expect(sections.map(s => s.name)).toEqual(["US | NHL Center Ice", "US | NBA League Pass"]);
  const result = checkSportsImport(sections[0]?.raw ?? "", "gmt", now, "NHL Center Ice");
  expect(result.errors).toBe(0);
  expect(result.events).toHaveLength(10);
});