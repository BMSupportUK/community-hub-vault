const {test,expect}=require('bun:test');
const {orderBrowse,surfaceRows}=require('../playback-core.cjs');
test('live channels keep Android provider order even when added dates differ',()=>{
 const items=[{id:1,name:'Z',added:1},{id:2,name:'A',added:999},{id:3,name:'M',added:9}];
 expect(orderBrowse(items,'live','added').map(i=>i.id)).toEqual([1,2,3]);
});
test('film latest added sort stays intact',()=>expect(orderBrowse([{id:1,added:1},{id:2,added:9}],'film').map(i=>i.id)).toEqual([2,1]));
test('video bounds reject surfaces outside the app',()=>expect(surfaceRows([{index:0,x:0.9,y:0,width:0.5,height:1,visible:true}])).toEqual([]));
test('three in-app surfaces are allowed',()=>expect(surfaceRows([0,1,2].map(index=>({index,x:0,y:0,width:1,height:1,visible:true}))).length).toBe(3));