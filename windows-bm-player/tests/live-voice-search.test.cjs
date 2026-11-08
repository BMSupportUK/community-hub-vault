const {describe,test,expect}=require('bun:test');
const {groupedResults}=require('../live-voice-search.cjs');
const now=Date.UTC(2026,10,8,14);
const categories=[{id:'uk',name:'UK | Sky Sports'},{id:'nz',name:'NZ | Sky Sport'},{id:'empty',name:'Sky Sports empty'}];
const channels=[{id:'1',name:'UK | Sky Sports Main Event',category:'uk'},{id:'2',name:'NZ | Sky Sport 1 HD',category:'nz'},{id:'3',name:'NZ | Sky News',category:'nz'}];
const event={title:'Middlesbrough v Derby',competition:'Championship',channels:['Sky Sports Football'],start:now-1000,end:now+3600000};
describe('Live TV voice result groups',()=>{
 test('only category and channel groups retain actionable payloads and NZ sport matching',()=>{
  const result=groupedResults(categories,channels,'Show me Sky Sports');
  expect(result.categories.map(c=>c.id)).toEqual(['uk','nz']);
  expect(result.channels.map(c=>c.id)).toEqual(['1','2']);
  expect(Object.keys(result)).toEqual(['categories','channels']);
 });
 test('event-only names produce no Live TV matches',()=>{
  expect(groupedResults(categories,channels,event.title)).toEqual({categories:[],channels:[]});
  expect(groupedResults(categories,channels,'Moto GP')).toEqual({categories:[],channels:[]});
 });
 test('filler-only voice returns no accidental whole-playlist results',()=>{
  expect(groupedResults(categories,channels,'Please show me live TV channels')).toEqual({categories:[],channels:[]});
 });
 test('channel result order and more than 200 matches survive grouping',()=>{
  const many=Array.from({length:205},(_,i)=>({id:String(i),name:'Sky Sports '+i,category:'uk'}));
  expect(groupedResults(categories,many,'sky sports').channels).toEqual(many);
 });
});