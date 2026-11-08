// @ts-nocheck — tests run with bun test.
import { expect, test } from 'bun:test';
import { categoryFeeds, refreshNeeded } from './epg-demand';
test('opening UK requests only UK, not other countries', () => {
  expect(categoryFeeds('UK | Entertainment')).toEqual(['UK1']);
  expect(categoryFeeds('CA | Canadian')).toEqual(['CA2']);
});
test('All and favourites never request every country', () => {
  for (const c of ['All', '*', 'Favourites', 'VIP | DAZN', '24/7 | Shows']) expect(categoryFeeds(c)).toEqual([]);
});
test('American locals request station guides as well as national fallback', () => {
  expect(categoryFeeds('US | ABC Locals')).toEqual(['US_LOCALS1','US2']);
});
test('only successful updates count toward six-hour freshness', () => {
  const now = Date.UTC(2026,10,8,13);
  expect(refreshNeeded(null, now)).toBe(true);
  expect(refreshNeeded(new Date(now-6*3600_000+1).toISOString(),now)).toBe(false);
  expect(refreshNeeded(new Date(now-6*3600_000).toISOString(),now)).toBe(true);
});