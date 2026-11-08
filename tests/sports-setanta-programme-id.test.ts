import { describe, expect, test } from "bun:test";
import { checkSportsImport } from "../src/lib/sports-import-check";
import { formatSportsListingBlock, parseSportsListingBlock } from "../src/lib/sports-listing-format";
import { safePublicEventTitle } from "../src/lib/public-guide-safety";

const raw = `**VIP | Setanta**
Setanta: 1 320461 name: ფინალი - რბოლა 1 start:2026-11-08 09:55:27 stop:2026-11-08 20:00:00
Setanta: 2 name: Heerenveen - Feyenoord start:2026-11-08 11:10:24 stop:2026-11-08 14:15:24
Setanta: 2 name: FC Koln - Bayer Leverkusen start:2026-11-08 14:25:04 stop:2026-11-08 17:30:04
Setanta: 3 name: Napoli - Lazio start:2026-11-08 11:25:07 stop:2026-11-08 13:30:07
Setanta: 3 name: Ipswich - Bournemouth start:2026-11-08 13:55:00 stop:2026-11-08 16:00:00
Setanta: 4 name: ფინალი - რბოლა 2 start:2026-11-08 11:55:02 stop:2026-11-08 20:00:00
Setanta: 5 name: Heidenheim - Hannover start:2026-11-08 12:25:08 stop:2026-11-08 16:30:08
Setanta: 6 name: Elche - Real Betis start:2026-11-08 12:55:31 stop:2026-11-08 16:00:31
Setanta: 7 name: Sunderland - Chelsea start:2026-11-08 13:55:00 stop:2026-11-08 16:00:00
Setanta: 8 name: Brighton - Brentford start:2026-11-08 13:55:00 stop:2026-11-08 16:00:00
Setanta: 9 name: Crystal Palace - Liverpool start:2026-11-08 13:55:00 stop:2026-11-08 16:00:00
Setanta: 10 name: ATP 1000 Paris, Day 7, Court Central, Final start:2026-11-08 13:55:45 stop:2026-11-08 19:00:45`;
const nowMs = Date.UTC(2026, 10, 8, 14, 34);

describe("Setanta stamped imports", () => {
  test("optional programme ID never becomes part of the event or channel", () => {
    const events = parseSportsListingBlock(raw);
    expect(events).toHaveLength(12);
    expect(events[0]).toEqual({ date: "Sunday, 8th November", time: "09:55 UK", title: "ფინალი - რბოლა 1", channels: ["Setanta 1"] });
    expect(events[1]?.channels).toEqual(["Setanta 2"]);
    expect(events.every(safePublicEventTitle)).toBe(true);
  });

  test("Georgian titles pass the check and retain all twelve events on save/read-back", () => {
    const check = checkSportsImport(raw, "gmt", nowMs);
    expect(check.errors).toBe(0);
    expect(check.warnings).toBe(0);
    expect(check.events).toHaveLength(12);
    expect(check.events[0]?.title).toBe("ფინალი - რბოლა 1");
    expect(check.events[3]?.title).toBe("ფინალი - რბოლა 2");
    const saved = formatSportsListingBlock({ raw, date: null, time: null, channels: [], sourceZone: "gmt", nowMs });
    expect(parseSportsListingBlock(saved)).toEqual(check.events);
    expect(checkSportsImport(saved ?? "", "gmt", nowMs).errors).toBe(0);
  });

  test("channel-as-title and short junk names remain blocked", () => {
    expect(safePublicEventTitle({ date: null, time: "09:55", title: "Setanta 1", channels: ["Setanta 1"] })).toBe(false);
    expect(checkSportsImport("8 November\n09:55 UK\n!!\nSetanta 1", "gmt", nowMs).errors).toBeGreaterThan(0);
  });
});