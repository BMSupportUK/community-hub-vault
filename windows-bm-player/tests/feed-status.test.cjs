const {test,expect}=require('bun:test');const assert={equal:(a,b)=>expect(a).toBe(b),ok:(v)=>expect(!!v).toBe(true)};
const {feedStatus,LABELS}=require('../feed-status.cjs');
const liveSession=(over={})=>({item:{kind:'live',name:'Sky Sports'},since:Date.now()-30000,ready:true,backup:false,...over});
test('healthy live feed shows no pill',()=>{assert.equal(feedStatus(liveSession(),{state:3,w:1920}),null);});
test('playing with no picture 10s after opening is black',()=>{assert.equal(feedStatus(liveSession(),{state:3,w:0}),'black');});
test('black needs the 10s grace after opening',()=>{assert.equal(feedStatus(liveSession({since:Date.now()-5000}),{state:3,w:0}),'loading');});
test('buffering after the feed was ready shows Buffering',()=>{assert.equal(feedStatus(liveSession(),{state:2}),'buffering');});
test('initial load buffering shows Loading channel until first picture',()=>{assert.equal(feedStatus(liveSession({ready:false}),{state:2}),'loading');});
test('films and episodes never show the pill',()=>{assert.equal(feedStatus(liveSession({item:{kind:'film',name:'Film'}}),{state:2}),null);});
test('labels match the Android pill wording',()=>{assert.equal(LABELS.black,'No picture');assert.equal(LABELS.buffering,'Buffering…');});

test('live shows Loading channel until the first picture appears', () => {

  const session = { item: { kind: 'live' }, since: Date.now(), ready: false };
  assert.equal(feedStatus(session, { state: 1 }), 'loading');
  assert.equal(LABELS.loading, 'Loading channel…');
  assert.equal(feedStatus(session, { state: 3, videoFrames: 4 }), null);
  assert.equal(feedStatus(session, { state: 3, w: 1920 }), null);
});
