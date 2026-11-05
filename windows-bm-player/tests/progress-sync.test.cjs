const {test,expect}=require('bun:test');
const p=require('../progress-sync.cjs');
test('only films, episodes and series sync, in milliseconds',()=>{
 expect(p.toRemote('abc:film:1',{position:12.5,duration:100,at:5})).toMatchObject({key:'film:1',position_ms:12500,duration_ms:100000,updated_at:5});
 expect(p.toRemote('abc:live:1',{position:1,duration:2,at:5})).toBe(null);
});
test('newer pulled position replaces the local one, older is ignored',()=>{
 const local={'h:film:1':{position:10,duration:100,at:2000},'h:episode:2':{position:5,duration:50,at:9000}};
 expect(p.mergeRemote(local,'h',[{key:'film:1',position_ms:60000,duration_ms:100000,updated_at:3000},{key:'episode:2',position_ms:1000,duration_ms:50000,updated_at:1000}])).toBe(1);
 expect(local['h:film:1'].position).toBe(60);expect(local['h:episode:2'].position).toBe(5);
});
test('last watched wins even when this device clock is an hour slow', () => {
  const p = require('../progress-sync.cjs');
  const now = Date.now(), slow = -3600000;
  // This device (clock an hour slow) watched 10 minutes ago; another device saved 1 minute ago (server time).
  const progress = { 'h:film:1': { position: 50, duration: 100, at: now + slow - 600000 } };
  expect(p.mergeRemote(progress, 'h', [{ key: 'film:1', position_ms: 80000, duration_ms: 100000, updated_at: now - 60000 }], slow)).toBe(1);
  expect(progress['h:film:1'].position).toBe(80);
});
