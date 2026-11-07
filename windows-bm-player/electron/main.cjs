const {app,BrowserWindow,ipcMain,safeStorage,shell,dialog,powerSaveBlocker,powerMonitor,protocol,session:electronSession,systemPreferences}=require('electron');
const MAC=process.platform==='darwin';
const PLATFORM=MAC?{id:'mac',name:'Mac',device:'Mac BM Player'}:{id:'windows',name:'Windows',device:'Windows BM Player'};
require('./mac-engine.cjs').registerScheme(protocol);
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {execFile}=require('node:child_process');
const core=require('../core.cjs');
const gate=require('../account-gate.cjs').createAccountGate();
const {surfaceRows}=require('../playback-core.cjs');
const boost=require('../sound-boost.cjs');
const recovery=require('../stream-recovery.cjs');
let userVolume=100,audible=0;
function applyAudio(){if(!engine)return;for(const s of sessions)engine.volume(s.index,s.index===audible?boost.boostedVolume(userVolume,store.settings?.boost):0);}
function createEngine(w){const {MacEngine}=require('./mac-engine.cjs'),{BackupSwitch}=require('../backup-switch.cjs'),ua=()=>store.settings?.userAgent;if(MAC){const e=new MacEngine(w,ua);return new BackupSwitch(e,e);}let primary=null;try{const {EmbeddedVlc}=require('./embedded-vlc.cjs');primary=new EmbeddedVlc(w);}catch{}return new BackupSwitch(primary,new MacEngine(w,ua));}
/** Main player gave up: hand the screen to the BM backup engine (once), keeping a film's place. */
function toBackup(session){
 if(session.backup||!engine?.useBackup)return false;
 const live=session.item.kind==='live';
 try{if(!engine.useBackup(session.index,session.urls[session.urlIndex]||session.urls[0],{buffer:recovery.bufferMs(store.settings?.buffer),resume:live?0:session.position||0,live}))return false;}catch{return false;}
 Object.assign(session,{backup:true,ready:false,failed:false,since:Date.now(),stallAt:0,reconnects:0,retryAt:0,stallTimes:[],stillSince:0,lastPos:undefined,subCheck:false});
 applyAudio();send({type:'notice',message:'The main player couldn\'t play this, so the BM backup engine has taken over.'});
 return true;
}
const SITE='https://bmsupport.uk';
let win,store={},file,lastInput=Date.now(),promptedAt=0,excessSince=0,excessReported=false,linkCode='',maintenance=null;
let sessions=[],awake=null,pollBusy=false,checkBusy=false,engine=null;
let lastSystemIdle=0,refreshPromise=null;
const page=path.join(__dirname,'../dist/index.html');
const cache=new Map(),pending=new Map();
function save(){ if(!safeStorage.isEncryptionAvailable())throw new Error(PLATFORM.name+' credential protection unavailable.'); fs.writeFileSync(file,safeStorage.encryptString(JSON.stringify(store))); }
function send(data){ if(win&&!win.isDestroyed())win.webContents.send('player:event',data); }
function key(item){return core.watchKey(store.dns||'',store.user||'',item.kind,item.id);}
function publicState(){
 const a=store.account||{};
 const expiry=Number(a.exp_date)*1000;
 return {platform:PLATFORM.id,platformName:PLATFORM.name,version:app.getVersion(),linked:!!store.user,locked:!!store.user&&!gate.unlocked,user:gate.unlocked?store.user||'':'',code:linkCode,maintenance,announcement:announcement&&announcement.id!==store.annClosed?announcement:null,major:gate.unlocked?major:[],majorSeen:store.majorSeen||[],
  expired:String(a.status||'').toLowerCase()==='expired'||(expiry>0&&expiry<Date.now()),expiry:expiry>0?expiry:null,status:a.status||'',
  maxConnections:Number(a.max_connections)||1,settings:gate.unlocked?store.settings||{}:{},favourites:gate.unlocked?store.favourites||[]:[],recent:gate.unlocked?store.recent||[]:[],
  progress:gate.unlocked?store.progress||{}:{},reminders:gate.unlocked?store.reminders||[]:[],refreshed:gate.unlocked?store.refreshed||{}:{},playing:sessions.map(s=>({index:s.index,item:s.item,position:s.position||0,duration:s.duration||0,paused:s.paused||false,seekable:s.seekable||false}))};
}
async function site(body){
 const response=await fetch(SITE+'/api/public/player',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,...(body.action==='register'?{}:{device_token:store.token})}),signal:AbortSignal.timeout(20000)});
 let data;try{data=await response.json();}catch{throw new Error('BM Support is unavailable. Try again shortly.');}
 if(!response.ok){if(response.status===401&&body.action!=='unlock'){gate.lock();store.token=null;store.user=null;store.pass=null;save();}throw new Error(data.error||'BM Support request failed.');}
 return data;
}
async function getCode(){if(!store.token){const r=await site({action:'register',platform:PLATFORM.id,name:'BM Player '+PLATFORM.name});store.token=r.device_token;save();}const r=await site({action:'code'});linkCode=r.code;send({type:'state',state:publicState()});return publicState();}
let major=[],majorBusy=false;
async function fetchMajor(){if(majorBusy||!store.token)return;majorBusy=true;try{const r=await site({action:'major_announcements'});if(r&&Array.isArray(r.items)){const next=r.items.slice(0,30).map(i=>({id:String(i.id),title:String(i.title||'').slice(0,120),body:String(i.body||'').slice(0,4000),created_at:String(i.created_at||'')}));if(JSON.stringify(next)!==JSON.stringify(major)){major=next;send({type:'state',state:publicState()});}}}catch{}finally{majorBusy=false;}}
let announcement=null,annBusy=false;const STARTED_AT=Date.now();
async function fetchAnnouncement(){if(annBusy||!store.token)return;annBusy=true;try{const r=await site({action:'announcement'});const fresh=r&&r.announcement&&Date.now()-Number(r.announcement.age_ms||0)>=STARTED_AT;const next=fresh&&typeof r.announcement.message==='string'?{id:String(r.announcement.id),message:r.announcement.message.slice(0,300)}:null;if(JSON.stringify(next)!==JSON.stringify(announcement)){announcement=next;send({type:'state',state:publicState()});}}catch{}finally{annBusy=false;}}
async function poll(){
 if(pollBusy||!store.token)return;pollBusy=true;
 try{
  const session=sessions[0];
  const r=await site({action:'poll',login:store.user||'',version:app.getVersion(),watching:session?{kind:session.item.kind==='episode'?'series':session.item.kind,title:session.item.name,category:session.item.categoryName||'',player:'BM Player',since:session.since}:null});
  maintenance=r.maintenance?.enabled?r.maintenance.message:null;
  if(maintenance)await stopAll();
  let changed=false;
  if(r.credentials){gate.lock();await stopAll();store.user=r.credentials.username;store.pass=r.credentials.password;store.account=null;excessSince=0;excessReported=false;changed=true;cache.clear();}
  if(r.dns&&r.dns!==store.dns){store.dns=r.dns;changed=true;cache.clear();}
  if(changed){save();if(store.user&&gate.unlocked)await refresh();}
  if(store.user&&gate.unlocked)syncFavourites().catch(()=>{});
  if(gate.unlocked)syncFormats().catch(()=>{});
  send({type:'state',state:publicState()});
 }catch(error){send({type:'notice',message:error.message});}finally{pollBusy=false;}
}
async function provider(action='',extra={}){
 gate.require();
 if(!store.user||!store.dns)throw new Error('Link the app to your account first.');
 const url=new URL('/player_api.php',store.dns);url.searchParams.set('username',store.user);url.searchParams.set('password',store.pass);
 if(action)url.searchParams.set('action',action);
 for(const [k,v]of Object.entries(extra))url.searchParams.set(k,String(v));
 const response=await fetch(url,{headers:{'User-Agent':store.settings?.userAgent||'VLC/3.0.21 LibVLC/3.0.21'},signal:AbortSignal.timeout(45000)});
 if(!response.ok)throw new Error('The service provider could not load this section. Try Refresh.');
 return response.json();
}
async function catalogue(kind){
 if(!['live','film','series'].includes(kind))throw new Error('Unknown section.');
 if(cache.has(kind))return cache.get(kind);
 if(pending.has(kind))return pending.get(kind);
 const task=(async()=>{
 const prefix={live:'live',film:'vod',series:'series'}[kind];
 const categories=await provider('get_'+prefix+'_categories');
 const rows=await provider(kind==='series'?'get_series':'get_'+prefix+'_streams');
 const cats=(Array.isArray(categories)?categories:[]).map(c=>({id:String(c.category_id),name:c.category_name}));
 const items=(Array.isArray(rows)?rows:[]).map(r=>core.itemFromProvider(kind,r)).map(i=>({...i,categoryName:cats.find(c=>c.id===i.category)?.name||''}));
 const result={categories:cats,items};cache.set(kind,result);store.refreshed={...(store.refreshed||{}),[kind]:Date.now()};save();send({type:'state',state:publicState()});return result;
 })();pending.set(kind,task);try{return await task;}finally{pending.delete(kind);}
}
async function refresh(){
 if(refreshPromise)return refreshPromise;
 refreshPromise=refreshInner();try{return await refreshPromise;}finally{refreshPromise=null;}
}
async function refreshInner(){
 const kinds=['live','film','series'];let step=0;
 for(const kind of kinds){send({type:'progress',message:'Updating '+{live:'Live TV',film:'Films',series:'Series'}[kind],percent:Math.round(step/3*100)});cache.delete(kind);await catalogue(kind);step++;}
 send({type:'progress',message:'Playlists updated',percent:100});send({type:'catalogues'});return true;
}
async function catchup(channel){if(!channel||!(Number(channel.archive)>0)||String(channel.id).length>80)throw new Error('Catch up isn\'t available on this channel.');const r=await provider('get_simple_data_table',{stream_id:String(channel.id)});return core.catchupProgrammes(r.epg_listings,Math.min(30,Number(channel.archive)));}
async function epg(id){const r=await provider('get_short_epg',{stream_id:String(id),limit:50});return core.programmes(r.epg_listings);}
function persistProgress(session){
 if(!['film','episode'].includes(session.item.kind)||!(session.duration>0))return;
 store.progress=store.progress||{};const k=key(session.item);store.progress[k]={position:session.position||0,duration:session.duration,at:Date.now()};
 store.progressDirty=[...new Set([...(store.progressDirty||[]),k])].slice(-500);save();pushProgress(false);
}
// Watch progress follows the account across devices (see progress-sync.cjs).
const psync=require('../progress-sync.cjs');let lastProgressPush=0;
function progressPrefix(){return key({kind:'x',id:'y'}).slice(0,-4);}
async function pushProgress(force){
 if(!store.user||!store.token||!gate.unlocked)return;if(!force&&Date.now()-lastProgressPush<30000)return;lastProgressPush=Date.now();
 const pre=progressPrefix(),items=[],sent=new Set();
 for(const k of store.progressDirty||[]){if(!k.startsWith(pre+':')){sent.add(k);continue;}const it=psync.toRemote(k,store.progress?.[k]);if(!it){sent.add(k);continue;}if(items.length>=50)break;items.push(it);sent.add(k);}
 if(items.length){try{const r=await site({action:'progress_set',login:store.user,items});if(!r?.ok)return;}catch{return;}}
 store.progressDirty=(store.progressDirty||[]).filter(k=>!sent.has(k));save();
}
let lastProgressPull=0;
async function syncProgress(force=true){
 if(!store.user||!store.token||!gate.unlocked)return;if(!force&&Date.now()-lastProgressPull<30000)return;lastProgressPull=Date.now();const pre=progressPrefix();store.progress=store.progress||{};
 if(store.progressSeeded!==pre){store.progressDirty=[...new Set([...(store.progressDirty||[]),...Object.keys(store.progress).filter(k=>k.startsWith(pre+':')&&psync.portable(k))])];store.progressSeeded=pre;save();}
 const r=await site({action:'progress',login:store.user});
 if(Array.isArray(r?.items)&&psync.mergeRemote(store.progress,pre,r.items,Number.isFinite(r?.now)?Date.now()-r.now:0)){save();send({type:'state',state:publicState()});}
 await pushProgress(true);
}
async function stopAll(){
 for(const s of sessions){const status=engine?.status(s.index);if(status)Object.assign(s,status);persistProgress(s);engine?.stop(s.index);}
 pushProgress(true).catch(()=>{});
 sessions=[];
 if(awake!==null){powerSaveBlocker.stop(awake);awake=null;}
 send({type:'state',state:publicState()});
}
async function play({item,resume=false,screens=1,subtitles=null}){
 if(item?.kind==='catchup'&&!(Number.isFinite(item.start)&&Number.isFinite(item.end)&&item.end>item.start&&item.end<=Date.now()))throw new Error('Choose a programme that has finished.');
 if(!item||!['live','film','episode','catchup'].includes(item.kind)||String(item.id).length>80)throw new Error('Choose a playable item.');
 if(maintenance)throw new Error(maintenance);
 if(publicState().expired)throw new Error('Your subscription has expired. Visit BM Support to renew.');
 const allowed=Math.min(3,Number(store.account?.max_connections)||1);
 if(screens<1||screens>allowed)throw new Error('This exceeds your subscription connections.');
 if(screens===1||sessions.length>=screens)await stopAll();
 const baseUrls=core.streamUrls(store.dns,store.user,store.pass,item,store.settings?.format||'auto'),urls=item.kind==='live'?recovery.preferFormat(baseUrls,store.formatPref?.[item.id]):baseUrls;
 if(!engine)engine=createEngine(win);
 const index=sessions.length,watched=store.progress?.[key(item)];
 const startAt=resume&&watched&&core.resume(watched.position,watched.duration)?watched.position:0;
 engine.setFill?.(index,['film','episode'].includes(item.kind));
 try{engine.play(index,urls[0],{buffer:item.kind==='live'?recovery.liveBufferMs(store.settings?.buffer):recovery.bufferMs(store.settings?.buffer),live:item.kind!=='catchup',subtitles:['film','episode'].includes(item.kind)?subtitles!==false:null,resume:startAt});}
 catch{let ok=false;try{ok=engine.useBackup(index,urls[0],{buffer:recovery.bufferMs(store.settings?.buffer),resume:item.kind==='live'?0:startAt,live:item.kind==='live'});}catch{}if(!ok){engine.stop(index);throw new Error('In-app playback could not start. Reinstall BM Player using the '+PLATFORM.name+' download and try again.');}}
 const onBackup=engine.usingBackup(index);
 const session={index,item,position:0,duration:0,since:Date.now(),urls,urlIndex:0,paused:false,backup:onBackup,subCheck:!onBackup&&['film','episode'].includes(item.kind)&&subtitles!==false};sessions.push(session);
 if(index===0)audible=0;applyAudio();
 if(awake===null)awake=powerSaveBlocker.start('prevent-display-sleep');
 if(item.kind!=='catchup'&&!core.adult(item.categoryName)){store.recent=[item,...(store.recent||[]).filter(i=>i.id!==item.id||i.kind!==item.kind)].slice(0,100);save();}
 lastInput=Date.now();promptedAt=0;poll();send({type:'state',state:publicState()});return true;
}
async function updatePlayback(){for(const session of [...sessions]){try{const s=engine?.status(session.index);if(!s)continue;Object.assign(session,s);session.paused=s.state===4;
 const rec=recovery.tick(session,s.state,Date.now(),session.item.kind==='live');
 if(recovery.advertJump(session,Number(s.w)||0,Number(s.h)||0,s.state,Date.now(),session.item.kind==='live')){try{engine.play(session.index,session.urls[session.urlIndex],{buffer:recovery.liveBufferMs(store.settings?.buffer),resume:0,maxHeight:session.maxHeight});applyAudio();}catch{}}
 if(rec.event)queueBuffer(session.item,rec.event);
 if(rec.lower){session.maxHeight=720;const other=session.item.kind==='live'&&session.urls.length>1?recovery.otherFormat(session.urls[session.urlIndex]):null;if(other){store.formatPref={...(store.formatPref||{}),[session.item.id]:other};save();site({action:'format_set',content_id:String(session.item.id),fmt:other}).catch(()=>{});}}
 if(rec.raise){session.maxHeight=0;if(/\.m3u8$/i.test(session.urls[session.urlIndex]||'')){try{engine.play(session.index,session.urls[session.urlIndex],{buffer:session.item.kind==='live'?recovery.liveBufferMs(store.settings?.buffer):recovery.bufferMs(store.settings?.buffer),resume:session.item.kind==='live'?0:session.position,maxHeight:0});applyAudio();}catch{}}}
 if(session.ready&&recovery.frozen(session,s.state,s.position,Date.now())){queueBuffer(session.item,{ms:recovery.FREEZE_MS,reconnected:true,freeze:true});const at=session.item.kind==='live'?0:session.position;try{engine.play(session.index,session.urls[session.urlIndex],{buffer:session.item.kind==='live'?recovery.liveBufferMs(store.settings?.buffer):recovery.bufferMs(store.settings?.buffer),resume:at,maxHeight:session.maxHeight});applyAudio();}catch{}}
 if(rec.reconnect){const at=session.item.kind==='live'?0:session.position;send({type:'notice',message:'Reconnecting…'});setTimeout(()=>{if(!sessions.includes(session)||!engine)return;try{engine.play(session.index,session.urls[session.urlIndex],{buffer:session.item.kind==='live'?recovery.liveBufferMs(store.settings?.buffer):recovery.bufferMs(store.settings?.buffer),resume:at,maxHeight:session.maxHeight});applyAudio();}catch{}},rec.reconnect);}
 if(rec.offerSd)send({type:'notice',message:'This HD channel keeps buffering on your connection. Try the SD version of the channel for smoother playback.'});
 if(rec.failed&&!toBackup(session))send({type:'notice',message:'This stream keeps dropping and couldn\'t reconnect. Try again or report the issue.'});
 if(!session.ready&&(s.state===7||s.state===5)&&Date.now()-session.since>15000){if(session.urlIndex+1<session.urls.length){session.urlIndex++;session.since=Date.now();engine.play(session.index,session.urls[session.urlIndex],{buffer:recovery.bufferMs(store.settings?.buffer)});}else if(!session.failed&&!toBackup(session)){session.failed=true;send({type:'notice',message:'This stream could not play. Try another channel or report the issue.'});}}
 // Like Android: subtitles start on; only ask (paused) when the film actually has some.
 if(session.subCheck&&s.state===3){const n=Number(engine.subtitleTracks?.(session.index))||0;if(n>0){session.subCheck=false;engine.pause(session.index,true);session.paused=true;send({type:'subtitles-found',index:session.index,item:session.item});}else if(Date.now()-session.since>25000)session.subCheck=false;}
 healthTick(session,s);
 persistProgress(session);send({type:'playback',index:session.index,item:session.item,position:session.position,duration:session.duration,paused:session.paused,seekable:session.seekable});}catch{}}}
