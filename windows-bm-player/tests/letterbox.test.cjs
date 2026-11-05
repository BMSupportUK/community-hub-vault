const {test,expect}=require('bun:test');
const {contentShare,BarTracker}=require('../letterbox.cjs');
function frame(w,h,bar){const px=new Uint8Array(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const v=y<bar||y>=h-bar?0:128,o=(y*w+x)*4;px[o]=px[o+1]=px[o+2]=v;px[o+3]=255;}return px;}
test('bars top and bottom are zoomed past',()=>expect(contentShare(frame(96,56,7),96,56)).toBeCloseTo(0.75));
test('full picture stays as is',()=>expect(contentShare(frame(96,56,0),96,56)).toBe(1));
test('an all-dark scene is not bars',()=>expect(contentShare(frame(96,56,28),96,56)).toBe(1));
test('zoom only after three matching readings and never back out',()=>{const t=new BarTracker();expect([t.push(.75),t.push(.75),t.push(.75),t.push(1),t.push(1),t.push(1)]).toEqual([false,false,true,false,false,false]);expect(t.share).toBe(.75);});
