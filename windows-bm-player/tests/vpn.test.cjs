const test=require('node:test'),assert=require('node:assert/strict');
const {createVpn}=require('../vpn.cjs');
test('VPN config/private keys never enter public state or events',async()=>{
 const events=[],calls=[];const vpn=createVpn({site:async r=>{calls.push(r);return r.action==='vpn'?{vpn:{enabled:true,server:'London #3',config:'[Interface]\nPrivateKey=PRIVATE'}}:{ok:true};},native:{connect:async c=>assert.ok(c.includes('PRIVATE')),connected:async()=>true,disconnect:async()=>{}},changed:s=>events.push(s)});
 assert.equal((await vpn.sync()).status,'on');assert.ok(!JSON.stringify(events).includes('PRIVATE'));assert.ok(!JSON.stringify(vpn.snapshot()).includes('config'));assert.equal(calls.at(-1).status,'on');
});
test('missing native tunnel never claims VPN is connected or changes entitlement',async()=>{
 const calls=[];const vpn=createVpn({site:async r=>{calls.push(r);return {vpn:{enabled:true,server:'London #3',config:'[Interface]\nPrivateKey=PRIVATE'}};}});
 assert.equal((await vpn.sync()).status,'unavailable');await assert.rejects(vpn.command({command:'on'}),/not available/);assert.deepEqual(calls.map(r=>r.action),['vpn']);
});
test('no green on state before handshake confirmation',async()=>{
 const calls=[];const vpn=createVpn({site:async r=>{calls.push(r);return r.action==='vpn'?{vpn:{enabled:true,config:'[Interface]'}}:{ok:true};},native:{connect:async()=>{},connected:async()=>false,disconnect:async()=>{}}});
 await assert.rejects(vpn.sync(),/Could not connect/);assert.equal(vpn.snapshot().status,'failed');assert.ok(!calls.some(r=>r.status==='on'));
});
test('unlinked/expired entitlement disconnects and forgets server',async()=>{
 let stops=0;const vpn=createVpn({site:async()=>({vpn:null}),native:{disconnect:async()=>{stops++;}}});
 assert.equal((await vpn.sync()).present,false);assert.equal(stops,1);assert.equal(vpn.snapshot().server,'');
});
test('renderer cannot supply config, shell commands or arbitrary server IDs',async()=>{
 let calls=0;const vpn=createVpn({site:async()=>{calls++;},native:{}});
 await assert.rejects(vpn.command({command:'exec',config:'secret'}),/Choose/);await assert.rejects(vpn.command({command:'server',server_id:'1; command'}),/Choose/);assert.equal(calls,0);
});