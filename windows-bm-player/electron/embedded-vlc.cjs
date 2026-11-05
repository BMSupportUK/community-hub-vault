const path=require('node:path');

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
  this.dll=this.k.load(path.join(root,'libvlc.dll'));
  const api={new:['void *',['int','const char **']],release:['void',['void *']],media_new_location:['void *',['void *','str']],media_add_option:['void',['void *','str']],media_release:['void',['void *']],media_player_new:['void *',['void *']],media_player_release:['void',['void *']],media_player_set_media:['void',['void *','void *']],media_player_set_hwnd:['void',['void *','void *']],media_player_play:['int',['void *']],media_player_stop:['void',['void *']],media_player_set_pause:['void',['void *','int']],media_player_get_state:['int',['void *']],media_player_get_time:['int64',['void *']],media_player_get_length:['int64',['void *']],media_player_set_time:['void',['void *','int64']],media_player_is_seekable:['int',['void *']],audio_set_volume:['int',['void *','int']],video_set_crop_geometry:['void',['void *','str']],video_set_mouse_input:['void',['void *','uint']],video_set_key_input:['void',['void *','uint']],video_get_spu_count:['int',['void *']],video_set_spu:['int',['void *','int']],video_get_spu_description:['void *',['void *']],track_description_list_release:['void',['void *']]};
  this.api=Object.fromEntries(Object.entries(api).map(([name,[ret,args]])=>[name,this.dll.func('libvlc_'+name,ret,args)]));
  const args=['--ignore-config','--no-video-title-show','--no-osd','--no-stats','--quiet'];
  this.instance=this.api.new(args.length,args);
  if(!this.instance)throw new Error('The included playback engine could not initialise.');
  const buffer=win.getNativeWindowHandle();this.parent=buffer.length===8?buffer.readBigUInt64LE():BigInt(buffer.readUInt32LE());
 }
 surface(index){
  if(this.surfaces.has(index))return this.surfaces.get(index);
  const hwnd=this.create(0,'STATIC','BM Player video',0x40000000|0x04000000|0x02000000,0,0,1,1,this.parent,null,null,null);
  if(!hwnd)throw new Error('The in-app video surface could not be created.');
  const player=this.api.media_player_new(this.instance);
  if(!player){this.destroy(hwnd);throw new Error('The included player could not start.');}
  this.api.media_player_set_hwnd(player,hwnd);
  this.api.video_set_mouse_input(player,0);this.api.video_set_key_input(player,0);
  const s={hwnd,player};this.surfaces.set(index,s);return s;
 }
 play(index,url,{buffer=8000,resume=0,subtitles=null,maxHeight=0,fill=false}={}){
  const s=this.surface(index);s.fill=!!fill;s.crop='';this.api.media_player_stop(s.player);
  const media=this.api.media_new_location(this.instance,url);
  if(!media)throw new Error('This stream could not be opened.');
  try{
   this.api.media_add_option(media,':network-caching='+Math.max(500,Math.min(15000,Number(buffer)||3000)));
   this.api.media_add_option(media,':http-user-agent=VLC/3.0.21 LibVLC/3.0.21');
   if(maxHeight>0)this.api.media_add_option(media,':adaptive-maxheight='+Math.floor(maxHeight));
   if(subtitles===false)this.api.media_add_option(media,':no-spu');
   if(subtitles===true)this.api.media_add_option(media,':sub-track=0');
   if(resume>0)this.api.media_add_option(media,':start-time='+Math.floor(resume));
   this.api.media_player_set_media(s.player,media);
  }finally{this.api.media_release(media);}
  if(this.api.media_player_play(s.player)<0)throw new Error('This stream could not start.');
  this.volume(index,index===0?100:0);
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
   // Zoom: crop the picture to the surface's own shape so films and episodes fill it with no bars.
   const crop=s.fill&&w>0&&h>0?w+':'+h:'';if(crop!==s.crop){s.crop=crop;try{this.api.video_set_crop_geometry(s.player,crop||null);}catch{}}
  }
  for(const [index,s]of this.surfaces)if(!shown.has(index))this.show(s.hwnd,0);
 }
 status(index){const s=this.surfaces.get(index);if(!s)return null;return{position:Math.max(0,Number(this.api.media_player_get_time(s.player))/1000),duration:Math.max(0,Number(this.api.media_player_get_length(s.player))/1000),state:this.api.media_player_get_state(s.player),seekable:!!this.api.media_player_is_seekable(s.player)};}
 pause(index,paused){const s=this.surfaces.get(index);if(s)this.api.media_player_set_pause(s.player,paused?1:0);}
 seek(index,seconds){const s=this.surfaces.get(index);if(s&&this.api.media_player_is_seekable(s.player))this.api.media_player_set_time(s.player,Math.round(seconds*1000));}
 volume(index,value){const s=this.surfaces.get(index);if(s)this.api.audio_set_volume(s.player,value);}
 /** Real subtitle track ids (VLC's list also holds a "Disable" entry with id -1). */
 spuIds(index){const s=this.surfaces.get(index);if(!s)return[];if(!this.desc)this.desc=this.k.struct('BMTrackDescription',{i_id:'int',psz_name:'char *',p_next:'void *'});const head=this.api.video_get_spu_description(s.player);if(!head)return[];const ids=[];try{let p=head;for(let n=0;p&&n<64;n++){const d=this.k.decode(p,this.desc);if(d.i_id!==-1)ids.push(d.i_id);p=d.p_next;}}finally{this.api.track_description_list_release(head);}return ids;}
 subtitleTracks(index){return this.spuIds(index).length;}
 setSubtitles(index,on){const s=this.surfaces.get(index);if(!s)return;const ids=on?this.spuIds(index):[];this.api.video_set_spu(s.player,on&&ids.length?ids[0]:-1);}
 stop(index){const s=this.surfaces.get(index);if(!s)return;this.api.media_player_stop(s.player);this.api.media_player_release(s.player);this.destroy(s.hwnd);this.surfaces.delete(index);}
 close(){for(const index of [...this.surfaces.keys()])this.stop(index);if(this.instance){this.api.release(this.instance);this.instance=null;}}
}
module.exports={EmbeddedVlc};