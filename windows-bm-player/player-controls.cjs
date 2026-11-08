'use strict';
const HIDE_MS=3500;
const canSkip=kind=>kind==='film'||kind==='episode';
const canReport=kind=>kind!=='catchup';
const canSwap=kind=>kind==='live';
const skipPosition=(position,duration,delta)=>Math.max(0,Math.min(duration,position+delta));
const visible=(now,lastInput,held=false)=>held||now-lastInput<HIDE_MS;
module.exports={HIDE_MS,canSkip,canReport,canSwap,skipPosition,visible};