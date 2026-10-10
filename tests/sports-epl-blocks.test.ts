import { expect, test } from "bun:test";
import { checkSportsImport } from "../src/lib/sports-import-check";

test("Premier League fixtures split into one block per channel group, keeping fixture and KO time", async () => {
  const raw = await Bun.file(new URL("./fixtures-epl-2026-10-10.txt", import.meta.url)).text();
  const r = checkSportsImport(raw, "gmt", Date.UTC(2026, 9, 10, 7), "English Premier League");
  expect(r.errors).toBe(0);
  const arsenal = r.events.filter((e) => e.title === "PREMIER LEAGUE: Arsenal v Leeds United");
  expect(arsenal).toHaveLength(3);
  expect(arsenal.every((e) => e.time.startsWith("12:30"))).toBe(true);
  expect(arsenal[0].channels).toEqual(["EPL Premier League", "Arsenal EPL ˢᴰ", "Leeds United EPL ˢᴰ"]);
  expect(arsenal[2].channels).toEqual(["TNT Sport 1", "Supersport Premier League"]);
  expect(r.events.filter((e) => e.title.includes("Ipswich"))).toHaveLength(2);
  expect(r.events).toHaveLength(17);
});

test("Premier League fixtures split into one section per fixture for separate filing", async () => {
  const { splitListingSections, formatSportsListingBlock, parseSportsListingBlock } = await import("../src/lib/sports-listing-format");
  const raw = await Bun.file(new URL("./fixtures-epl-2026-10-10.txt", import.meta.url)).text();
  const sections = splitListingSections(raw);
  expect(sections.map((s) => s.name)).toEqual([
    "Arsenal v Leeds United",
    "Aston Villa v Brentford",
    "Chelsea v Bournemouth",
    "Ipswich Town v Fulham",
    "Sunderland v Brighton",
    "Manchester United v Tottenham Hotspur",
  ]);
  // Each split fixture still breaks into its channel-group blocks on import.
  const body = `${sections[0]!.name}\n${sections[0]!.raw.trim()}`;
  const fmt = formatSportsListingBlock({ raw: body, sourceZone: "gmt", nowMs: Date.UTC(2026, 9, 10, 7) });
  const events = fmt ? parseSportsListingBlock(fmt) : [];
  expect(events).toHaveLength(3);
  expect(events.every((e) => e.title === "Arsenal v Leeds United" && e.time.startsWith("12:30"))).toBe(true);
});
