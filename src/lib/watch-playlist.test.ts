// @ts-nocheck — bun:test is used only by the test runner.
import { expect, test } from 'bun:test';
import { watchCategoryIds, mapWatchTitle, newestWatchRows } from './watch-playlist';
test('Cinema films put the newest playlist addition first, regardless of release year', () => {
  const rows = [{stream_id:1,name:'New release (2026)',added:'100'}, {stream_id:2,name:'Older film (1999)',added:'300'}, {stream_id:3,added:'200'}, {stream_id:4}];
  expect(newestWatchRows(rows, 'movie').map(r => r.stream_id)).toEqual([2,3,1,4]);
  expect(rows[0].stream_id).toBe(1);
});
test('Recommended series put the latest playlist timestamp first', () => {
  expect(newestWatchRows([{series_id:1,last_modified:'100'}, {series_id:2,last_modified:'300'}, {series_id:3,last_modified:'invalid'}], 'series').map(r => r.series_id)).toEqual([2,1,3]);
});
test('playlist dates accept seconds, milliseconds and ISO dates with stable missing dates', () => {
  expect(newestWatchRows([{stream_id:1,added:'2026-11-08T12:00:00Z'}, {stream_id:2,added:1794139201000}, {stream_id:3,added:1794139199}, {stream_id:4}, {stream_id:5}], 'movie').map(r => r.stream_id)).toEqual([2,1,3,4,5]);
});
test('films come only from Cinema, not Recommended Movies or live Cinema channels', () => {
  expect(watchCategoryIds([{category_id:452,category_name:'Cinema'},{category_id:661,category_name:'Recommended Movies'},{category_id:1,category_name:'Sky Cinema'}], 'movie')).toEqual(['452']);
});
test('series come only from Recommended Series', () => {
  expect(watchCategoryIds([{category_id:662,category_name:'Recommended Series'},{category_id:1,category_name:'All Series'}], 'series')).toEqual(['662']);
});
test('both kinds use the same poster rating and description fields', () => {
  const movie = mapWatchTitle({stream_id:1,name:'Elio (2025)',stream_icon:'https://example.org/poster.jpg',rating:'6.809',plot:'A space adventure'}, 'movie');
  const series = mapWatchTitle({series_id:2,name:'Rome',cover:'https://example.org/poster.jpg',rating_5based:4,plot:'Ancient Rome',releaseDate:'2005-08-28'}, 'series');
  expect(movie).toMatchObject({title:'Elio',year:'2025',rating:6.8,overview:'A space adventure',posterUrl:'https://example.org/poster.jpg'});
  expect(series).toMatchObject({year:'2005',rating:8,overview:'Ancient Rome',posterUrl:'https://example.org/poster.jpg'});
});