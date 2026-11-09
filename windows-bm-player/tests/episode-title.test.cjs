const {test,expect}=require('bun:test');
const {episodeTitle}=require('../episode-title.cjs');

test('episode number and title stay apart so the card can put them on separate lines',()=>{
  expect(episodeTitle({episode:'7',name:'The Long Way Home'})).toEqual({number:'7',title:'The Long Way Home'});
  expect(episodeTitle({episode:'07',name:'E7. The Long Way Home'})).toEqual({number:'07',title:'The Long Way Home'});
});

test('provider placeholder names never duplicate the number line',()=>{
  expect(episodeTitle({episode:'3',name:'Episode 3'})).toEqual({number:'3',title:''});
  expect(episodeTitle({episode:'',name:'Episode 5'})).toEqual({number:'5',title:''});
});

test('missing episode data still labels the card',()=>{
  expect(episodeTitle({episode:null,name:'Pilot'})).toEqual({number:'',title:'Pilot'});
  expect(episodeTitle({})).toEqual({number:'',title:'Episode'});
  expect(episodeTitle(undefined)).toEqual({number:'',title:'Episode'});
});

const { test: t2, expect: e2 } = require('bun:test');
const { episodeTitle: et } = require('../episode-title.cjs');
t2('series name and S01E03 codes are removed from episode titles', () => {
  e2(et({ episode: '3', name: 'Breaking Bad S01E03 - Pilot' }, 'Breaking Bad').title).toBe('Pilot');
  e2(et({ episode: '3', name: 'Breaking Bad (2008) - S01 E03 - Pilot' }, 'Breaking Bad (2008)').title).toBe('Pilot');
  e2(et({ episode: '1', name: 'S02E01 Grilled' }, 'Breaking Bad').title).toBe('Grilled');
});
