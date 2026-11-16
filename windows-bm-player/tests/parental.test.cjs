const {test,expect}=require('bun:test');
const p=require('../parental.cjs');
const data={categories:[{id:1,name:'UK | Free to air'},{id:2,name:'Adult XXX'},{id:3,name:'For Adults 18+'}],items:[{id:'a',category:1},{id:'b',category:2},{id:'c',category:3},{id:'d',category:'live',categoryName:'Adult'}]};
test('with parental control on, adult categories and their items are hidden',()=>{
 const r=p.filterCatalog(data,true);
 expect(r.categories.map(c=>c.id)).toEqual([1]);
 expect(r.items.map(i=>i.id)).toEqual(['a']);
});
test('when unlocked or switched off nothing is hidden',()=>{
 expect(p.filterCatalog(data,false)).toBe(data);
});
test('the PIN must be exactly 4 numbers',()=>{
 expect(p.validPin('1234')).toBe(true);
 expect(p.validPin('123')).toBe(false);
 expect(p.validPin('12a4')).toBe(false);
});
