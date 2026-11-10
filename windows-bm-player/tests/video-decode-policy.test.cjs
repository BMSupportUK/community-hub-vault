const {test,expect}=require('bun:test');
const {decodeOptions}=require('../video-decode-policy.cjs');
const {EmbeddedVlc}=require('../electron/embedded-vlc.cjs');
test('FHD live uses hardware auto instead of forced software',()=>{
 expect(decodeOptions({kind:'live',name:'TNT Sports 1 FHD'})).toEqual([':avcodec-hw=any']);
});
test('MonoMax and catch up retain software corruption protection',()=>{
 expect(decodeOptions({kind:'live',name:'MonoMax FHD'})).toEqual([':avcodec-hw=none']);
 expect(decodeOptions({kind:'catchup',name:'TNT Sports FHD'})).toEqual([':avcodec-hw=none']);
});
test('unrelated channels retain their existing decoder',()=>{
 expect(decodeOptions({kind:'live',name:'BBC One HD'})).toEqual([':avcodec-hw=none']);
});
test('native FHD playback and reconnect retain hardware choice',()=>{
 const options=[],surface={player:1};
 const engine=Object.create(EmbeddedVlc.prototype);engine.surface=()=>surface;engine.volume=()=>{};
 engine.api={media_player_stop:()=>{},media_new_location:()=>2,media_add_option:(_,value)=>options.push(value),media_player_set_media:()=>{},media_release:()=>{},media_player_play:()=>0};
 engine.play(0,'test',{kind:'live',name:'TNT Sports FHD'});
 engine.play(0,'test',{buffer:30000});
 expect(options.filter(x=>x.startsWith(':avcodec-hw='))).toEqual([':avcodec-hw=any',':avcodec-hw=any']);
 engine.play(0,'test',{kind:'catchup',name:'TNT Sports FHD'});
 expect(options.at(-1)).toBe(':avcodec-hw=none');
});