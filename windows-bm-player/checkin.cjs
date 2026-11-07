'use strict';
// Spreads BM Player check-ins so many apps never hit the website in the same second.
const state={failures:0,until:0,slow:1};
function jitter(ms,f=0.2,r=Math.random){return Math.round(ms*(1-f+2*f*r()));}
function backoff(failures,base,cap=300000,r=Math.random){return jitter(Math.min(cap,base*2**Math.min(failures,10)),0.2,r);}
function retryAfterMs(v,now=Date.now()){if(v==null||v==='')return 0;const n=Number(v);if(Number.isFinite(n))return Math.max(0,n*1000);const t=Date.parse(v);return Number.isFinite(t)?Math.max(0,t-now):0;}
function ok(){state.failures=0;state.until=0;}
function fail(retryAfter){state.failures++;const ra=retryAfterMs(retryAfter);if(ra)state.until=Date.now()+Math.min(ra,600000);}
function setSlow(n){const v=Math.round(Number(n));state.slow=Number.isFinite(v)?Math.min(10,Math.max(1,v)):1;}
function nextDelay(base,r=Math.random){const b=base*state.slow;const wait=state.failures?backoff(state.failures,b,Math.max(300000,b),r):jitter(b,0.2,r);return Math.max(wait,state.until-Date.now());}
/** Runs fn now (or after startDelay) and then repeatedly on a spread-out timer. */
function every(fn,baseMs,startDelay=0){let t;const run=async()=>{try{await fn();}catch{}t=setTimeout(run,nextDelay(baseMs()));};t=setTimeout(run,startDelay);return()=>clearTimeout(t);}
module.exports={state,jitter,backoff,retryAfterMs,ok,fail,setSlow,nextDelay,every};
