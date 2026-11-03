const {app,BrowserWindow,ipcMain,safeStorage,shell,dialog,powerSaveBlocker,powerMonitor,protocol,session:electronSession,systemPreferences}=require('electron');
const MAC=process.platform==='darwin';
const PLATFORM=MAC?{id:'mac',name:'Mac',device:'Mac BM Player'}:{id:'windows',name:'Windows',device:'Windows BM Player'};
if(MAC)require('./mac-engine.cjs').registerScheme(protocol);
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {execFile}=require('node:child_process');
const core=require('../core.cjs');
const gate=require('../account-gate.cjs').createAccountGate();
const {surfaceRows}=require('../playback-core.cjs');
function createEngine(w){if(MAC){const {MacEngine}=require('./mac-engine.cjs');return new MacEngine(w,()=>store.settings?.userAgent);}const {EmbeddedVlc}=require('./embedded-vlc.cjs');return new EmbeddedVlc(w);}
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
 return {platform:PLATFORM.id,platformName:PLATFORM.name,version:app.getVersion(),linked:!!store.user,locked:!!store.user&&!gate.unlocked,user:gate.unlocked?store.user||'':'',code:linkCode,maintenance,
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
async function poll(){
 if(pollBusy||!store.token)return;pollBusy=true;
 try{
  const session=sessions[0];
  const r=await site({action:'poll',login:store.user||'',version:app.getVersion(),watching:session?{kind:session.item.kind==='episode'?'series':session.item.kind,title:session.item.name,category:session.item.categoryName||'',player:'VLC',since:session.since}:null});
  maintenance=r.maintenance?.enabled?r.maintenance.message:null;
  if(maintenance)await stopAll();
  let changed=false;
  if(r.credentials){gate.lock();await stopAll();store.user=r.credentials.username;store.pass=r.credentials.password;store.account=null;excessSince=0;excessReported=false;changed=true;cache.clear();}
  if(r.dns&&r.dns!==store.dns){store.dns=r.dns;changed=true;cache.clear();}
  if(changed){save();if(store.user&&gate.unlocked)await refresh();}
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
 store.progress=store.progress||{};store.progress[key(session.item)]={position:session.position||0,duration:session.duration};save();
}
async function stopAll(){
 for(const s of sessions){const status=engine?.status(s.index);if(status)Object.assign(s,status);persistProgress(s);engine?.stop(s.index);}
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
 const urls=core.streamUrls(store.dns,store.user,store.pass,item,store.settings?.format||'auto');
 if(!engine)engine=createEngine(win);
 const index=sessions.length,watched=store.progress?.[key(item)];
 try{engine.play(index,urls[0],{buffer:store.settings?.buffer,live:item.kind!=='catchup',subtitles:['film','episode'].includes(item.kind)?subtitles!==false:null,resume:resume&&watched&&core.resume(watched.position,watched.duration)?watched.position:0});}
 catch{engine.stop(index);throw new Error('In-app playback could not start. Reinstall BM Player using the '+PLATFORM.name+' download and try again.');}
 const session={index,item,position:0,duration:0,since:Date.now(),urls,urlIndex:0,paused:false,subCheck:['film','episode'].includes(item.kind)&&subtitles!==false};sessions.push(session);
 if(awake===null)awake=powerSaveBlocker.start('prevent-display-sleep');
 if(item.kind!=='catchup'&&!core.adult(item.categoryName)){store.recent=[item,...(store.recent||[]).filter(i=>i.id!==item.id||i.kind!==item.kind)].slice(0,100);save();}
 lastInput=Date.now();promptedAt=0;poll();send({type:'state',state:publicState()});return true;
}
async function updatePlayback(){for(const session of [...sessions]){try{const s=engine?.status(session.index);if(!s)continue;Object.assign(session,s);session.paused=s.state===4;
 if((s.state===7||s.state===5)&&Date.now()-session.since>15000){if(session.urlIndex+1<session.urls.length){session.urlIndex++;session.since=Date.now();engine.play(session.index,session.urls[session.urlIndex],{buffer:store.settings?.buffer});}else if(!session.failed){session.failed=true;send({type:'notice',message:'This stream could not play. Try another channel or report the issue.'});}}
 // Like Android: subtitles start on; only ask (paused) when the film actually has some.
 if(session.subCheck&&s.state===3){const n=Number(engine.subtitleTracks?.(session.index))||0;if(n>0){session.subCheck=false;engine.pause(session.index,true);session.paused=true;send({type:'subtitles-found',index:session.index,item:session.item});}else if(Date.now()-session.since>25000)session.subCheck=false;}
 persistProgress(session);send({type:'playback',index:session.index,item:session.item,position:session.position,duration:session.duration,paused:session.paused,seekable:session.seekable});}catch{}}}
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
 if(!promptedAt&&now-lastInput>=core.IDLE_MS){promptedAt=now;await foreground();send({type:'inactive',seconds:60});}
 if(promptedAt){if(now-promptedAt>=core.RESPONSE_MS){await stopAll();app.quit();return;}send({type:'inactive',seconds:Math.ceil((core.RESPONSE_MS-(now-promptedAt))/1000)});}
 for(const reminder of store.reminders||[]){if(!reminder.notified&&reminder.start-300000<=now&&reminder.start>now){reminder.notified=true;save();await foreground();send({type:'reminder',reminder});}}
}
function trusted(event){return event.sender===win?.webContents&&event.senderFrame?.url===pathToFileURL(page).href;}
function register(name,fn){ipcMain.handle('player:'+name,async(event,value)=>{if(!trusted(event))throw new Error('Untrusted window.');if(!['state','link','unlock','exit','openLink','stop'].includes(name))gate.require();if(!promptedAt)lastInput=Date.now();return fn(value);});}
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
  register('state',()=>publicState());register('link',getCode);register('refresh',refresh);register('catalog',catalogue);register('epg',epg);register('catchup',catchup);register('sports',()=>site({action:'sports'}));
  register('unlock',async number=>{await gate.unlock(number,site);send({type:'state',state:publicState()});refresh().catch(e=>send({type:'notice',message:e.message}));connectionCheck();return publicState();});
  register('series',async id=>{const r=await provider('get_series_info',{series_id:String(id)});return{info:{plot:String(r.info?.plot||'').slice(0,10000),cover:String(r.info?.cover||'')},episodes:Object.fromEntries(Object.entries(r.episodes||{}).map(([season,rows])=>[season,rows.map(p=>({...core.itemFromProvider('episode',p),name:p.title||'Episode '+p.episode_num,episode:p.episode_num,season}))]))};});
  electronSession.defaultSession.setPermissionRequestHandler((wc,perm,cb,details)=>cb(perm==='media'&&wc===win?.webContents&&(details?.mediaTypes||['audio']).every(t=>t==='audio')));
  electronSession.defaultSession.setPermissionCheckHandler((wc,perm)=>perm==='media'&&wc===win?.webContents);
  register('micAccess',async()=>{if(MAC&&systemPreferences.getMediaAccessStatus('microphone')!=='granted')return systemPreferences.askForMediaAccess('microphone');return true;});
  register('voice',async v=>{const audio=String(v?.audio||'');if(!['audio/wav','audio/webm'].includes(v?.mime)||audio.length<100||audio.length>1700000||!/^[A-Za-z0-9+/=]+$/.test(audio))throw new Error('That recording could not be used. Try again.');const r=await site({action:'voice',audio,mime:v.mime});return String(r.text||'');});
  register('ratings',items=>{if(!Array.isArray(items)||!items.length||items.length>200)throw new Error('Choose titles to rate.');return site({action:'ratings',items:items.map(r=>({kind:r.kind,title:String(r.title||'').slice(0,300)}))});});
  register('vote',v=>{if(!['film','series'].includes(v?.kind)||!Number.isInteger(v?.stars)||v.stars<1||v.stars>5)throw new Error('Choose 1–5 stars.');return site({action:'vote',kind:v.kind,title:String(v.title||'').slice(0,300),stars:v.stars});});
  register('play',play);register('stop',stopAll);
  if(MAC)require('./mac-engine.cjs').handleProtocol(protocol);
  ipcMain.handle('player:videoStatus',(event,value)=>{if(!trusted(event))throw new Error('Untrusted window.');engine?.report?.(value);return true;});
  ipcMain.handle('player:surface',(event,value)=>{if(!trusted(event))throw new Error('Untrusted window.');engine?.layout(surfaceRows(value));return true;});
  register('control',value=>{
   const index=Number(value?.index),session=sessions.find(s=>s.index===index);if(!session||!engine)return false;
   if(value.action==='pause'){session.paused=!session.paused;engine.pause(index,session.paused);}
   else if(value.action==='seek'&&Number.isFinite(value.seconds))engine.seek(index,Math.max(0,Math.min(session.duration,value.seconds)));
   else if(value.action==='volume'&&Number.isFinite(value.volume))engine.volume(index,Math.max(0,Math.min(100,Math.round(value.volume))));
   else if(value.action==='subtitles'){engine.setSubtitles?.(index,value.on===true);session.paused=false;engine.pause(index,false);}
   else if(value.action==='audio')for(const s of sessions)engine.volume(s.index,s.index===index?100:0);
   send({type:'state',state:publicState()});return true;
  });
  register('settings',async value=>{
   if(value?.logout){await stopAll();await site({action:'unlink'});gate.lock();store.token=null;store.user=null;store.pass=null;store.account=null;cache.clear();save();await getCode();}
   else if(value?.clear){store.recent=[];store.progress={};save();}
   else if(value){store.settings={...store.settings,...value};save();}
   return publicState();
  });
  register('favourite',item=>{store.favourites=store.favourites||[];const at=store.favourites.findIndex(i=>i.id===item.id&&i.kind===item.kind);if(at<0)store.favourites.push(item);else store.favourites.splice(at,1);save();return publicState();});
  register('report',v=>site({action:'report',kind:v.item.kind==='episode'?'series':v.item.kind,title:v.item.name,category:v.item.categoryName,episode:v.item.kind==='episode'?v.item.name:undefined,issue:String(v.issue||'').slice(0,1000),device:PLATFORM.device,version:app.getVersion()}));
  register('reminder',value=>{store.reminders=store.reminders||[];if(value.remove)store.reminders=store.reminders.filter(r=>r.id!==value.id);else{if(value.start<=Date.now())throw new Error('Reminders are only for programmes that have not started.');store.reminders.push({...value,id:String(value.item.id)+':'+value.start,notified:false});}save();return publicState();});
  register('continue',()=>{lastInput=Date.now();promptedAt=0;send({type:'inactive',seconds:0});return true;});register('exit',async()=>{await stopAll();app.quit();});
  register('openLink',()=>shell.openExternal(SITE+'/send-to-app'));
  register('speed',async()=>{const start=Date.now();await fetch('https://speed.cloudflare.com/__down?bytes=100',{signal:AbortSignal.timeout(10000)});const ping=Date.now()-start;const down=Date.now();const r=await fetch('https://speed.cloudflare.com/__down?bytes=10000000',{signal:AbortSignal.timeout(20000)});const bytes=(await r.arrayBuffer()).byteLength;const download=bytes*8/(Date.now()-down)/1000;const up=Date.now();await fetch('https://speed.cloudflare.com/__up',{method:'POST',body:new Uint8Array(3000000),signal:AbortSignal.timeout(20000)});return{ping,download,upload:3000000*8/(Date.now()-up)/1000};});
  await win.loadFile(page);
  if(!store.user)getCode().catch(e=>send({type:'notice',message:e.message}));else{poll();}
  setInterval(poll,store.user?60000:5000);setInterval(connectionCheck,30000);setInterval(updatePlayback,5000);setInterval(timers,1000);setInterval(systemInput,15000);connectionCheck();
 });
 app.on('activate',foreground);
 app.on('window-all-closed',async()=>{await stopAll();app.quit();});
 app.on('before-quit',()=>{for(const session of sessions){const status=engine?.status(session.index);if(status)Object.assign(session,status);persistProgress(session);}engine?.close();engine=null;});
}