// Sports Guide crosses: tell the website a live channel failed, showed no picture after 10s, or played 2 clean minutes.
function healthTick(session,s){if(session.item.kind!=='live')return;const now=Date.now(),name=String(session.item.name||'').slice(0,200);if(!name)return;
 const report=status=>site({action:'channel_health',name,status}).catch(()=>{});
 if(session.failed&&!session.hFailed){session.hFailed=true;report('failed');return;}
 if(!session.hBlack&&s.state===3&&now-session.since>10000&&!(Number(s.w)>0)){session.hBlack=true;report('black');}
 if(s.state===3){if(!session.cleanSince)session.cleanSince=now;}else if(s.state===2||s.state===7)session.cleanSince=0;
 if(!session.hOk&&!session.hBlack&&session.cleanSince&&now-session.cleanSince>=120000){session.hOk=true;report('ok');}
}
let bufferQueue=[],bufferBusy=false;
function queueBuffer(item,ev){bufferQueue.push({kind:item.kind==='episode'?'series':item.kind,content_id:String(item.id||'').slice(0,200),name:String(item.name||'').slice(0,200),stall_ms:Math.max(0,Math.min(3600000,Math.round(ev.ms))),reconnected:!!ev.reconnected,freeze:!!ev.freeze,...(ev.cause?{cause:ev.cause}:{}),at:Date.now()});if(bufferQueue.length>100)bufferQueue=bufferQueue.slice(-100);if(bufferQueue.length>=10)flushBuffer();}
async function flushBuffer(){if(bufferBusy||!store.token||!bufferQueue.length)return;bufferBusy=true;const events=bufferQueue.splice(0,recovery.BATCH);try{await site({action:'buffering',version:app.getVersion(),events});}catch{}finally{bufferBusy=false;}}
setInterval(()=>{flushBuffer();},60000);
// Films/episodes: zoom past black bars baked into the picture (Windows libVLC; Mac and backup check in the window).
setInterval(()=>{if(!engine?.checkBars)return;const {nativeImage}=require('electron');const decode=f=>{const im=nativeImage.createFromPath(f);if(im.isEmpty())return null;const sz=im.getSize();return{data:im.toBitmap(),width:sz.width,height:sz.height};};for(const s of sessions)if(['film','episode'].includes(s.item.kind)&&!s.backup)engine.checkBars(s.index,decode);},2000);
async function connectionCheck(){
 if(checkBusy||!store.user||!gate.unlocked)return;checkBusy=true;
 try{
  const data=await provider();const info=data.user_info;if(!info)throw new Error('Unknown account');store.account=info;save();
  const active=Number(info.active_cons),max=Number(info.max_connections);
  if(!Number.isFinite(active)||!Number.isFinite(max)||max<=0||active<=max){excessSince=0;excessReported=false;}
  else {if(!excessSince)excessSince=Date.now();if(!excessReported&&Date.now()-excessSince>=180000){const r=await site({action:'connection_alert',active,max,exceeded_since:excessSince,login:store.user,version:app.getVersion()});if(r.reported){excessReported=true;await foreground();await dialog.showMessageBox(win,{type:'warning',title:'Maximum connections exceeded',message:`Your subscription allows ${max} connections, but ${active} are active.`,detail:'The limit has been exceeded for at least 3 minutes. This has been reported to BM Support for investigation.',buttons:['Close']});}}}
  send({type:'state',state:publicState()});
 }catch{excessSince=0;excessReported=false;}finally{checkBusy=false;}
}
async function foreground(){if(!win||win.isDestroyed())return;if(win.isMinimized())win.restore();win.show();win.focus();}
// Includes input while VLC has focus; avoids treating active remote/keyboard use as inactivity.
function systemInput(){
 if(MAC){const idle=powerMonitor.getSystemIdleTime()*1000;if(idle<lastSystemIdle||idle<30000)lastInput=Date.now()-idle;lastSystemIdle=idle;return;}
 if(process.platform!=='win32'||promptedAt)return;
 const code='Add-Type -TypeDefinition \'using System; using System.Runtime.InteropServices; public static class BMIdle { [StructLayout(LayoutKind.Sequential)] struct LASTINPUTINFO { public uint cbSize; public uint dwTime; } [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LASTINPUTINFO x); public static uint Milliseconds() { LASTINPUTINFO x = new LASTINPUTINFO(); x.cbSize = (uint)Marshal.SizeOf(x); return GetLastInputInfo(ref x) ? unchecked((uint)Environment.TickCount - x.dwTime) : uint.MaxValue; }}\'; [BMIdle]::Milliseconds()';
 execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',code],{windowsHide:true,timeout:10000},(err,out)=>{const idle=Number(out.trim());if(!err&&Number.isFinite(idle)){if(idle<lastSystemIdle||idle<30000)lastInput=Date.now()-idle;lastSystemIdle=idle;}});
}
async function timers(){
 const now=Date.now();
 if(!store.user||!gate.unlocked||maintenance||publicState().expired){lastInput=now;promptedAt=0;return;}
 if(!promptedAt&&now-lastInput>=core.IDLE_MS){promptedAt=now;await foreground();send({type:'inactive',seconds:120});}
 if(promptedAt){if(now-promptedAt>=core.RESPONSE_MS){promptedAt=0;setTimeout(()=>app.exit(0),5000);try{await Promise.race([stopAll(),new Promise(r=>setTimeout(r,3000))]);}catch{}app.quit();return;}send({type:'inactive',seconds:Math.ceil((core.RESPONSE_MS-(now-promptedAt))/1000)});}
 for(const reminder of store.reminders||[]){if(!reminder.notified&&reminder.start-300000<=now&&reminder.start>now){reminder.notified=true;save();await foreground();send({type:'reminder',reminder});}}
}
function trusted(event){return event.sender===win?.webContents&&event.senderFrame?.url===pathToFileURL(page).href;}
/** Favourites live on the website per account and provider login, so every BM Player shows the same list. */
function favouriteItems(){return (store.favourites||[]).filter(i=>i&&i.id!=null&&i.kind&&JSON.stringify(i).length<=4000).slice(0,500).map(i=>({...i,id:String(i.id)}));}
function pushFavourites(){if(!store.user||!store.token)return;site({action:'favourites_set',login:store.user,items:favouriteItems()}).catch(()=>{});}
async function syncFormats(){if(!store.token)return;const r=await site({action:'formats'});if(!r||typeof r.formats!=='object')return;const ok=Object.fromEntries(Object.entries(r.formats).filter(([,v])=>v==='ts'||v==='m3u8'));store.formatPref={...(store.formatPref||{}),...ok};save();}
async function syncFavourites(){if(!store.user||!store.token||!gate.unlocked)return;const r=await site({action:'favourites',login:store.user});if(!r||!Array.isArray(r.items))return;
 if(!r.stored){if((store.favourites||[]).length)pushFavourites();store.favSynced=true;save();return;}
 if(!store.favSynced){const seen=new Set(r.items.map(i=>i.kind+'|'+i.id));const extra=(store.favourites||[]).filter(i=>!seen.has(i.kind+'|'+String(i.id)));store.favourites=[...r.items,...extra];store.favSynced=true;save();if(extra.length)pushFavourites();send({type:'state',state:publicState()});return;}
 if(JSON.stringify(r.items)!==JSON.stringify(store.favourites||[])){store.favourites=r.items;save();send({type:'state',state:publicState()});}}
