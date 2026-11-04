const {test,expect}=require('bun:test');
const b=require('../sound-boost.cjs');
test('booster levels give 100/150/200/250 at full volume',()=>expect(['off','low','medium','high'].map(id=>b.boostedVolume(100,id))).toEqual([100,150,200,250]));
test('unknown or missing level stays off',()=>{expect(b.boostedVolume(100,undefined)).toBe(100);expect(b.boostedVolume(100,'mega')).toBe(100);});
test('booster scales the customer volume slider',()=>expect(b.boostedVolume(40,'medium')).toBe(80));
test('button cycles Off → Low → Medium → High → Off',()=>expect(['off','low','medium','high'].map(b.next)).toEqual(['low','medium','high','off']));
