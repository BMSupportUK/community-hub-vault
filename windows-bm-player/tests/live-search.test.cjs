const {test,expect}=require('bun:test');
const {matches,filterLive}=require('../live-search.cjs');
test('Sky Sports finds NZ Sky Sport as well as UK Sky Sports',()=>{
 expect(matches('NZ | Sky Sport 1 HD','sky sports')).toBe(true);
 expect(matches('UK | Sky Sports Main Event','Sky Sports')).toBe(true);
 expect(matches('NZ | Sky News','sky sports')).toBe(false);
});
test('Live TV search includes other categories and all results beyond the old cap',()=>{
 const rows=Array.from({length:201},(_,i)=>({id:i,name:'UK Sky Sports '+i,category:'uk'}));rows.push({id:202,name:'NZ | Sky Sport 1',category:'nz'});
 expect(filterLive(rows,'uk','sky sports').length).toBe(202);
 expect(filterLive(rows,'uk','').length).toBe(201);
 expect(filterLive(rows,'uk','sky sports').at(-1).category).toBe('nz');
});