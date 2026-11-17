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
