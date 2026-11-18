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
test('switch off succeeds when the old tunnel cannot connect',async()=>{
 let enabled=true,off=0;const vpn=createVpn({site:async r=>{if(r.action==='vpn_command'){enabled=false;return {ok:true};}return {vpn:{enabled,config:'[Interface]'}};},native:{connect:async()=>{throw Error('failed');},disconnect:async()=>{},off:async()=>{off++;}}});
 assert.equal((await vpn.command({command:'off'})).status,'off');assert.equal(off,1);
});
test('server list keeps the website order and real traffic readings when no pings are measured',async()=>{
 const vpn=createVpn({site:async()=>({servers:[{id:1,traffic:1280000,traffic_bar:100},{id:2,traffic:451000,traffic_bar:35},{id:3}]})});
 const rows=await vpn.servers();assert.deepEqual(rows.map(r=>r.id),[1,2,3]);assert.equal(rows[1].traffic,451000);assert.equal(rows[2].traffic,null);
});
test('a lost handshake removes green state and blocks direct fallback',async()=>{
 let connected=true,blocked=0;const vpn=createVpn({site:async r=>r.action==='vpn'?{vpn:{enabled:true,config:'[Interface]'}}:{ok:true},native:{connect:async()=>{},connected:async()=>connected,disconnect:async()=>{blocked++;}}});
 await vpn.sync();connected=false;assert.equal((await vpn.health()).status,'failed');assert.equal(blocked,1);
});