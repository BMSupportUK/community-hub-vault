const {test,expect}=require('bun:test');const assert={equal:(a,b)=>expect(a).toBe(b),deepEqual:(a,b)=>expect(a).toEqual(b),ok:(v)=>expect(!!v).toBe(true)};
const r=require('../stream-recovery.cjs');
test('default buffer is the smooth 8 seconds',()=>{assert.equal(r.bufferMs(undefined),8000);assert.equal(r.bufferMs('3000'),3000);assert.equal(r.bufferMs(99999),15000);});
test('backoff doubles and gives up after 8 tries',()=>{assert.deepEqual([1,2,3,7].map(r.backoffMs),[1000,2000,4000,10000]);assert.equal(r.giveUp(8),false);assert.equal(r.giveUp(9),true);});
test('a 12 second stall triggers a reconnect, a short one is reported',()=>{
 const s={item:{name:'Sky Sports HD'}};
 r.tick(s,3,0,true);r.tick(s,2,1000,true);
 assert.equal(r.tick(s,2,12000,true).reconnect,undefined);
 assert.equal(r.tick(s,2,13000,true).reconnect,1000);
 const back=r.tick(s,3,15000,true);assert.equal(back.event.ms,14000);assert.equal(back.event.reconnected,true);
});
test('two stalls lower quality, three on an HD channel offer SD',()=>{
 const s={item:{name:'BBC One HD'}};r.tick(s,3,0,true);
 const run=(t)=>{r.tick(s,2,t,true);return r.tick(s,3,t+2000,true);};
 assert.ok(!run(1000).lower);assert.ok(run(10000).lower);assert.ok(run(20000).offerSd);
});
test('before first play no reconnect happens',()=>{const s={item:{}};assert.deepEqual(r.tick(s,7,50000,true),{});});
test('position stuck 4s while playing is a freeze; paused or moving is not',()=>{
 const T=1e12,s={};r.frozen(s,3,10,T);assert.equal(r.frozen(s,3,10,T+3000),false);assert.equal(r.frozen(s,3,10,T+4100),true);
 const p={};r.frozen(p,4,10,0);assert.equal(r.frozen(p,4,10,9000),false);
 const m={};r.frozen(m,3,1,0);assert.equal(r.frozen(m,3,5,5000),false);
});
test('remembered format goes first',()=>{assert.deepEqual(r.preferFormat(['a.ts','a.m3u8','a'],'m3u8'),['a.m3u8','a.ts','a']);assert.equal(r.otherFormat('x.ts'),'m3u8');});

test('full quality returns after 2 minutes with no stalls', () => {
  const s = { ready: true, lowered: true, stallTimes: [], lastStallAt: 1000 };
  expect(r.tick(s, 3, 1000 + 119000, true).raise).toBeUndefined();
  expect(r.tick(s, 3, 1000 + 120000, true).raise).toBe(true);
  expect(s.lowered).toBe(false);
});

test('live channels always keep at least a 12 second cushion', () => {
  expect(r.liveBufferMs(3000)).toBe(12000);
  expect(r.liveBufferMs(15000)).toBe(15000);
});

test('sky starts on hls unless learned',()=>{assert.equal(r.startFormat(null,'Sky Sports News | NowTV |'),'m3u8');assert.equal(r.startFormat(null,'BBC One'),null);assert.equal(r.startFormat('ts','Sky Cinema'),'ts');});

test('advert switch: size change then stall jumps to live once after 0.8s',()=>{const s={ready:true};r.advertJump(s,1920,1080,3,0,true);r.advertJump(s,1280,720,3,1000,true);s.stallAt=2000;assert.equal(r.advertJump(s,1280,720,2,2300,true),false);assert.equal(r.advertJump(s,1280,720,2,2900,true),true);assert.equal(r.advertJump(s,1280,720,2,3500,true),false);});
test('stall with no recent size change is not an advert',()=>{const s={ready:true};r.advertJump(s,1920,1080,3,0,true);r.advertJump(s,1280,720,3,1000,true);s.stallAt=20000;assert.equal(r.advertJump(s,1280,720,2,21000,true),false);});
