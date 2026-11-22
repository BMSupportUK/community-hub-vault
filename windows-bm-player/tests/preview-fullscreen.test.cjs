const {test,expect}=require('bun:test');
const {previewFullScreen}=require('../guide-action.cjs');
test('the preview full-screen control shows only while a preview is playing',()=>{
 expect(previewFullScreen([])).toBe(null);
 expect(previewFullScreen(null)).toBe(null);
 expect(previewFullScreen([{item:{id:'7',name:'Ch'}}]).id).toBe('7');
});
test('the control opens the channel being previewed, never another one',()=>{
 const t=previewFullScreen([{item:{id:'7',name:'Ch'}},{item:{id:'8',name:'Other'}}]);
 expect(t.id).toBe('7');
});
