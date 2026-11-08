const {test,expect}=require('bun:test');
const {REFRESH_MS,due}=require('../guide-refresh.cjs');
test('open EPG refreshes website fixtures each minute',()=>{
 expect(REFRESH_MS).toBe(60000);
 expect(due(1000,60999)).toBe(false);
 expect(due(1000,61000)).toBe(true);
});
test('unfetched and failed rows can retry',()=>{
 expect(due(undefined,1000)).toBe(true);
 expect(due(1000,121000)).toBe(true);
});