const {test,expect}=require('bun:test');
const {createLink}=require('../channel-link.cjs');
test('ping bands match Android: under 80 Excellent, 80-200 Good, over 200 Fair, over 400 Poor',()=>{
 const at=v=>{const l=createLink(0);l.ping(v);return l.rating(1000);};
 expect(at(40)).toBe('Excellent');expect(at(120)).toBe('Good');expect(at(250)).toBe('Fair');expect(at(450)).toBe('Poor');
});
test('one reconnect is Fair, two are Poor, and they age out after two minutes',()=>{
 const l=createLink(0);l.ping(30);l.reconnected(60000);expect(l.rating(60000)).toBe('Fair');
 l.reconnected(70000);expect(l.rating(70000)).toBe('Poor');expect(l.rating(200000)).toBe('Excellent');
});
test('a VPN server change ignores faults for 45 seconds and keeps the last ping',()=>{
 const l=createLink(0);l.ping(30);l.serverChanged(100000);l.reconnected(110000);l.stalled(120000);
 expect(l.rating(130000)).toBe('Excellent');l.reconnected(150000);expect(l.rating(150000)).toBe('Fair');
});
test('opening a channel is not a fault',()=>{const l=createLink(0);l.ping(30);l.reconnected(10000);expect(l.rating(10000)).toBe('Excellent');});
