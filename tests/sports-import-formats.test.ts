import { describe, expect, test } from "bun:test";
import { checkSportsImport } from "../src/lib/sports-import-check";
import { formatSportsListingBlock, parseSportsListingBlock } from "../src/lib/sports-listing-format";
import { snapSplitToHeading, splitSportsListingAtLine } from "../src/lib/discord-import.functions";

describe("remembered sports import layouts", () => {
  test("manual split never jumps backwards to an unrelated post heading", () => {
    const lines = [
      "-", "", "**## OTHER SPORT: MONDAY 28 SEPTEMBER**", "",
      "`11:05am UK / 6:05am ET`", "GREYHOUND RACING: Romford", "UK: Sky Sports Racing", "",
      "`6:00pm UK / 1:00pm ET`", "ULTIMATE POOL: Mixed Team", "UK: TNT Sports 1",
    ];
    expect(snapSplitToHeading(lines, 8)).toBe(8);
    expect(snapSplitToHeading(lines, 3)).toBe(2);
  });

  test("recovered escaped Greyhound and Ultimate Pool posts survive split and final read-back", () => {
    const original = "-\\n\\n**## OTHER SPORT: MONDAY 28 SEPTEMBER**\\n\\n`11:05am UK / 6:05am ET`\\nGREYHOUND RACING: Romford\\nUK: Sky Sports Racing\\n\\n`6:00pm UK / 1:00pm ET`\\nULTIMATE POOL: Mixed Team\\nUK: TNT Sports 1\\nAustralia: Fox Sports More 507";
    const splitLine = original.replace(/\\n/g, "\n").split("\n").findIndex((line) => line.includes("6:00pm"));
    const parts = splitSportsListingAtLine(original, splitLine);
    const expected = [
      { guide: "Greyhound Racing", time: "11:05 BST", title: "GREYHOUND RACING: Romford", channels: ["UK: Sky Sports Racing"] },
      { guide: "Pool", time: "18:00 BST", title: "ULTIMATE POOL: Mixed Team", channels: ["UK: TNT Sports 1", "Australia: Fox Sports More 507"] },
    ];

    expect(parts).toHaveLength(2);
    parts.forEach((raw, index) => {
      const item = expected[index];
      const result = checkSportsImport(raw, "gmt", Date.UTC(2026, 8, 28, 8), item.guide);
      expect(result.errors).toBe(0);
      expect(result.warnings).toBe(0);
      expect(result.events).toEqual([{ date: "Monday, 28th September", time: item.time, title: item.title, channels: item.channels }]);
      expect(parseSportsListingBlock(result.formatted)).toEqual(result.events);
    });
  });

  test("WST title above dual UK/ET time keeps both snooker sessions correctly paired", () => {
    const raw = `-

**## WST**

Monday, 28th September

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

  test("Asian Games title above dual UK/ET time keeps both beIN channels", () => {
    const raw = `-

**## ASIAN GAMES**

Monday, 28th September

**Aichi Nagoya 2026**
\`11:00pm UK | 6:00pm ET\`

beIN Sports English 1 & 2`;
    const result = checkSportsImport(raw, "gmt", Date.UTC(2026, 8, 28, 8), "Asian Games");

    expect(result.errors).toBe(0);
    expect(result.warnings).toBe(0);
    expect(result.events).toEqual([
      {
        date: "Monday, 28th September",
        time: "23:00 BST",
        title: "ASIAN GAMES: Aichi Nagoya 2026",
        channels: ["beIN Sports English 1", "beIN Sports English 2"],
      },
    ]);
    expect(parseSportsListingBlock(result.formatted)).toEqual(result.events);
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

  test("merged DAZN inline fixtures and venue qualifiers stay as separate events", () => {
    const rows = [
      ["Eagles @ Bears", "1:12 AM", "Dazn 2 HD"], ["Eagles @ Bears (In French)", "1:12 AM", "Dazn 3 HD"],
      ["Philippines vs. Pakistan", "9:57 AM", "Dazn 1 HD"], ["Thailand vs. Vietnam", "1:27 PM", "Dazn 1 HD"],
      ["Finland vs. Belarus", "4:57 PM", "Dazn 3 HD"], ["Moldova vs. Faroe Islands", "4:57 PM", "Dazn 4 HD"],
      ["Boreham Wood vs. Kidderminster", "6:57 PM", "Dazn 2 HD"], ["Barrow vs. Scunthorpe", "7:42 PM", "Dazn 1 HD"],
      ["San Marino vs. Albania", "7:42 PM", "Dazn 3 HD"], ["Forest Green vs. Wealdstone", "7:42 PM", "Dazn 4 HD"],
      ["Gateshead vs. Altrincham", "7:42 PM", "Dazn 6 HD"], ["Luxembourg vs. Iceland", "7:42 PM", "Dazn 7 HD"],
      ["FC Halifax Town vs. Boston", "7:42 PM", "Dazn 8 HD"], ["Hornchurch vs. Aldershot", "7:42 PM", "Dazn 9 HD"],
      ["Slovakia vs. Kazakhstan", "7:42 PM", "Dazn 11 HD"], ["Spain vs. Croatia", "7:42 PM", "Dazn 12 HD"],
      ["Slovenia vs. North Macedonia", "7:42 PM", "Dazn 13 HD"], ["Yeovil vs. Worthing", "7:42 PM", "Dazn 14 HD"],
      ["Bulgaria vs. Estonia", "7:42 PM", "Dazn 15 HD"], ["Fylde vs. Carlisle", "7:42 PM", "Dazn 16 HD"],
      ["Woking vs. Solihull Moors", "7:42 PM", "Dazn 17 HD"], ["Scotland vs. Switzerland", "7:42 PM", "Dazn 18 HD"],
      ["Hartlepool vs. Harrogate", "7:42 PM", "Dazn 19 HD"],
    ];
    const ordinary = rows.map(([title, time, channel]) => `${title}\n- 29-09-2026 ${time} until 29-09-2026 10:02 PM - ${channel}`);
    const raw = ["# DAZN", "`Tuesday, 29th September`", ...ordinary.slice(0, 4),
      "U15 Baseball World Cup 2026 - Day 5\n- Beto Avila - 29-09-2026 4:27 PM until 29-09-2026 6:47 PM - Dazn 2 HD",
      ...ordinary.slice(4, 6),
      "U15 Baseball World Cup 2026 - Day 5\n- Kukulkan - 29-09-2026 5:27 PM until 29-09-2026 7:47 PM - Dazn 5 HD",
      ...ordinary.slice(6, 14),
      "Czechia vs. England - 29-09-2026 7:42 PM until 29-09-2026 10:02 PM - Dazn 10 HD",
      ...ordinary.slice(14),
    ].join("\n");
    const result = checkSportsImport(raw, "gmt", Date.UTC(2026, 8, 29, 7, 25), "DAZN");

    expect(result.errors).toBe(0);
    expect(result.warnings).toBe(0);
    expect(result.events).toHaveLength(26);
    expect(result.events.find((event) => event.channels.includes("Dazn 2 HD") && event.time === "16:27 BST")?.title).toBe("U15 Baseball World Cup 2026 - Day 5 - Beto Avila");
    expect(result.events.find((event) => event.channels.includes("Dazn 5 HD"))?.title).toBe("U15 Baseball World Cup 2026 - Day 5 - Kukulkan");
    expect(result.events.find((event) => event.channels.includes("Dazn 10 HD"))?.title).toBe("Czechia v England");
    expect(parseSportsListingBlock(result.formatted)).toEqual(result.events);
  });

  const rememberedRows: Array<{
    name: string;
    raw: string;
    expected: Partial<{ time: string; title: string; channels: string[] }>;
  }> = [
    {
      name: "Rugby Pass channel-pipe trailing time",
      raw: "Rugby Pass 01 | Lions v Leinster 12:00",
      expected: { time: "12:00", title: "Lions v Leinster", channels: ["Rugby Pass 01"] },
    },
    {
      name: "Super League Plus channel-colon leading time",
      raw: "Super League Plus 01: 20:00 Leeds Rhinos vs Warrington Wolves",
      expected: { time: "20:00", title: "Leeds Rhinos v Warrington Wolves", channels: ["Super League Plus 01"] },
    },
    {
      name: "Cymru channel-first bracketed date",
      raw: "Cymru Football 1 - Barry Town United - Connah’s Quay Nomads [26th Sep - 2:25pm BST]",
      expected: { time: "2:25pm BST", title: "Barry Town United v Connah’s Quay Nomads", channels: ["Cymru Football 1"] },
    },
    {
      name: "Scottish Cup small-letter channel",
      raw: "ˢ ᴾ ᶠ ᴸ Cup 01 | 20:00 Queen of the South vs Rangers II",
      expected: { time: "20:00", title: "Queen of the South v Rangers II", channels: ["SPFL Cup 01"] },
    },
    {
      name: "FA Player compact channel",
      raw: "WF00: 13:30 Charlton Athletic vs Manchester City",
      expected: { time: "13:30", title: "Charlton Athletic v Manchester City", channels: ["WF00"] },
    },
    {
      name: "National League dash and bracketed time",
      raw: "National League 1 - Aldershot vs. Tamworth (3:00 PM)",
      expected: { time: "3:00PM", title: "Aldershot v Tamworth", channels: ["National League 1"] },
    },
    {
      name: "MLB bracketed date",
      raw: "MLB 1 - Mets vs. Nationals [26th Sep - 5:35pm BST]",
      expected: { time: "5:35pm BST", title: "Mets v Nationals", channels: ["MLB 1"] },
    },
    {
      name: "MLB event-name timestamp",
      raw: "MLB event 1 name: Mets x Nationals start:2026-09-27 18:05:00 stop:2026-09-27 21:00:00",
      expected: { time: "18:05 UK", title: "Mets v Nationals", channels: ["MLB 1"] },
    },
    {
      name: "Fubo UK and ET double-slash row",
      raw: "Fubo Sports 1 | Fubo Sports News // UK Sat 26 Sep 11:00am // ET Sat 26 Sep 6:00am",
      expected: { time: "11:00am UK", title: "Fubo Sports News", channels: ["Fubo Sports 1"] },
    },
    {
      name: "Coupang UK and ET double-slash row",
      raw: "Coupang 1 | Azerbaijan Grand Prix Race // UK Sat 26 Sep 11:15am // ET Sat 26 Sep 6:15am",
      expected: { time: "11:15am UK", title: "Azerbaijan Grand Prix Race", channels: ["Coupang 1"] },
    },
    {
      name: "Setanta numbered timestamp",
      raw: "Setanta: 1: Panathinaikos - Paris start:2026-09-25 19:10:00 stop:2026-09-25 21:00:00",
      expected: { time: "19:10 UK", title: "Panathinaikos v Paris", channels: ["Setanta 1"] },
    },
    {
      name: "Stan named event timestamp",
      raw: "Stan event: EventS1 name: Harlequins v Bath - PREM Rugby Round 1 start:2026-09-25 19:40:09 stop:2026-09-25 22:00:00",
      expected: { time: "19:40 UK", title: "Harlequins v Bath - PREM Rugby Round 1", channels: ["Stan Event S1"] },
    },
    {
      name: "NHL Center Ice next-line fixture",
      raw: "US | NHL Center Ice\nNHL | 01 - 7pm ET | 12am UK\nBruins at Capitals",
      expected: { time: "12am UK", title: "Bruins at Capitals", channels: ["NHL 01"] },
    },
  ];

  for (const fixture of rememberedRows) {
    test(fixture.name, () => {
      const result = parseSportsListingBlock(fixture.raw);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject(fixture.expected);
    });
  }
});