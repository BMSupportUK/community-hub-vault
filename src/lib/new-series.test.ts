// @ts-nocheck — bun:test is used only by the test runner.
import { expect, test } from 'bun:test';
import { groupNewSeries } from './new-series';
const series = (id, date, extra = {}) => ({ id, name: `Series ${id}`, first_air_date: date, overview: 'A new drama.', vote_average: 8, vote_count: 100, ...extra });
test('current-year first premieres exclude returning series and future premieres', () => {
  expect(groupNewSeries([series(1, '2026-01-03'), series(2, '2025-01-03'), series(3, '2026-12-03'), series(4, '2026-11-08')], '2026-11-08').flatMap(g => g.items).map(s => s.id)).toEqual(['1', '4']);
});
test('series are grouped by first premiere month across twelve months', () => {
  const groups = groupNewSeries([series(1, '2026-02-03'), series(2, '2026-01-09')], '2026-11-08');
  expect(groups).toHaveLength(12);
  expect(groups[0].items[0].id).toBe('2');
  expect(groups[1].items[0].id).toBe('1');
  expect(groups[11].items).toEqual([]);
});
test('recommendations require 7 out of 10 from twenty ratings and no duplicates', () => {
  const rows = [series(1, '2026-02-03', {vote_average: 6.9}), series(2, '2026-02-03', {vote_count: 19}), series(3, '2026-02-03', {vote_average: 7, vote_count: 20}), series(3, '2026-02-03')];
  expect(groupNewSeries(rows, '2026-11-08')[1].items.map(s => s.id)).toEqual(['3']);
});
test('current year rolls forward automatically', () => {
  expect(groupNewSeries([series(1, '2026-02-03'), series(2, '2027-01-01')], '2027-01-02')[0].items.map(s => s.id)).toEqual(['2']);
});