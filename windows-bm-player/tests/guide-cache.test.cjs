const {test,expect}=require('bun:test');
const {createGuideCache}=require('../guide-refresh.cjs');
test('returning from playback keeps listings and does not repeat a fresh request',async()=>{
 let now=1000,calls=0;const cache=createGuideCache(()=>now),rows=[{title:'Match',start:1,end:900000}];
 const fetch=async()=>{calls++;return rows;};
 await cache.load('7',fetch);now+=10000;
 expect(cache.peek('7')).toBe(rows);await cache.load('7',fetch);expect(calls).toBe(1);
});
test('expired listings stay available during one shared background refresh',async()=>{
 let now=0,calls=0,finish;const cache=createGuideCache(()=>now),old=[{title:'Old'}],next=[{title:'Updated'}];
 await cache.load('7',async()=>old);now=60000;
 const fetch=()=>{calls++;return new Promise(resolve=>{finish=resolve;});};
 const first=cache.load('7',fetch),second=cache.load('7',fetch);await Promise.resolve();
 expect(first).toBe(second);expect(calls).toBe(1);expect(cache.peek('7')).toBe(old);
 finish(next);await first;expect(cache.peek('7')).toBe(next);
});
test('failed refresh keeps the good guide and does not hammer retries',async()=>{
 let now=0,calls=0;const cache=createGuideCache(()=>now),rows=[{title:'Match'}];await cache.load('7',async()=>rows);now=60000;
 const fail=async()=>{calls++;throw Error('Offline');};expect(await cache.load('7',fail)).toBe(rows);
 await cache.load('7',fail);expect(calls).toBe(1);expect(cache.peek('7')).toBe(rows);
});
test('login change clears cached listings and ignores previous login requests',async()=>{
 let finish;const cache=createGuideCache();const old=cache.load('7',()=>new Promise(resolve=>{finish=resolve;}));await Promise.resolve();
 cache.clear();const rows=[{title:'New login'}];await cache.load('7',async()=>rows);finish([{title:'Other login'}]);await old;
 expect(cache.peek('7')).toBe(rows);
});test('saved guide shows on next open and still refreshes when seen',async()=>{
 let now=1000;const a=createGuideCache(()=>now);await a.load('7',async()=>[{title:'Old',start:0,end:500},{title:'News',start:500,end:9000000}]);
 const saved=JSON.parse(JSON.stringify(a.snapshot()));
 const b=createGuideCache(()=>now);expect(b.restore(saved)).toBe(1);
 expect(b.peek('7').map(p=>p.title)).toEqual(['News']);expect(b.due('7')).toBe(true);
});
test('a guide saved over 12 hours ago is not shown',()=>{
 let now=0;const a=createGuideCache(()=>now);const saved={saved:0,rows:{'7':[{title:'X',start:0,end:99e9}]}};
 now=12*3600000+1;const b=createGuideCache(()=>now);expect(b.restore(saved)).toBe(0);expect(b.peek('7')).toBeUndefined();
});
