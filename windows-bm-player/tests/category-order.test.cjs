const {test,expect}=require('bun:test');
const {orderCategories,moveCategory,cleanIds}=require('../category-order.cjs');
const cats=[{id:'1',name:'News'},{id:'2',name:'Sport'},{id:'3',name:'Films'}];
test('Live TV, Movies and Series category overrides are independent',()=>{
 const settings={live:['2','1'],film:['3','1'],series:['1','3']};
 expect(orderCategories(cats,settings.live).map(c=>c.id)).toEqual(['2','1','3']);
 expect(orderCategories(cats,settings.film).map(c=>c.id)).toEqual(['3','1','2']);
 expect(orderCategories(cats,settings.series).map(c=>c.id)).toEqual(['1','3','2']);
});
test('new categories append in provider order and stale or duplicate IDs do not remove categories',()=>{
 expect(orderCategories(cats,['9','2','2']).map(c=>c.id)).toEqual(['2','1','3']);
 expect(cats.map(c=>c.id)).toEqual(['1','2','3']);
});
test('saved order survives a persistence round trip and reset restores provider order',()=>{
 const moved=moveCategory(cats,1,-1);const saved=JSON.parse(JSON.stringify(cleanIds(moved.map(c=>c.id))));
 expect(orderCategories(cats,saved).map(c=>c.id)).toEqual(['2','1','3']);
 expect(orderCategories(cats,[])).toEqual(cats);
 expect(moveCategory(cats,0,-1)).toEqual(cats);
});
test('only valid unique category IDs can be saved',()=>{
 expect(cleanIds(['2',null,{},'2','*','all','',42,'1'])).toEqual(['2','1']);
});