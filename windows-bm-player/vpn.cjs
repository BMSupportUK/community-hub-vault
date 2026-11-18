/** Main-process VPN coordinator. WireGuard configuration never crosses IPC. */
// Same order as the box: the website's groups (own country, nearby, far away), then lowest VPN ping in 10 ms steps, unmeasured last.
function sortServers(rows){const at=new Map(rows.map((r,i)=>[r,i]));return [...rows].sort((a,b)=>{if(a.group!==b.group)return a.group-b.group;const pa=a.ping,pb=b.ping;if(pa>0&&pb>0&&Math.floor(pa/10)!==Math.floor(pb/10))return pa-pb;if((pa>0)!==(pb>0))return pa>0?-1:1;return at.get(a)-at.get(b);});}
function createVpn({site,native,changed=()=>{},pinger=null}){
 let state={present:false,status:'off',server:'',until:null,available:!!native},tail=Promise.resolve();
 const snapshot=()=>({...state});
 function emit(patch){state={...state,...patch};changed(snapshot());return snapshot();}
 const serial=fn=>{const run=tail.then(fn);tail=run.catch(()=>{});return run;};
 async function stop(block=false){if(native){if(!block&&native.off)await native.off();else await native.disconnect();}emit({status:'off'});}
 async function sync(){
  const r=await site({action:'vpn'}),v=r?.vpn;
  if(!v){await stop();return emit({present:false,server:'',until:null});}
  emit({present:true,server:String(v.server||'').slice(0,120),until:v.until||null});
  if(!v.enabled){await stop();return snapshot();}
  if(!native)return emit({status:'unavailable'});
  emit({status:'connecting'});
  try{
   if(typeof v.config!=='string'||!v.config.includes('[Interface]'))throw new Error('VPN configuration unavailable.');
   await native.connect(v.config);
   // Adapter must confirm a live handshake and installed routes/DNS, not process startup.
   if(!await native.connected())throw new Error('VPN handshake unavailable.');
   emit({status:'on'});await site({action:'vpn_status',status:'on',server:state.server});
  }catch{
   await stop(true).catch(()=>{});emit({status:'failed'});
   await site({action:'vpn_status',status:'failed',detail:'Could not establish VPN.'}).catch(()=>{});
   throw new Error('Could not connect the VPN.');
  }
  return snapshot();
 }
 const PAY=/^https:\/\/bmsupport\.uk\/vpn-pay\/[a-f0-9]{64}#[A-Za-z0-9%-]{1,80}$/;
 return {
  snapshot,
  // VPN is bought only inside BM Player: £2 a month by the day to the subscription end, paid in the browser.
  quote:async()=>{const r=await site({action:'vpn_quote'});return r?.ok?{ok:true,pence:Number(r.pence)||0,days:Number(r.days)||0,until:String(r.until||'')}:{ok:false,reason:String(r?.reason||'The VPN can\'t be added right now.').slice(0,240)};},
  buy:async()=>{const r=await site({action:'vpn_buy'});const url=String(r?.url||'');if(!PAY.test(url))throw new Error(String(r?.error||'Couldn\'t start the VPN payment. Try again shortly.').slice(0,240));return url;},
  sync:()=>serial(sync),
  servers:async()=>{const r=await site({action:'vpn_servers'});const raw=(r.servers||[]).filter(s=>Number.isInteger(s.id)&&s.id>0);const pings=pinger?await pinger(raw).catch(()=>({})):{};return sortServers(raw.map(s=>({id:s.id,city:String(s.city||'').slice(0,80),country:String(s.country||'').slice(0,2),group:Number(s.group)||0,ping:Number(pings[s.id])>0?Math.round(pings[s.id]):0,traffic:typeof s.traffic==='number'&&Number.isFinite(s.traffic)&&s.traffic>=0?s.traffic:null,traffic_bar:Math.max(0,Math.min(100,Number(s.traffic_bar)||0))})));},
  command:value=>serial(async()=>{
   const command=value?.command,id=value?.server_id;
   if(!['on','off','best'].includes(command)&&!(command==='server'&&Number.isInteger(id)&&id>0))throw new Error('Choose a VPN location.');
   if(!native)throw new Error('Built-in VPN is not available in this desktop release yet.');
   // Off and server changes must remain possible even when the old tunnel is broken.
   const entitlement=await site({action:'vpn'});
   if(!entitlement?.vpn)throw new Error('VPN is not on your package.');
   let pings={};if(pinger&&(command==='best'||command==='on')){try{const list=await site({action:'vpn_servers'});const got=await pinger((list?.servers||[]).filter(s=>Number.isInteger(s.id)&&s.id>0));for(const [k,v] of Object.entries(got||{}))if(/^\d{1,6}$/.test(k)&&Number.isInteger(v)&&v>0&&v<=10000)pings[k]=v;}catch{}}
   const r=await site({action:'vpn_command',...(command==='server'?{server_id:id}:{command}),...(Object.keys(pings).length?{pings}:{})});
   if(!r.ok)throw new Error('Could not change the VPN.');
   const result=await sync();
   if(command==='off')await site({action:'vpn_status',status:'off'});
   return result;
  }),
  close:()=>serial(async()=>{await stop();emit({present:false,server:'',until:null});}),
  health:()=>serial(async()=>{if(state.status==='on'&&native&&!await native.connected()){await stop(true).catch(()=>{});emit({status:'failed'});await site({action:'vpn_status',status:'failed',detail:'VPN connection lost.'}).catch(()=>{});}return snapshot();}),
 };
}
// Times a quick TCP connection (port 443) to each server from this computer's own connection; a refusal still proves the round trip.
function tcpPinger(net=require('node:net')){
 const once=ip=>new Promise(res=>{const t=Date.now();const s=net.connect({host:ip,port:443,timeout:1500});const done=ok=>{s.destroy();res(ok?Math.max(1,Date.now()-t):0);};s.on('connect',()=>done(true));s.on('error',e=>done(e&&e.code==='ECONNREFUSED'));s.on('timeout',()=>done(false));});
 return async rows=>{const out={};await Promise.all(rows.filter(r=>typeof r.ip==='string'&&/^[0-9a-f.:]{3,45}$/i.test(r.ip)).map(async r=>{const a=await once(r.ip),b=await once(r.ip);const best=[a,b].filter(Boolean);if(best.length)out[r.id]=Math.min(...best);}));return out;};
}
module.exports={createVpn,sortServers,tcpPinger};