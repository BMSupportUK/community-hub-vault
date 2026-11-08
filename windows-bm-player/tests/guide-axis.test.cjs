const {test,expect}=require('bun:test');
const {guideAxis}=require('../guide-axis.cjs');
test('fixed two-hour scale gives every half hour equal width and exact five-minute edges',()=>{
 const programmes=[{title:'BBC London News',start:900000,end:1200000},{title:'BBC Weather',start:1200000,end:1500000},{title:'Countryfile',start:1500000,end:3600000}];
 const axis=guideAxis(0,7200000,programmes,600);
 expect(axis.times).toEqual([0,1800000,3600000,5400000,7200000]);
 expect(axis.x(1800000)).toBe(150);
 expect(axis.x(3600000)).toBe(300);
 expect(axis.x(1200000)-axis.x(900000)).toBe(25);
 expect(axis.x(1050000)).toBe((axis.x(900000)+axis.x(1200000))/2);
 expect(axis.x(7200000)).toBe(600);
 expect(programmes[0].end).toBe(1200000);
});
test('loading, refreshing and removing long programmes never moves time boundaries',()=>{
 const empty=guideAxis(0,7200000,[],800);
 const loaded=guideAxis(0,7200000,[{start:300000,end:600000,title:'Long programme title '.repeat(40)}],800);
 for(const t of [0,300000,600000,1800000,3600000,5400000,7200000])expect(loaded.x(t)).toBe(empty.x(t));
 expect(loaded.width).toBe(800);
 expect(loaded.times).toEqual(empty.times);
});