const {test,expect}=require('bun:test');const assert={equal:(a,b)=>expect(a).toBe(b),deepEqual:(a,b)=>expect(a).toEqual(b),ok:(v)=>expect(!!v).toBe(true)};
const r=require('../stream-recovery.cjs');
test('DAZN Unicode detection and 30-second live cushion do not change other channels',()=>{expect(r.isDazn('ᴰᴬᶻᴺ ¹ 18 (CA | Main)')).toBe(true);expect(r.isDazn('19 | BKFC 96')).toBe(false);expect(r.liveBufferMs(3000,'DAZN CA')).toBe(30000);expect(r.liveBufferMs(3000,'BBC One')).toBe(12000);expect(r.profile('DAZN CA')).toEqual({min:40000,max:90000,start:3000,rebuffer:6000,live:30000,reconnect:6000,swap:1});});
test('DAZN reconnects after 6 seconds and immediately on stream end',()=>{const s={item:{name:'DAZN CA 19'}};r.tick(s,3,1000,true);r.tick(s,2,2000,true);expect(r.tick(s,2,7999,true).reconnect).toBeUndefined();expect(r.tick(s,2,8000,true).reconnect).toBe(1000);const ended={item:{name:'DAZN CA 19'},ready:true};expect(r.tick(ended,6,5000,true).reconnect).toBe(0);});
test('Coupang Play feeds get the same large-buffer profile as DAZN',()=>{expect(r.isCoupang('Coupang Play 1')).toBe(true);expect(r.isCoupang('COUPANG PLAY 05')).toBe(true);expect(r.isCoupang('BBC One')).toBe(false);expect(r.profile('Coupang Play 5')).toEqual(r.profile('DAZN CA'));expect(r.liveBufferMs(3000,'Coupang Play 1')).toBe(30000);expect(r.providerTag('Coupang Play 1')).toBe('coupang');expect(r.providerTag('DAZN CA')).toBe('dazn');expect(r.providerTag('BBC One')).toBe(null);const s={item:{name:'Coupang Play 2'}};r.tick(s,3,1000,true);r.tick(s,2,2000,true);expect(r.tick(s,2,7999,true).reconnect).toBeUndefined();expect(r.tick(s,2,8000,true).reconnect).toBe(1000);const ended={item:{name:'Coupang Play 2'},ready:true};expect(r.tick(ended,6,5000,true).reconnect).toBe(0);});
test('three DAZN stalls in two minutes offer another feed only once',()=>{const s={item:{name:'DAZN CA 19'}};r.tick(s,3,1000,true);const stall=t=>{r.tick(s,2,t,true);return r.tick(s,3,t+2000,true);};expect(stall(5000).offerFeed).toBeUndefined();expect(stall(15000).offerFeed).toBeUndefined();expect(stall(25000).offerFeed).toBe(true);expect(stall(35000).offerFeed).toBeUndefined();const expired={item:{name:'DAZN CA 19'},ready:true,stallTimes:[1000,10000],stallAt:150000};expect(r.tick(expired,3,152000,true).offerFeed).toBeUndefined();});
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
test('high-bitrate streams get the DAZN large-buffer profile',()=>{expect(r.profile('Sky Sports Main Event UHD')).toEqual(r.profile('DAZN CA'));expect(r.cushioned('TNT Sports 1 FHD')).toBe(true);expect(r.liveBufferMs(3000,'Eurosport 4K')).toBe(30000);expect(r.providerTag('Sky Cinema UHD')).toBe('high_bitrate');expect(r.cushioned('BBC One HD')).toBe(false);});
test('measured heavy formats and remembered channels',()=>{expect(r.heavyFormat(1920,1080,50,6000000)).toBe(true);expect(r.heavyFormat(1920,1080,25,5000000)).toBe(false);expect(r.heavyFormat(3840,2160,25,0)).toBe(true);expect(r.heavyFormat(1280,720,50,9000000)).toBe(true);r.loadHeavy([]);expect(r.cushioned('ITV1 HD')).toBe(false);expect(r.rememberHeavy('ITV1 HD')).toBe(true);expect(r.cushioned('ITV1 HD')).toBe(true);expect(r.heavyList()).toEqual(['itv1 hd']);r.loadHeavy([]);});
