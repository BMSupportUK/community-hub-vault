const {describe,test,expect}=require('bun:test');
const {groupedResults}=require('../live-voice-search.cjs');
const now=Date.UTC(2026,10,8,14);
const categories=[{id:'uk',name:'UK | Sky Sports'},{id:'nz',name:'NZ | Sky Sport'},{id:'empty',name:'Sky Sports empty'}];
const channels=[{id:'1',name:'UK | Sky Sports Main Event',category:'uk'},{id:'2',name:'NZ | Sky Sport 1 HD',category:'nz'},{id:'3',name:'NZ | Sky News',category:'nz'}];
const event={title:'Middlesbrough v Derby',competition:'Championship',channels:['Sky Sports Football'],start:now-1000,end:now+3600000};
describe('Live TV voice result groups',()=>{
 test('all three groups retain distinct actionable payloads and NZ sport matching',()=>{
  const result=groupedResults(categories,channels,[event],'Show me Sky Sports',now);
  expect(result.categories.map(c=>c.id)).toEqual(['uk','nz']);
  expect(result.channels.map(c=>c.id)).toEqual(['1','2']);
  expect(result.events).toEqual([event]);
 });
 test('event queries match spaced names and exclude completed events',()=>{
  const gp={...event,title:'MotoGP Valencia',channels:[]};
  expect(groupedResults(categories,channels,[gp,{...gp,end:now}],'Moto GP',now).events).toEqual([gp]);
  expect(groupedResults(categories,channels,[event],'Middlesbrough',now).events).toEqual([event]);
 });
 test('filler-only voice returns no accidental whole-playlist results',()=>{
  expect(groupedResults(categories,channels,[event],'Please show me live TV channels',now)).toEqual({categories:[],channels:[],events:[]});
 });
 test('channel result order and more than 200 matches survive grouping',()=>{
  const many=Array.from({length:205},(_,i)=>({id:String(i),name:'Sky Sports '+i,category:'uk'}));
  expect(groupedResults(categories,many,[],'sky sports',now).channels).toEqual(many);
 });
});