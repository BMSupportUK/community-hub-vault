'use strict';
const HIDE_MS=3500;
const canSkip=kind=>kind==='film'||kind==='episode';
const canReport=kind=>kind!=='catchup';
const canSwap=kind=>kind==='live';
const skipPosition=(position,duration,delta)=>Math.max(0,Math.min(duration,position+delta));
const visible=(now,lastInput,held=false)=>held||now-lastInput<HIDE_MS;
// Full screen: a native picture can't sit under the buttons, so mouse movement alone never reveals them (that shrank the picture).
const revealEvents=fullscreen=>fullscreen?['pointerdown','keydown','focusin']:['pointermove','pointerdown','keydown','focusin'];
module.exports={HIDE_MS,revealEvents,canSkip,canReport,canSwap,skipPosition,visible};