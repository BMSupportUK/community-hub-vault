const {test,expect}=require('bun:test');
const {createVpn}=require('../vpn.cjs');
test('Get VPN only opens a real BM Support VPN pay link',async()=>{
 const good='https://bmsupport.uk/vpn-pay/'+'a'.repeat(64)+'#ABCD-EFGH-JKLM';
 expect(await createVpn({site:async()=>({url:good})}).buy()).toBe(good);
 await expect(createVpn({site:async()=>({url:'https://evil.example/x'})}).buy()).rejects.toThrow();
});
test('quote passes the website price and reason through',async()=>{
 expect(await createVpn({site:async()=>({ok:true,pence:499,days:76,until:'2027-02-01T00:00:00Z'})}).quote()).toEqual({ok:true,pence:499,days:76,until:'2027-02-01T00:00:00Z'});
 expect((await createVpn({site:async()=>({ok:false,reason:'Renew first'})}).quote()).reason).toBe('Renew first');
});
test('server list keeps the website groups, then lowest VPN ping, and never shows server addresses',async()=>{
 const servers=[{id:1,city:'Far',country:'IL',group:2,ip:'1.1.1.1'},{id:2,city:'London',country:'GB',group:0,ip:'2.2.2.2'},{id:3,city:'Manchester',country:'GB',group:0,ip:'3.3.3.3'},{id:4,city:'Brussels',country:'BE',group:1,ip:'4.4.4.4'}];
 const v=createVpn({site:async()=>({servers}),pinger:async()=>({1:5,2:60,3:20,4:15})});
 const rows=await v.servers();
 expect(rows.map(r=>r.city)).toEqual(['Manchester','London','Brussels','Far']);
 expect(rows[0].ping).toBe(20);expect(rows.some(r=>'ip' in r)).toBe(false);
});
test('best and on send this computer\'s own pings to the website',async()=>{
 const sent=[];const v=createVpn({site:async b=>{sent.push(b);if(b.action==='vpn_servers')return{servers:[{id:7,ip:'7.7.7.7'}]};if(b.action==='vpn')return{vpn:{enabled:false}};return{ok:true};},native:{off:async()=>{},disconnect:async()=>{},connect:async()=>{},connected:async()=>true},pinger:async()=>({7:33})});
 await v.command({command:'best'});
 expect(sent.find(b=>b.action==='vpn_command').pings).toEqual({7:33});
});
