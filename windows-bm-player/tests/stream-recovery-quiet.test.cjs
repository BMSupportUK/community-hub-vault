const {test,expect}=require('bun:test');const r=require('../stream-recovery.cjs');
test('a quiet multi-screen pane is never reopened for having no sound',()=>{
 const s={item:{kind:'live'},quiet:true};let t=0;
 for(let i=0;i<20;i++){expect(r.soundLost(s,{state:3,audioBuffers:5,videoFrames:i*25},t)).toBe(false);t+=1000;}
 const heard={item:{kind:'live'}};let lost=false;t=0;
 for(let i=0;i<20;i++){lost=lost||r.soundLost(heard,{state:3,audioBuffers:5,hasAudio:true,videoFrames:i*25},t);t+=1000;}
 expect(lost).toBe(true);
});
