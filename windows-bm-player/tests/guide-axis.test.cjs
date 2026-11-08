const {test,expect}=require('bun:test');
const {guideAxis}=require('../guide-axis.cjs');
test('shared expanded time positions retain five-minute boundaries across rows',()=>{
 const programmes=[{title:'BBC London News',start:900000,end:1200000},{title:'BBC Weather',start:1200000,end:1500000},{title:'Countryfile',start:1500000,end:3600000}];
 const axis=guideAxis(0,3600000,programmes,600);
 expect(axis.x(1200000)).toBeGreaterThan(axis.x(900000));
 expect(axis.x(1500000)).toBeGreaterThan(axis.x(1200000));
 expect(axis.x(1050000)).toBe((axis.x(900000)+axis.x(1200000))/2);
 expect(axis.x(3600000)).toBe(axis.width);
 expect(programmes[0].end).toBe(1200000);
});