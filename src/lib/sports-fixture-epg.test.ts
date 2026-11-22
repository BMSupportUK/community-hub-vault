// @ts-nocheck — bun:test is only used by the test runner.
import { expect, test } from 'bun:test';
import { sportsFixtureEpg } from './sports-fixture-epg';
import { countryEpgEnabled } from './provider-epg-policy';
const now = Date.parse('2026-11-08T13:33:00Z');
test('Scottish club channel lists the entered fixture, not iFollow/SPFL/EPL placeholders', () => {
  const r = sportsFixtureEpg('SC | Hearts', [{title:'Hearts v Falkirk',start:Date.parse('2026-11-08T15:00:00Z'),end:Date.parse('2026-11-08T17:00:00Z'),channels:['SC | Hearts','SC | Falkirk']}], now);
  expect(r.source).toBe('sports');
  expect(r.epg_listings?.map(p => atob(p.title))).toContain('Hearts v Falkirk');
  expect(r.epg_listings?.find(p => atob(p.title) === 'Hearts v Falkirk')?.start_timestamp).toBe(Date.parse('2026-11-08T15:00:00Z') / 1000);
});
test('ordinary channels keep provider EPG and country downloads stay disabled', () => {
  expect(sportsFixtureEpg('BBC One', [], now)).toEqual({epg_listings:null,source:'none'});
  expect(countryEpgEnabled()).toBe(false);
});
test('main Center Ice 01 gets the website fixture already linked to NHL Set 2 feed 01', () => {
  const start = Date.parse('2026-11-08T18:00:00Z');
  const events = [{title:'Panthers @ Bruins',start,end:start+9000000,competition:'NHL Center Ice',channels:['NHL 01 | Set 2 (Events Only)']}];
  const main = sportsFixtureEpg('NHL Center Ice 01 | (Events Only)',events,now);
  expect(main.source).toBe('sports');
  expect(main.epg_listings?.find(p => atob(p.title) === 'Panthers @ Bruins')?.start_timestamp).toBe(start/1000);
  expect(sportsFixtureEpg('NHL Center Ice 02 | (Events Only)',events,now).epg_listings?.map(p => atob(p.title))).toEqual(['No Event Scheduled']);
  expect(sportsFixtureEpg('NHL Network.',events,now).source).toBe('none');
  expect(events[0].channels).toEqual(['NHL 01 | Set 2 (Events Only)']);
});
test('Center Ice identity ignores changing programme text after the stable feed label', () => {
  const events = [{title:'Panthers @ Bruins',start:Date.parse('2026-11-08T18:00:00Z'),channels:['NHL Center Ice 01 | (Events Only)']}];
  expect(sportsFixtureEpg('NHL 01 | Set 2 (Events Only) | Old replay title',events,now).source).toBe('sports');
  expect(sportsFixtureEpg('NBA 01 | (Events Only)',events,now).epg_listings.map((l:any)=>Buffer.from(l.title,'base64').toString())).toEqual(['No Event Scheduled']);
});
import { sportsFixtureEpg as epg2 } from "./sports-fixture-epg";
test("NFL Sunday Ticket channel with no game gets a No Event Scheduled row, not a blank guide", () => {
  const r: any = epg2("NFL Sunday Ticket 01 |", [], Date.UTC(2026, 10, 22, 12));
  expect(r.source).toBe("sports");
  expect(r.epg_listings.length).toBe(1);
});
test("gap before a later game names that game and its UK start time", () => {
  const now = Date.UTC(2026, 10, 22, 12);
  const r: any = epg2("NFL Sunday Ticket 06 |", [{ title: "Cardinals @ Chiefs", start: Date.UTC(2026, 10, 22, 18), channels: ["NFL Sunday Ticket 06 |"] }], now);
  const first = r.epg_listings[0];
  expect(Buffer.from(first.description, "base64").toString()).toBe("Next: Cardinals @ Chiefs at 18:00");
});

test("every sports pass with no game today shows No Event Scheduled, ordinary channels keep provider guide", () => {
  for (const c of ["Rugby Pass 03", "Coupang Play 16 |", "Peacock 4 | (Events Only)", "ᴰᴬᶻᴺ ¹ 12 (CA | Main)", "NBA League Pass 05 |"]) expect((epg2(c, [], now) as any).source).toBe("sports");
  expect((epg2("Sky Sports Mix | FHD |", [], now) as any).source).toBe("none");
});