function register(name,fn){ipcMain.handle('player:'+name,async(event,value)=>{if(!trusted(event))throw new Error('Untrusted window.');if(!['state','link','unlock','exit','openLink','stop','closeAnnouncement','majorSeen'].includes(name))gate.require();if(!promptedAt)lastInput=Date.now();return fn(value);});}
if(!app.requestSingleInstanceLock())app.quit();
else{
 app.on('second-instance',foreground);
 app.whenReady().then(async()=>{
  file=path.join(app.getPath('userData'),'player-encrypted.bin');
  if(fs.existsSync(file)){try{store=JSON.parse(safeStorage.decryptString(fs.readFileSync(file)));}catch{store={};}}
  store.recent=(store.recent||[]).filter(i=>!core.adult(i.categoryName));
  win=new BrowserWindow({title:'BM Player · '+PLATFORM.name,show:false,width:1280,height:820,minWidth:920,minHeight:650,autoHideMenuBar:true,...(MAC?{}:{icon:path.join(__dirname,'../build.ico')}),webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
  win.once('ready-to-show',()=>{win.maximize();win.show();});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
  win.webContents.on('before-input-event',()=>{if(!promptedAt)lastInput=Date.now();});
  register('state',()=>publicState());register('link',getCode);register('refresh',refresh);register('catalog',kind=>{if(kind==='film'||kind==='series')syncProgress(false).catch(()=>{});return catalogue(kind);});register('epg',epg);register('catchup',catchup);register('sports',()=>site({action:'sports'}));
  register('unlock',async number=>{await gate.unlock(number,site);syncFavourites().catch(()=>{});syncFormats().catch(()=>{});syncProgress().catch(()=>{});send({type:'state',state:publicState()});refresh().catch(e=>send({type:'notice',message:e.message}));connectionCheck();return publicState();});
  register('series',async id=>{const r=await provider('get_series_info',{series_id:String(id)});return{info:{plot:String(r.info?.plot||'').slice(0,10000),cover:String(r.info?.cover||'')},episodes:Object.fromEntries(Object.entries(r.episodes||{}).map(([season,rows])=>[season,rows.map(p=>({...core.itemFromProvider('episode',p),name:p.title||'Episode '+p.episode_num,episode:p.episode_num,season,poster:String(p.info?.movie_image||'')}))]))};});
  electronSession.defaultSession.setPermissionRequestHandler((wc,perm,cb,details)=>cb(perm==='media'&&wc===win?.webContents&&(details?.mediaTypes||['audio']).every(t=>t==='audio')));
  electronSession.defaultSession.setPermissionCheckHandler((wc,perm)=>perm==='media'&&wc===win?.webContents);
  register('micAccess',async()=>{if(MAC&&systemPreferences.getMediaAccessStatus('microphone')!=='granted')return systemPreferences.askForMediaAccess('microphone');return true;});
  register('voice',async v=>{const audio=String(v?.audio||'');if(!['audio/wav','audio/webm'].includes(v?.mime)||audio.length<100||audio.length>1700000||!/^[A-Za-z0-9+/=]+$/.test(audio))throw new Error('That recording could not be used. Try again.');const r=await site({action:'voice',audio,mime:v.mime});return String(r.text||'');});
  register('ratings',items=>{if(!Array.isArray(items)||!items.length||items.length>200)throw new Error('Choose titles to rate.');return site({action:'ratings',items:items.map(r=>({kind:r.kind,title:String(r.title||'').slice(0,300)}))});});
  register('vote',v=>{if(!['film','series'].includes(v?.kind)||!Number.isInteger(v?.stars)||v.stars<1||v.stars>5)throw new Error('Choose 1–5 stars.');return site({action:'vote',kind:v.kind,title:String(v.title||'').slice(0,300),stars:v.stars});});
  register('details',async v=>{const id=String(v?.id||'');if(!['film','series'].includes(v?.kind)||!/^[A-Za-z0-9._-]{1,80}$/.test(id))throw new Error('Choose a title.');const r=v.kind==='series'?await provider('get_series_info',{series_id:id}):await provider('get_vod_info',{vod_id:id});const i=r?.info||{};const s=x=>String(x||'').slice(0,2000);const bd=Array.isArray(i.backdrop_path)?i.backdrop_path[0]:'';return{plot:s(i.plot||i.description),cast:s(i.cast||i.actors),director:s(i.director),genre:s(i.genre),year:s(i.releasedate||i.releaseDate).slice(0,4),duration:s(i.duration),rating:s(i.rating),backdrop:/^https?:\/\//.test(String(bd||''))?String(bd):''};});register('play',play);register('stop',stopAll);
  require('./mac-engine.cjs').handleProtocol(protocol);
  ipcMain.handle('player:videoStatus',(event,value)=>{if(!trusted(event))throw new Error('Untrusted window.');engine?.report?.(value);return true;});
  ipcMain.handle('player:surface',(event,value)=>{if(!trusted(event))throw new Error('Untrusted window.');engine?.layout(surfaceRows(value));return true;});
  register('control',value=>{
   const index=Number(value?.index),session=sessions.find(s=>s.index===index);if(!session||!engine)return false;
   if(value.action==='pause'){session.paused=!session.paused;engine.pause(index,session.paused);}
   else if(value.action==='seek'&&Number.isFinite(value.seconds))engine.seek(index,Math.max(0,Math.min(session.duration,value.seconds)));
   else if(value.action==='volume'&&Number.isFinite(value.volume)){userVolume=Math.max(0,Math.min(100,Math.round(value.volume)));audible=index;applyAudio();}
   else if(value.action==='boost'){store.settings={...store.settings,boost:boost.level(value.level).id};save();applyAudio();}
   else if(value.action==='subtitles'){engine.setSubtitles?.(index,value.on===true);session.paused=false;engine.pause(index,false);}
   else if(value.action==='audio'){audible=index;applyAudio();}
   send({type:'state',state:publicState()});return true;
  });
  register('settings',async value=>{
   if(value?.logout){await stopAll();await site({action:'unlink'});gate.lock();store.token=null;store.user=null;store.pass=null;store.account=null;cache.clear();save();await getCode();}
   else if(value?.clear){store.recent=[];store.progress={};save();}
   else if(value){store.settings={...store.settings,...value};save();if('boost' in value)applyAudio();}
   return publicState();
  });
  register('majorSeen',id=>{const seen=new Set(store.majorSeen||[]);seen.add(String(id||''));store.majorSeen=[...seen].slice(-200);save();return publicState();});
  register('closeAnnouncement',id=>{store.annClosed=String(id||'');save();return publicState();});
  register('favourite',item=>{store.favourites=store.favourites||[];const at=store.favourites.findIndex(i=>i.id===item.id&&i.kind===item.kind);if(at<0)store.favourites.push(item);else store.favourites.splice(at,1);save();pushFavourites();return publicState();});
  register('report',v=>site({action:'report',kind:v.item.kind==='episode'?'series':v.item.kind,title:v.item.name,category:v.item.categoryName,episode:v.item.kind==='episode'?v.item.name:undefined,issue:String(v.issue||'').slice(0,1000),device:PLATFORM.device,version:app.getVersion()}));
  register('reminder',value=>{store.reminders=store.reminders||[];if(value.remove)store.reminders=store.reminders.filter(r=>r.id!==value.id);else{if(value.start<=Date.now())throw new Error('Reminders are only for programmes that have not started.');store.reminders.push({...value,id:String(value.item.id)+':'+value.start,notified:false});}save();return publicState();});
  register('continue',()=>{lastInput=Date.now();promptedAt=0;send({type:'inactive',seconds:0});return true;});register('exit',async()=>{await stopAll();app.quit();});
  register('openLink',()=>shell.openExternal(SITE+'/send-to-app'));
  register('speed',async()=>{const start=Date.now();await fetch('https://speed.cloudflare.com/__down?bytes=100',{signal:AbortSignal.timeout(10000)});const ping=Date.now()-start;const down=Date.now();const r=await fetch('https://speed.cloudflare.com/__down?bytes=10000000',{signal:AbortSignal.timeout(20000)});const bytes=(await r.arrayBuffer()).byteLength;const download=bytes*8/(Date.now()-down)/1000;const up=Date.now();await fetch('https://speed.cloudflare.com/__up',{method:'POST',body:new Uint8Array(3000000),signal:AbortSignal.timeout(20000)});return{ping,download,upload:3000000*8/(Date.now()-up)/1000};});
  await win.loadFile(page);
  if(!store.user)getCode().catch(e=>send({type:'notice',message:e.message}));else{poll();}
  setInterval(poll,store.user?60000:5000);fetchAnnouncement();setInterval(fetchAnnouncement,15000);fetchMajor();setInterval(fetchMajor,60000);setInterval(connectionCheck,30000);setInterval(updatePlayback,5000);setInterval(timers,1000);setInterval(systemInput,15000);connectionCheck();
 });
 app.on('activate',foreground);
 app.on('window-all-closed',async()=>{await stopAll();app.quit();});
 app.on('before-quit',()=>{for(const session of sessions){const status=engine?.status(session.index);if(status)Object.assign(session,status);persistProgress(session);}engine?.close();engine=null;});
}