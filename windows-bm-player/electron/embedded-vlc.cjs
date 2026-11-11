const path=require('node:path');
const os=require('node:os');
const fs=require('node:fs');
const {decodeOptions}=require('../video-decode-policy.cjs');

/** Native surfaces belong to BM Player, never a separately launched VLC process. */
class EmbeddedVlc {
 constructor(win,{koffi,root}={}) {
  if(!koffi&&process.platform!=='win32')throw new Error('Embedded playback requires Windows.');
  this.win=win;this.k=koffi||require('../vendor/koffi');this.surfaces=new Map();
  root=root||path.join(__dirname,'../tools/vlc-3.0.21');
  process.env.VLC_PLUGIN_PATH=path.join(root,'plugins');
  const kernel=this.k.load('kernel32.dll');
  kernel.func('__stdcall','SetDllDirectoryW','bool',['str16'])(root);
  this.user=this.k.load('user32.dll');
  this.create=this.user.func('__stdcall','CreateWindowExW','void *',['uint32','str16','str16','uint32','int','int','int','int','void *','void *','void *','void *']);
  this.move=this.user.func('__stdcall','SetWindowPos','bool',['void *','void *','int','int','int','int','uint32']);
  this.show=this.user.func('__stdcall','ShowWindow','bool',['void *','int']);
  this.destroy=this.user.func('__stdcall','DestroyWindow','bool',['void *']);
  this.client=this.user.func('__stdcall','GetClientRect','bool',['void *','void *']);
  // Clicks on a picture land in VLC's own window, never the page, so the main process reads them natively to move the sound.
  try{this.keyState=this.user.func('__stdcall','GetAsyncKeyState','short',['int']);this.cursor=this.user.func('__stdcall','GetCursorPos','bool',['void *']);this.winRect=this.user.func('__stdcall','GetWindowRect','bool',['void *','void *']);this.visible=this.user.func('__stdcall','IsWindowVisible','bool',['void *']);}catch{}
  this.dll=this.k.load(path.join(root,'libvlc.dll'));
  const api={new:['void *',['int','const char **']],release:['void',['void *']],media_new_location:['void *',['void *','str']],media_add_option:['void',['void *','str']],media_release:['void',['void *']],media_player_new:['void *',['void *']],media_player_release:['void',['void *']],media_player_set_media:['void',['void *','void *']],media_player_set_hwnd:['void',['void *','void *']],media_player_play:['int',['void *']],media_player_stop:['void',['void *']],media_player_set_pause:['void',['void *','int']],media_player_get_state:['int',['void *']],media_player_get_time:['int64',['void *']],media_player_get_length:['int64',['void *']],media_player_set_time:['void',['void *','int64']],media_player_is_seekable:['int',['void *']],audio_set_volume:['int',['void *','int']],audio_set_mute:['void',['void *','int']],audio_get_volume:['int',['void *']],media_player_set_rate:['int',['void *','float']],audio_get_track:['int',['void *']],audio_set_track:['int',['void *','int']],audio_get_track_description:['void *',['void *']],video_get_spu:['int',['void *']],video_take_snapshot:['int',['void *','uint','str','uint','uint']],video_get_size:['int',['void *','uint','_Out_ uint *','_Out_ uint *']],video_set_mouse_input:['void',['void *','uint']],video_set_key_input:['void',['void *','uint']],video_get_spu_count:['int',['void *']],video_set_spu:['int',['void *','int']],video_get_spu_description:['void *',['void *']],track_description_list_release:['void',['void *']]};
  this.api=Object.fromEntries(Object.entries(api).map(([name,[ret,args]])=>[name,this.dll.func('libvlc_'+name,ret,args)]));
  this.api.media_player_get_media=this.dll.func('libvlc_media_player_get_media','void *',['void *']);
  this.api.media_get_stats=this.dll.func('libvlc_media_get_stats','int',['void *','void *']);
  const args=['--ignore-config','--no-video-title-show','--no-osd','--stats','--quiet'];
  this.instance=this.api.new(args.length,args);
  if(!this.instance)throw new Error('The included playback engine could not initialise.');
  const buffer=win.getNativeWindowHandle();this.parent=buffer.length===8?buffer.readBigUInt64LE():BigInt(buffer.readUInt32LE());
 }
 surface(index){
  if(this.surfaces.has(index))return this.surfaces.get(index);
  // One window per pane, handed to libVLC once; it is only ever moved/resized with the pane, never zoomed or cropped (that left a stale second picture).
  const hwnd=this.create(0,'STATIC','BM Player video',0x40000000|0x04000000|0x02000000,0,0,1,1,this.parent,null,null,null);
  if(!hwnd)throw new Error('The in-app video surface could not be created.');
  const player=this.api.media_player_new(this.instance);
  if(!player){this.destroy(hwnd);throw new Error('The included player could not start.');}
  this.api.media_player_set_hwnd(player,hwnd);
  this.api.video_set_mouse_input(player,0);this.api.video_set_key_input(player,0);
  const s={hwnd,player,index};this.surfaces.set(index,s);return s;
 }
 play(index,url,{buffer=8000,resume=0,subtitles=null,maxHeight=0,fill=false,kind,name}={}){
  const s=this.surface(index);s.fill=!!fill;this.api.media_player_stop(s.player);
  if(kind!==undefined)s.decodeContext={kind,name};
  const media=this.api.media_new_location(this.instance,url);
  if(!media)throw new Error('This stream could not be opened.');
  try{
   this.api.media_add_option(media,':network-caching='+Math.max(500,Math.min(Number(buffer)===30000?30000:15000,Number(buffer)||3000)));
   this.api.media_add_option(media,':http-user-agent=VLC/3.0.21 LibVLC/3.0.21');
   // Demanding live channels use available hardware with VLC's software fallback;
   // recordings and MonoMax retain their corruption workaround, including retries.
   for(const option of decodeOptions(s.decodeContext))this.api.media_add_option(media,option);
   if(maxHeight>0)this.api.media_add_option(media,':adaptive-maxheight='+Math.floor(maxHeight));
   if(subtitles===false)this.api.media_add_option(media,':no-spu');
   if(subtitles===true)this.api.media_add_option(media,':sub-track=0');
   if(resume>0)this.api.media_add_option(media,':start-time='+Math.floor(resume));
   this.api.media_player_set_media(s.player,media);
  }finally{this.api.media_release(media);}
  if(this.api.media_player_play(s.player)<0)throw new Error('This stream could not start.');
  // A reconnect or swap on a screen keeps its sound choice; only a brand-new screen starts silent (screen 1 audible).
  this.volume(index,s.wantVolume!=null?s.wantVolume:index===0?100:0);
 }
 layout(rows){
  const rect=Buffer.alloc(16);if(!this.client(this.parent,rect))return;
  const width=rect.readInt32LE(8),height=rect.readInt32LE(12);
  const shown=new Set();
  for(const row of rows||[]){
   const s=this.surfaces.get(row.index);if(!s)continue;
   shown.add(row.index);
   if(!row.visible){this.show(s.hwnd,0);continue;}
   const x=Math.round(row.x*width),y=Math.round(row.y*height),w=Math.round(row.width*width),h=Math.round(row.height*height);
   this.move(s.hwnd,null,x,y,w,h,0x0010|0x0040);this.show(s.hwnd,5);
  }
  for(const [index,s]of this.surfaces)if(!shown.has(index))this.show(s.hwnd,0);
 }
 /** Index of the visible screen just clicked with the left mouse button, or null. */
 clickedPane(){if(!this.keyState||this.surfaces.size<2)return null;try{
  // Low bit = pressed since the last poll, so a quick click between 60ms polls is never missed.
  const st=this.keyState(0x01),down=(st&0x8000)!==0,was=this.mouseDown;this.mouseDown=down;if(!((st&1)||(down&&!was)))return null;
  const pt=Buffer.alloc(8);if(!this.cursor(pt))return null;const x=pt.readInt32LE(0),y=pt.readInt32LE(4);
  for(const [index,s]of this.surfaces){if(!this.visible(s.hwnd))continue;const r=Buffer.alloc(16);if(!this.winRect(s.hwnd,r))continue;if(x>=r.readInt32LE(0)&&x<r.readInt32LE(8)&&y>=r.readInt32LE(4)&&y<r.readInt32LE(12))return index;}
 }catch{}return null;}
 /** Black-bar zoom removed: any live re-sizing of the picture caused a duplicate frame on Windows. */
 checkBars(){}
 status(index){const s=this.surfaces.get(index);if(!s)return null;this.applyVolume(s);return{position:Math.max(0,Number(this.api.media_player_get_time(s.player))/1000),duration:Math.max(0,Number(this.api.media_player_get_length(s.player))/1000),state:this.api.media_player_get_state(s.player),seekable:!!this.api.media_player_is_seekable(s.player),nativeVideo:true,...this.pictureProgress(s.player),...this.size(s.player)};}
 /** VLC 3's live MPEG-TS clock may stay at zero while pictures advance. */
 pictureProgress(player){try{const media=this.api.media_player_get_media(player);if(!media)return{};const stats=Buffer.alloc(60);if(!this.api.media_get_stats(media,stats))return{};return{videoFrames:stats.readInt32LE(32)};}catch{return{};}}
 size(player){try{const w=[0],h=[0];if(this.api.video_get_size(player,0,w,h)===0)return{w:w[0]||0,h:h[0]||0};}catch{}return{};}
 pause(index,paused){const s=this.surfaces.get(index);if(s)this.api.media_player_set_pause(s.player,paused?1:0);}
 seek(index,seconds){const s=this.surfaces.get(index);if(s&&this.api.media_player_is_seekable(s.player))this.api.media_player_set_time(s.player,Math.round(seconds*1000));}
 // Windows libVLC 3 (WASAPI) shares one volume/mute for every player in the app, so muting a quiet screen silenced or un-silenced the others and they fought.
 // Quiet screens therefore switch their sound track off (each player owns that) and never touch volume/mute; only the chosen screen sets them.
 // libVLC also ignores this before the stream's sound exists and resets it on new media, so a short timer re-applies it.
 volume(index,value){const s=this.surfaces.get(index);if(!s)return;s.wantVolume=value;this.applyVolume(s);this.keepAudio();}
 applyVolume(s){if(s.wantVolume==null)return;try{
  if(s.wantVolume<=0){if(this.api.audio_get_track(s.player)!==-1)this.api.audio_set_track(s.player,-1);return;}
  if(this.api.audio_get_track(s.player)===-1){const ids=this.trackRows(s.index,'audio').map(t=>t.id);const id=ids.includes(s.audioId)?s.audioId:ids[0];if(id!=null)this.api.audio_set_track(s.player,id);}
  this.api.audio_set_mute(s.player,0);if(this.api.audio_get_volume(s.player)!==s.wantVolume)this.api.audio_set_volume(s.player,s.wantVolume);
 }catch{}}
 keepAudio(){if(this.audioTimer)return;this.audioTimer=setInterval(()=>{if(!this.surfaces.size){clearInterval(this.audioTimer);this.audioTimer=null;return;}for(const s of this.surfaces.values())this.applyVolume(s);},400);this.audioTimer.unref?.();}
 /** Real subtitle track ids (VLC's list also holds a "Disable" entry with id -1). */
 spuIds(index){const s=this.surfaces.get(index);if(!s)return[];if(!this.desc)this.desc=this.k.struct('BMTrackDescription',{i_id:'int',psz_name:'char *',p_next:'void *'});const head=this.api.video_get_spu_description(s.player);if(!head)return[];const ids=[];try{let p=head;for(let n=0;p&&n<64;n++){const d=this.k.decode(p,this.desc);if(d.i_id!==-1)ids.push(d.i_id);p=d.p_next;}}finally{this.api.track_description_list_release(head);}return ids;}
 subtitleTracks(index){return this.spuIds(index).length;}
 setSubtitles(index,on){const s=this.surfaces.get(index);if(!s)return;const ids=on?this.spuIds(index):[];this.api.video_set_spu(s.player,on&&ids.length?ids[0]:-1);}
 trackRows(index,type){const s=this.surfaces.get(index);if(!s)return[];if(!this.desc)this.desc=this.k.struct('BMTrackDescription',{i_id:'int',psz_name:'char *',p_next:'void *'});const head=(type==='audio'?this.api.audio_get_track_description:this.api.video_get_spu_description)(s.player);if(!head)return[];const rows=[];try{let p=head;for(let n=0;p&&n<64;n++){const d=this.k.decode(p,this.desc);if(d.i_id!==-1)rows.push({id:d.i_id,name:d.psz_name?String(this.k.decode(d.psz_name,'char',-1)):type+' '+(rows.length+1)});p=d.p_next;}}finally{this.api.track_description_list_release(head);}return rows;}
 tracks(index){const s=this.surfaces.get(index);return{audio:this.trackRows(index,'audio'),subtitles:this.trackRows(index,'subtitles'),audioId:s?this.api.audio_get_track(s.player):-1,subtitleId:s?this.api.video_get_spu(s.player):-1};}
 setAudioTrack(index,id){const s=this.surfaces.get(index);if(s&&this.trackRows(index,'audio').some(t=>t.id===id)){s.audioId=id;if(!(s.wantVolume<=0))this.api.audio_set_track(s.player,id);}}
 setSubtitleTrack(index,id){const s=this.surfaces.get(index);if(s&&(id===-1||this.trackRows(index,'subtitles').some(t=>t.id===id)))this.api.video_set_spu(s.player,id);}
 speed(index,rate){const s=this.surfaces.get(index);if(s)this.api.media_player_set_rate(s.player,rate);}
 stop(index){const s=this.surfaces.get(index);if(!s)return;this.api.media_player_stop(s.player);this.api.media_player_release(s.player);this.destroy(s.hwnd);this.surfaces.delete(index);}
 close(){if(this.audioTimer){clearInterval(this.audioTimer);this.audioTimer=null;}for(const index of [...this.surfaces.keys()])this.stop(index);if(this.instance){this.api.release(this.instance);this.instance=null;}}
}
module.exports={EmbeddedVlc};