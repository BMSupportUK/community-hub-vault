const {test,expect}=require('bun:test');
const {EmbeddedVlc}=require('../electron/embedded-vlc.cjs');
test('embedded playback owns its video window and releases playback before destroying it',()=>{
 const calls=[];
 const koffi={load:()=>({func:(...args)=>{
  const name=args[0]==='__stdcall'?args[1]:args[0];
  return (...values)=>{
   calls.push({name,values});
   if(name==='GetClientRect'){values[1].writeInt32LE(1280,8);values[1].writeInt32LE(900,12);return true;}
   if(['libvlc_new','libvlc_media_player_new','libvlc_media_new_location','CreateWindowExW'].includes(name))return 1n;
   if(name==='libvlc_media_player_get_time')return 120000;
   if(name==='libvlc_media_player_get_length')return 600000;
   if(name==='libvlc_media_player_is_seekable')return 1;
   if(name==='libvlc_media_player_get_media')return 2n;
   if(name==='libvlc_media_get_stats'){values[1].writeInt32LE(250,32);return 1;}
   return 0;
  };
 }})};
 const handle=Buffer.alloc(8);handle.writeBigUInt64LE(42n);
 const old=process.env.VLC_PLUGIN_PATH;
 try{
  const engine=new EmbeddedVlc({getNativeWindowHandle:()=>handle},{koffi,root:'/tmp/test-vlc'});
  engine.play(0,'https://example.invalid/test.mp4',{resume:120});
  expect(calls.find(c=>c.name==='CreateWindowExW').values[8]).toBe(42n);
  engine.layout([{index:0,x:0.5,y:0.1,width:0.5,height:0.5,visible:true}]);
  expect(calls.find(c=>c.name==='SetWindowPos').values.slice(2,6)).toEqual([640,90,640,450]);
  expect(engine.status(0).position).toBe(120);
  expect(engine.status(0).videoFrames).toBe(250);
  expect(engine.status(0).nativeVideo).toBe(true);
  engine.pause(0,true);engine.seek(0,200);engine.close();
  const names=calls.map(c=>c.name);
  expect(names.indexOf('libvlc_media_player_release')).toBeLessThan(names.indexOf('DestroyWindow'));
  expect(names.indexOf('DestroyWindow')).toBeLessThan(names.lastIndexOf('libvlc_release'));
 }finally{if(old===undefined)delete process.env.VLC_PLUGIN_PATH;else process.env.VLC_PLUGIN_PATH=old;}
});
test('each multi-screen pane has its own DirectSound output; picking a screen unmutes it and mutes the others',()=>{
 const calls=[];const mute={},vol={};let args=[];
 const koffi={load:()=>({func:(...a)=>{
  const name=a[0]==='__stdcall'?a[1]:a[0];
  return (...values)=>{
   calls.push({name,values});
   if(name==='GetClientRect'){values[1].writeInt32LE(1280,8);values[1].writeInt32LE(900,12);return true;}
   if(name==='libvlc_new'){args=values[1];return 1n;}
   if(name==='libvlc_media_player_new'){return BigInt(calls.filter(c=>c.name==='libvlc_media_player_new').length+10);}
   if(['libvlc_media_new_location','CreateWindowExW'].includes(name))return 1n;
   if(name==='libvlc_audio_get_track')return 1;
   if(name==='libvlc_audio_get_mute')return mute[values[0]]??0;
   if(name==='libvlc_audio_set_mute'){mute[values[0]]=values[1];return;}
   if(name==='libvlc_audio_get_volume')return vol[values[0]]??100;
   if(name==='libvlc_audio_set_volume'){vol[values[0]]=values[1];return 0;}
   return 0;
  };
 }})};
 const handle=Buffer.alloc(8);handle.writeBigUInt64LE(42n);
 const engine=new EmbeddedVlc({getNativeWindowHandle:()=>handle},{koffi,root:'/tmp/test-vlc'});
 expect(args).toContain('--aout=directsound');
 engine.play(0,'https://example.invalid/a.ts',{});
 engine.play(1,'https://example.invalid/b.ts',{});
 const a=engine.surfaces.get(0).player,b=engine.surfaces.get(1).player;
 expect([mute[a]??0,vol[a]??100]).toEqual([0,100]);
 expect([mute[b],vol[b]]).toEqual([1,0]);
 // Click screen 2: it gets the sound, screen 1 goes quiet.
 engine.volume(1,100);engine.volume(0,0);
 expect([mute[b],vol[b]]).toEqual([0,100]);
 expect([mute[a],vol[a]]).toEqual([1,0]);
 // A reconnect on screen 2 keeps its sound.
 engine.play(1,'https://example.invalid/b2.ts',{});
 expect([mute[b],vol[b]]).toEqual([0,100]);
 engine.close();
});
