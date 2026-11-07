const test=require('node:test');const assert=require('node:assert');const c=require('../checkin.cjs');
test('jitter stays within ±20%',()=>{assert.equal(c.jitter(60000,0.2,()=>0),48000);assert.equal(c.jitter(60000,0.2,()=>1),72000);});
test('backoff doubles and caps at 5 minutes',()=>{assert.equal(c.backoff(1,60000,300000,()=>0.5),120000);assert.equal(c.backoff(8,60000,300000,()=>0.5),300000);});
test('Retry-After seconds parsed',()=>{assert.equal(c.retryAfterMs('30'),30000);assert.equal(c.retryAfterMs(null),0);});
test('slowdown scales delay and success resets backoff',()=>{c.ok();c.setSlow(3);assert.equal(c.nextDelay(60000,()=>0.5),180000);c.fail();assert.equal(c.nextDelay(60000,()=>0.5),300000);c.ok();c.setSlow(1);assert.equal(c.nextDelay(60000,()=>0.5),60000);});
