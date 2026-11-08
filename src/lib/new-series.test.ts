// @ts-nocheck — bun:test is used only by the test runner.
import { expect, test } from 'bun:test';
import { groupNewSeries, groupPlaylistNewSeries, newSeriesCutoff, newSeriesMonthCount, newSeriesYears } from './new-series';
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
test('year pills run newest first from the current year', () => {
  expect(newSeriesYears(2026)).toEqual([2026, 2025, 2024, 2023, 2022, 2021]);
});
test('a past year runs to its last day while the current year stops at today', () => {
  expect(newSeriesCutoff(2025, '2026-11-08')).toBe('2025-12-31');
  expect(newSeriesCutoff(2026, '2026-11-08')).toBe('2026-11-08');
});
test('past years look up all twelve months, the current year only the months reached', () => {
  expect(newSeriesMonthCount(2025, '2026-11-08')).toBe(12);
  expect(newSeriesMonthCount(2026, '2026-11-08')).toBe(11);
});
test('a past year keeps its own December premieres and drops the next year', () => {
  const groups = groupNewSeries([series(1, '2025-12-30'), series(2, '2026-01-01')], newSeriesCutoff(2025, '2026-11-08'));
  expect(groups[11].items.map(s => s.id)).toEqual(['1']);
  expect(groups[11].items[0].year).toBe('2025');
  expect(groups[0].items).toEqual([]);
});test('playlist new series group by releaseDate, skip adult categories and keep playlist ids', () => {
  const rows = [{ series_id: 11, name: 'Show A', releaseDate: '2026-03-04', category_id: '1' }, { series_id: 12, name: 'Show B', releaseDate: '2026-03-09', category_id: '99' }, { series_id: 13, name: 'Show C', releaseDate: '2025-03-01', category_id: '1' }];
  const groups = groupPlaylistNewSeries(rows, '2026-11-08', new Set(['99']));
  expect(groups[2].items.map(s => s.id)).toEqual(['11']);
  expect(groups.flatMap(g => g.items)).toHaveLength(1);
});
