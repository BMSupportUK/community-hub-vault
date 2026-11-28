const {test,expect}=require('bun:test');
const {isRadio,splitRadioChannels}=require('../radio-channel.cjs');
const recovery=require('../stream-recovery.cjs');
const {feedStatus}=require('../feed-status.cjs');

test('radio categories and station names are audio-only, ordinary TV is unchanged',()=>{
 expect(isRadio({name:'BBC Radio 1',categoryName:'UK | Music'})).toBe(true);
 expect(isRadio({name:'Capital FM',categoryName:'UK | Radio Stations'})).toBe(true);
 expect(isRadio({name:'BBC One',categoryName:'UK | Free to air'})).toBe(false);
});

test('radio and television channels have separate browsers and EPG categories',()=>{
 const data={categories:[{id:'1',name:'UK | Free to air'},{id:'2',name:'UK | Radio Stations'}],items:[{id:'tv',name:'BBC One',category:'1'},{id:'radio',name:'Capital FM',category:'2'}]};
 expect(splitRadioChannels(data,false).items.map(item=>item.id)).toEqual(['tv']);
 expect(splitRadioChannels(data,false).categories.map(category=>category.id)).toEqual(['1']);
 expect(splitRadioChannels(data,true).items.map(item=>item.id)).toEqual(['radio']);
 expect(splitRadioChannels(data,true).categories.map(category=>category.id)).toEqual(['2']);
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
