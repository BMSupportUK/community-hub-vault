'use strict';
// Visible EPG rows get a fresh website answer each minute, not once per mount.
const REFRESH_MS=60000;
function due(fetchedAt,now=Date.now()){return fetchedAt==null||now-fetchedAt>=REFRESH_MS;}
module.exports={REFRESH_MS,due};