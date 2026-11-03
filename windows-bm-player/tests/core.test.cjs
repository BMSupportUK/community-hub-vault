const {test,expect}=require('bun:test');
const c=require('../core.cjs');
test('latest uploaded is default',()=>expect(c.sortItems([{name:'A',added:1},{name:'Z',added:2}])[0].name).toBe('Z'));
test('adult entries stay out of recently watched',()=>expect(c.adult('18+ Adult')).toBe(true));
test('part watched offers resume',()=>expect(c.resume(120,600)).toBe(true));
test('finished items do not resume',()=>expect(c.resume(600,600)).toBe(false));
test('watch bar calculates percentage',()=>expect(c.progress(120,600)).toBe(20));
test('three inactive hours prompts',()=>expect(c.inactive(0,0,10800000)).toBe('prompt'));
test('one minute unanswered exits',()=>expect(c.inactive(0,10800000,10860000)).toBe('exit'));
test('single room live URL encodes credentials',()=>expect(c.streamUrls('https://test.invalid','a b','p&',{kind:'live',id:7})[0]).toBe('https://test.invalid/live/a%20b/p%26/7.ts'));
test('catch up only on provider archive channels', () => {
  const core = require('../core.cjs');
  assert.equal(core.itemFromProvider('live', { stream_id: 1, name: 'A', tv_archive: 1, tv_archive_duration: 7 }).archive, 7);
  assert.equal(core.itemFromProvider('live', { stream_id: 2, name: 'B', tv_archive: 0 }).archive, 0);
  assert.equal(core.itemFromProvider('live', { stream_id: 3, name: 'C' }).archive, 0);
});
test('catch up timeshift url uses UK start time and length', () => {
  const core = require('../core.cjs');
  const start = Date.UTC(2026, 6, 1, 19, 0), end = start + 90 * 60000; // 20:00 BST
  assert.equal(core.catchupUrl('http://x.tv/', 'u', 'p', 9, start, end), 'http://x.tv/timeshift/u/p/90/2026-07-01:20-00/9.ts');
  assert.deepEqual(core.streamUrls('http://x.tv', 'u', 'p', { kind: 'catchup', id: 9, start, end }), ['http://x.tv/timeshift/u/p/90/2026-07-01:20-00/9.ts']);
});
