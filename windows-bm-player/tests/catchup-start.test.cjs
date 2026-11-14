const {test,expect}=require('bun:test');
const c=require('../catchup-start.cjs');
const core=require('../core.cjs');
const item={kind:'catchup',id:'7',start:Date.UTC(2026,10,14,10),end:Date.UTC(2026,10,14,11)};
test('catch-up opens two minutes after the listing until a channel start is learned',()=>{
 expect(c.offset({},'one')).toBe(2);
 expect(c.recording(item,2).start).toBe(item.start+120000);
});
test('each two-minute skip advances from the current recording, not the listed start',()=>{
 const first=c.target(120,0,120,item);
 const second=c.target(first*60,0,120,item);
 expect(first).toBe(4);expect(second).toBe(6);
 expect(c.target(second*60,0,-60,item)).toBe(5);
 expect(c.target(second*60,0,60,item)).toBe(7);
});
test('channel memory is separate for provider login and channel',()=>{
 const a=core.watchKey('https://example.test','a','live','7');
 const b=core.watchKey('https://example.test','b','live','7');
 const other=core.watchKey('https://example.test','a','live','8');
 const memory=JSON.parse(JSON.stringify({[a]:c.learned(6)}));
 expect(c.offset(memory,a)).toBe(6);expect(c.offset(memory,b)).toBe(2);expect(c.offset(memory,other)).toBe(2);
});
test('the shifted recording retains the full programme length and never extends into the future',()=>{
 const r=c.recording(item,6);expect(r.end-r.start).toBe(3600000);
 expect(c.recording(item,6,item.end+60000).end).toBe(item.end+60000);
});
test('skips stop at the recording boundary and learned starts are capped at twenty minutes',()=>{
 expect(c.target(3500,0,120,item)).toBe(59);expect(c.target(0,0,-60,item)).toBe(0);
 expect(c.learned(25)).toBe(20);
});