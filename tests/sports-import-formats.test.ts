import { describe, expect, test } from "bun:test";
import { checkSportsImport } from "../src/lib/sports-import-check";
import { formatSportsListingBlock, parseSportsListingBlock } from "../src/lib/sports-listing-format";

describe("remembered sports import layouts", () => {
  test("WST title above dual UK/ET time keeps both snooker sessions correctly paired", () => {
    const raw = `-

**## WST**

**Shenzhen Open**
\`7:00am UK | 2:00am ET\`

TNT Sports 1 & 2

**Shenzhen Open**
\`12:30pm UK | 7:30pm ET\`

TNT Sports 1 & 2`;

    const result = checkSportsImport(raw, "gmt", Date.UTC(2026, 8, 28, 6), "Snooker");

    expect(result.errors).toBe(0);
    expect(result.warnings).toBe(0);
    expect(result.events).toEqual([
      {
        date: "Monday, 28th September",
        time: "07:00 BST",
        title: "WST: Shenzhen Open",
        channels: ["TNT Sports 1", "TNT Sports 2"],
      },
      {
        date: "Monday, 28th September",
        time: "12:30 BST",
        title: "WST: Shenzhen Open",
        channels: ["TNT Sports 1", "TNT Sports 2"],
      },
    ]);

    const formatted = formatSportsListingBlock({ raw, sourceZone: "gmt", guideTitle: "Snooker" });
    expect(formatted).not.toBeNull();
    expect(parseSportsListingBlock(formatted)).toEqual(result.events);
  });

  test("Triller numbered events retain their numbered channel", () => {
    const result = parseSportsListingBlock("Triller TV | Event 4: Highland Boxing: Resurgence 2026 10:00");
    expect(result).toEqual([{ date: null, time: "10:00", title: "Highland Boxing: Resurgence 2026", channels: ["Triller TV 4"] }]);
  });

  test("NFL Sunday Ticket uses the stated UK time and next-line fixture", () => {
    const result = parseSportsListingBlock("US | NFL Sunday Ticket\nNFL 02: 1pm ET | 6pm UK\nFalcons @ Packers");
    expect(result).toEqual([{ date: null, time: "6pm", title: "Falcons v Packers", channels: ["NFL 02"] }]);
  });

  test("UFC multi-time slots each retain the complete channel set", () => {
    const result = parseSportsListingBlock("**UFC Fight Night: A vs. B**\n`10pm | 11pm | 1am UK`\nUFC 01\nUFC 02\nUFC 03");
    expect(result).toHaveLength(3);
    expect(result.every((event) => event.channels.join("|") === "UFC 01|UFC 02|UFC 03")).toBe(true);
  });
});