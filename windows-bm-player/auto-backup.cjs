'use strict';
// Automatic backup channel (keep in step with Android LiveReconnect.wantsBackup / PlayerActionControls.autoBackup).
const WINDOW_MS=120000, AFTER=3, RETURN_MS=600000;
/** Records one reconnect; true once 3 happened inside two minutes. */
function wantsBackup(times,now){times.push(now);while(times.length&&now-times[0]>WINDOW_MS)times.shift();return times.length>=AFTER;}
/** First working option, or null. */
function pick(items){return (items||[]).find(o=>o&&!o.down)||null;}
module.exports={WINDOW_MS,AFTER,RETURN_MS,wantsBackup,pick};
