// @ts-nocheck — bun:test is used only by the test runner.
import { expect, test } from 'bun:test';
import { watchCategoryIds, mapWatchTitle } from './watch-playlist';
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