// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { describe, expect, test } from "bun:test";
import { buildIndex, matchChannel, xmltvTime, XmltvReader, feedsFor, eventListings, overlayEvents, stripQualityTail, needsSportsEvents, NO_EVENT, type EpgChannel, type EpgProgramme } from "./real-epg";

const uk = buildIndex([
  { id: "SkySpMainEvHD.uk", names: ["SkySpMainEvHD"] },
  { id: "Sky.Sports.Football.HD.uk", names: ["Sky Sports Football HD"] },
  { id: "TNT.Sports.1.HD.uk", names: ["TNT Sports 1 HD"] },
  { id: "U.and.Dave.HD.uk", names: ["U and Dave HD"] },
  { id: "ITV1+1.uk", names: ["ITV1+1"] },
  { id: "ITV1.HD.uk", names: ["ITV1 HD"] },
]);

describe("real guide channel matching", () => {
  test("American local categories use local listings without changing national feeds", () => {
    expect(feedsFor("ABC: Atlanta GA WSB-TV", "US | ABC Locals")).toEqual(["US_LOCALS1", "US2"]);
    expect(feedsFor("ESPN", "US | Sports")).toEqual(["US2", "US_SPORTS1"]);
  });
  test("local callsigns anywhere in labels select the main station, never another city's network or subchannel", () => {
    const idx = buildIndex([{ id: "WSB-DT2.us_locals1", names: ["WSB-DT2"] }, { id: "WSB-DT.us_locals1", names: ["WSB-DT"] }, { id: "KVUE-DT.us_locals1", names: ["KVUE-DT"] }]);
    expect(matchChannel("abc: Atlanta GA wsb-tv", idx)).toBe("WSB-DT.us_locals1");
    expect(matchChannel("ABC: Austin KVUE", idx)).toBe("KVUE-DT.us_locals1");
    expect(matchChannel("ABC: Unknown City", idx)).toBe(null);
  });
  test("ordinary channels bypass sports builds but unknown passes keep website events", () => {
    expect(needsSportsEvents("ABC: Atlanta GA WSB-TV", false, false)).toBe(false);
    expect(needsSportsEvents("BBC One | FHD |", false, false)).toBe(false);
    expect(needsSportsEvents("Sky Sports Main Event", true, false)).toBe(false);
    expect(needsSportsEvents("Coupang | Event 1", false, true)).toBe(true);
    expect(needsSportsEvents("A new sports pass", false, false)).toBe(true);
  });
  test("playlist quality tags and guide abbreviations match the same channel", () => {
    expect(matchChannel("Sky Sports Main Event | FHD |", uk)).toBe("SkySpMainEvHD.uk");
    expect(matchChannel("Sky Sports Football | NowTV |", uk)).toBe("Sky.Sports.Football.HD.uk");
    expect(matchChannel("TNT Sport 1 | HD |", uk)).toBe("TNT.Sports.1.HD.uk");
    expect(matchChannel("Dave | FHD |", uk)).toBe("U.and.Dave.HD.uk");
  });
  test("+1 channels never take the main channel's listings", () => {
    expect(matchChannel("ITV 1 +1 | HD |", uk)).toBe("ITV1+1.uk");
    expect(matchChannel("ITV 1 | FHD |", uk)).toBe("ITV1.HD.uk");
  });
  test("each channel searches only its own country's guides", () => {
    expect(feedsFor("ESPN", "US | Sports")).toEqual(["US2", "US_SPORTS1"]);
    expect(feedsFor("TSN 1", "CA | Canadian")).toEqual(["CA2"]);
    expect(feedsFor("Sky Sports Main Event", "UK | Sky Sports")).toEqual(["UK1"]);
    expect(feedsFor("beIN Sports 1", "FR | French Sport")).toEqual(["FR1"]);
    expect(feedsFor("Masters of Sex", "24/7 | Movies/Series")).toEqual([]);
  });
  test("24/7 quality tails are not event feeds, numbered event feeds keep their pipe", () => {
    expect(stripQualityTail("BBC One | FHD |")).toBe("BBC One");
    expect(stripQualityTail("UFC 04 |")).toBe("UFC 04 |");
  });
});

describe("guide times", () => {
  test("XMLTV times are stored in UTC across the clock change", () => {
    expect(xmltvTime("20261107000000 +0000")).toBe(Date.UTC(2026, 10, 7, 0, 0));
    expect(xmltvTime("20260701190000 +0100")).toBe(Date.UTC(2026, 6, 1, 18, 0));
    expect(xmltvTime("20261108190000 -0500")).toBe(Date.UTC(2026, 10, 9, 0, 0));
  });
  test("streamed guide splits across chunks", () => {
    const xml = `<tv><channel id="A.uk"><display-name>A One</display-name></channel><programme channel="A.uk" start="20261108120000 +0000" stop="20261108130000 +0000"><title>News &amp; Weather</title><desc>Today</desc></programme></tv>`;
    const r = new XmltvReader(); const cs: EpgChannel[] = []; const ps: EpgProgramme[] = [];
    for (let i = 0; i < xml.length; i += 7) r.push(xml.slice(i, i + 7), (c) => cs.push(c), (p) => ps.push(p));
    expect(cs).toEqual([{ id: "A.uk", names: ["A One"] }]);
    expect(ps).toHaveLength(1);
    expect(ps[0].title).toBe("News & Weather");
    expect(ps[0].stop - ps[0].start).toBe(3600_000);
  });
});

describe("Sports Pass listings from the Sports Guide", () => {
  const h = 3600_000, t0 = Date.UTC(2026, 10, 8, 12);
  const events = [{ title: "Buatsi v Hutchinson", start: t0 + 2 * h, end: t0 + 5 * h, channels: ["DAZN 1 (CA | Main)"] }];
  test("events fill their slot and gaps read No event scheduled", () => {
    const l = eventListings("dazn 1 (ca | main)", events, t0, t0 + 8 * h);
    expect(l.map((p) => p.title)).toEqual([NO_EVENT, "Buatsi v Hutchinson", NO_EVENT]);
    expect(l[1].start).toBe(t0 + 2 * h);
    expect(l[1].stop).toBe(t0 + 5 * h);
  });
  test("a Sports Guide event replaces overlapping published programmes", () => {
    const real = [{ start: t0, stop: t0 + 3 * h, title: "Old" }, { start: t0 + 6 * h, stop: t0 + 7 * h, title: "Later" }];
    expect(overlayEvents(real, [{ start: t0 + 2 * h, stop: t0 + 5 * h, title: "Fight" }]).map((p) => p.title)).toEqual(["Fight", "Later"]);
  });
});

import { matchChannel as mc2 } from "./real-epg";
test("BBC One falls back to the London guide when only regional versions exist", () => {
  const idx = new Map([["bbconelon", "BBC.One.Lon.HD.uk"]]);
  expect(mc2("BBC One | FHD |", idx)).toBe("BBC.One.Lon.HD.uk");
});
