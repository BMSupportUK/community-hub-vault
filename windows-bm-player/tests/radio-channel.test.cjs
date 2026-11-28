const {test,expect}=require('bun:test');
const {isRadio}=require('../radio-channel.cjs');
const recovery=require('../stream-recovery.cjs');
const {feedStatus}=require('../feed-status.cjs');

test('radio categories and station names are audio-only, ordinary TV is unchanged',()=>{
 expect(isRadio({name:'BBC Radio 1',categoryName:'UK | Music'})).toBe(true);
 expect(isRadio({name:'Capital FM',categoryName:'UK | Radio Stations'})).toBe(true);
 expect(isRadio({name:'BBC One',categoryName:'UK | Free to air'})).toBe(false);
});

test('radio never reconnects for an absent video picture',()=>{
 const session={item:{kind:'live',name:'BBC Radio 1'},radio:true,ready:true};
 for(let now=1000;now<=120000;now+=1000)expect(recovery.frozen(session,3,0,now,{videoFrames:0})).toBe(false);
});

test('radio does not show a false No picture or permanent Loading channel warning',()=>{
 const session={item:{kind:'live',name:'BBC Radio 1'},radio:true,since:Date.now()-30000,ready:true};
 expect(feedStatus(session,{state:3,w:0,videoFrames:0})).toBe(null);
 expect(feedStatus({...session,ready:false},{state:2,w:0,videoFrames:0})).toBe(null);
});

test('a genuine radio network stall still reconnects',()=>{
 const session={item:{kind:'live',name:'BBC Radio 1'},radio:true,ready:true};
 recovery.tick(session,3,1000,true);
 recovery.tick(session,2,2000,true);
 expect(recovery.tick(session,2,14000,true).reconnect).toBe(1000);
});
