const {test,expect}=require('bun:test');
const c=require('../player-controls.cjs');
test('both playback control layers hide after 3.5 seconds of inactivity',()=>{expect(c.visible(3499,0)).toBe(true);expect(c.visible(3500,0)).toBe(false);expect(c.visible(9000,0,true)).toBe(true);});
test('only films and episodes support skip controls',()=>{expect(['live','catchup','film','episode'].map(c.canSkip)).toEqual([false,false,true,true]);expect(c.skipPosition(3,100,-10)).toBe(0);expect(c.skipPosition(95,100,10)).toBe(100);});
test('catch up cannot report and only live channels can swap',()=>{expect(['live','catchup','film','episode'].map(c.canReport)).toEqual([true,false,true,true]);expect(['live','catchup','film','episode'].map(c.canSwap)).toEqual([true,false,false,false]);});
test('full screen ignores mouse movement but clicks and keys still show the buttons',()=>{expect(c.revealEvents(true)).not.toContain('pointermove');expect(c.revealEvents(true)).toEqual(expect.arrayContaining(['pointerdown','keydown']));expect(c.revealEvents(false)).toContain('pointermove');});
