const {test,expect}=require('bun:test');
const p=require('../progress-sync.cjs');
test('only films, episodes and series sync, in milliseconds',()=>{
 expect(p.toRemote('abc:film:1',{position:12.5,duration:100,at:5})).toEqual({key:'film:1',position_ms:12500,duration_ms:100000,updated_at:5});
 expect(p.toRemote('abc:live:1',{position:1,duration:2,at:5})).toBe(null);
});
test('newer pulled position replaces the local one, older is ignored',()=>{
 const local={'h:film:1':{position:10,duration:100,at:2000},'h:episode:2':{position:5,duration:50,at:9000}};
 expect(p.mergeRemote(local,'h',[{key:'film:1',position_ms:60000,duration_ms:100000,updated_at:3000},{key:'episode:2',position_ms:1000,duration_ms:50000,updated_at:1000}])).toBe(1);
 expect(local['h:film:1'].position).toBe(60);expect(local['h:episode:2'].position).toBe(5);
});
