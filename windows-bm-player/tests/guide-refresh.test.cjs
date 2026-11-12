const {test,expect}=require('bun:test');
const {due,createGuideCache}=require('../guide-refresh.cjs');
test('elapsed time never expires loaded programme rows',()=>{
 expect(due(1000,60999)).toBe(false);
 expect(due(1000,61000)).toBe(false);
 expect(due(1000,86400000)).toBe(false);
});
test('only unfetched rows are due until manual invalidation',()=>{
 expect(due(undefined,1000)).toBe(true);
 expect(due(1000,121000)).toBe(false);
});
test('full startup retains more than 400 channels without scrolling reloads',async()=>{
 let now=0,calls=0;const cache=createGuideCache(()=>now);
 const fetch=async id=>{calls++;return [{title:'Programme '+id}];};
 for(let id=0;id<1200;id++)await cache.load(id,fetch);
 now=3600000;
 for(let id=0;id<1200;id++){expect(cache.peek(id)[0].title).toBe('Programme '+id);expect(cache.due(id)).toBe(false);await cache.load(id,fetch);}
 expect(calls).toBe(1200);
});
test('manual refresh permits one new fetch per channel',async()=>{
 const cache=createGuideCache();let calls=0;const fetch=async()=>[{title:String(++calls)}];
 await cache.load(1,fetch);cache.invalidate();await cache.load(1,fetch);await cache.load(1,fetch);
 expect(calls).toBe(2);expect(cache.peek(1)[0].title).toBe('2');
});
test('empty and failed startup rows remain settled until manual refresh',async()=>{
 const cache=createGuideCache();let calls=0;const fail=async()=>{calls++;throw Error('Offline');};
 expect(await cache.load(1,fail)).toEqual([]);expect(await cache.load(1,fail)).toEqual([]);expect(cache.peek(1)).toEqual([]);expect(calls).toBe(1);
 await cache.load(2,async()=>[]);expect(cache.due(2)).toBe(false);
 cache.invalidate();await cache.load(1,fail);expect(calls).toBe(2);
});