const test=require('node:test');const assert=require('node:assert');
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
