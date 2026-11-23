const test=require('node:test');const assert=require('node:assert');
const {paneBox}=require('../playback-core.cjs');
test('a squashed pane hides instead of resizing the picture to nothing',()=>{
 assert.equal(paneBox({x:0,y:0,width:0,height:0,visible:true},1920,1080),null);
 assert.equal(paneBox({x:0.5,y:0.5,width:0.005,height:0.3,visible:true},1920,1080),null);
});
test('a normal full-screen pane keeps its real size',()=>{
 assert.deepEqual(paneBox({x:0,y:0,width:1,height:1,visible:true},1920,1080),{x:0,y:0,w:1920,h:1080});
});
