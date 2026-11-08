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