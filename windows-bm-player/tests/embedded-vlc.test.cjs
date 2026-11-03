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
  engine.pause(0,true);engine.seek(0,200);engine.close();
  const names=calls.map(c=>c.name);
  expect(names.indexOf('libvlc_media_player_release')).toBeLessThan(names.indexOf('DestroyWindow'));
  expect(names.indexOf('DestroyWindow')).toBeLessThan(names.lastIndexOf('libvlc_release'));
 }finally{if(old===undefined)delete process.env.VLC_PLUGIN_PATH;else process.env.VLC_PLUGIN_PATH=old;}
});