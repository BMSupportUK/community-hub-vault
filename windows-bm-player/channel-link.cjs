'use strict';
// Channel connection rating (Windows/Mac), matching Android ChannelLink: channel ping, stalls and reconnects
// over the last two minutes. A channel opening or a VPN server change gets 45s grace so the switch itself is never a fault.
const WINDOW_MS=120000,SWITCH_GRACE_MS=45000;
function createLink(now=Date.now()){
 let ping=-1,switchedAt=now;const stalls=[],reconnects=[];
 const grace=t=>t-switchedAt<=SWITCH_GRACE_MS;
 const recent=(q,t)=>{while(q.length&&t-q[0]>WINDOW_MS)q.shift();return q.length;};
 return {
  ping(ms){if(ms>0)ping=ping<0?ms:Math.round((ping*2+ms)/3);},
  stalled(t=Date.now()){if(!grace(t))stalls.push(t);},
  reconnected(t=Date.now()){if(!grace(t))reconnects.push(t);},
  // Keeps the last ping so the rating stays steady through the switch; only old faults are dropped.
  serverChanged(t=Date.now()){switchedAt=t;stalls.length=0;reconnects.length=0;},
  rating(t=Date.now()){
   const s=recent(stalls,t),r=recent(reconnects,t);
   if(ping<0&&s===0&&r===0)return 'Checking';
   if(r>=2||s>=3||ping>400)return 'Poor';
   if(r===1||s>=1||ping>200)return 'Fair';
   if(ping>80)return 'Good';
   return 'Excellent';
  },
  snapshot(t=Date.now()){return {rating:this.rating(t),ping:ping>0?ping:0};},
 };
}
module.exports={createLink,WINDOW_MS,SWITCH_GRACE_MS};
