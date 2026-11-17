/** Main-process VPN coordinator. WireGuard configuration never crosses IPC. */
function createVpn({site,native,changed=()=>{}}){
 let state={present:false,status:'off',server:'',until:null,available:!!native},tail=Promise.resolve();
 const snapshot=()=>({...state});
 function emit(patch){state={...state,...patch};changed(snapshot());return snapshot();}
 const serial=fn=>{const run=tail.then(fn);tail=run.catch(()=>{});return run;};
 async function stop(){if(native)await native.disconnect();emit({status:'off'});}
 async function sync(){
  const r=await site({action:'vpn'}),v=r?.vpn;
  if(!v){await stop();return emit({present:false,server:'',until:null});}
  emit({present:true,server:String(v.server||'').slice(0,120),until:v.until||null});
  if(!v.enabled){await stop();return snapshot();}
  if(!native)return emit({status:'unavailable'});
  if(typeof v.config!=='string'||!v.config.includes('[Interface]'))throw new Error('VPN configuration unavailable.');
  emit({status:'connecting'});
  try{
   await native.connect(v.config);
   // Adapter must confirm a live handshake and installed routes/DNS, not process startup.
   if(!await native.connected())throw new Error('VPN handshake unavailable.');
   emit({status:'on'});await site({action:'vpn_status',status:'on',server:state.server});
  }catch{
   await stop();emit({status:'failed'});
   await site({action:'vpn_status',status:'failed',detail:'Could not establish VPN.'}).catch(()=>{});
   throw new Error('Could not connect the VPN.');
  }
  return snapshot();
 }
 return {
  snapshot,
  sync:()=>serial(sync),
  servers:async()=>{const r=await site({action:'vpn_servers'});return (r.servers||[]).filter(s=>Number.isInteger(s.id)&&s.id>0).map(s=>({id:s.id,city:String(s.city||'').slice(0,80),country:String(s.country||'').slice(0,2)}));},
  command:value=>serial(async()=>{
   const command=value?.command,id=value?.server_id;
   if(!['on','off','best'].includes(command)&&!(command==='server'&&Number.isInteger(id)&&id>0))throw new Error('Choose a VPN location.');
   if(!native)throw new Error('Built-in VPN is not available in this desktop release yet.');
   await sync();
   if(!state.present)throw new Error('VPN is not on your package.');
   const r=await site({action:'vpn_command',...(command==='server'?{server_id:id}:{command})});
   if(!r.ok)throw new Error('Could not change the VPN.');
   const result=await sync();
   if(command==='off')await site({action:'vpn_status',status:'off'});
   return result;
  }),
  close:()=>serial(async()=>{await stop();emit({present:false,server:'',until:null});}),
 };
}
module.exports={createVpn};