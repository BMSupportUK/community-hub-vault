'use strict';
// Visible EPG rows get a fresh website answer each minute, not once per mount.
const REFRESH_MS=60000,MAX_SAVED_MS=12*3600000;
function due(fetchedAt,now=Date.now()){return fetchedAt==null||now-fetchedAt>=REFRESH_MS;}
// Owned by the signed-in App, not by a guide that unmounts during playback.
function createGuideCache(clock=Date.now){
 const rows=new Map(),pending=new Map(),attempts=new Map();let generation=0;
 return {
  peek(id){return rows.get(String(id))?.list;},
  due(id){const key=String(id);return !pending.has(key)&&due(attempts.get(key),clock());},
  load(id,fetch){
   const key=String(id),existing=rows.get(key);
   if(pending.has(key))return pending.get(key);
   if(!due(attempts.get(key),clock()))return Promise.resolve(existing?.list||[]);
   const current=generation;attempts.set(key,clock());
   const job=Promise.resolve().then(()=>fetch(id)).then(list=>{
    if(current!==generation)return [];
    if(!Array.isArray(list))throw new Error('Guide listings unavailable');
    rows.delete(key);rows.set(key,{list});attempts.set(key,clock());
    if(rows.size>400){const oldest=rows.keys().next().value;rows.delete(oldest);attempts.delete(oldest);}
    return list;
   }).catch(error=>{if(current!==generation)return [];if(existing)return existing.list;throw error;})
    .finally(()=>{if(pending.get(key)===job)pending.delete(key);});
   pending.set(key,job);return job;
  },
  // Saved rows show at once on the next open but carry no fetch time, so they refresh quietly when seen.
  snapshot(now=clock()){const out={};for(const [id,v] of rows){const list=v.list.filter(p=>Number(p.end||p.start)>now);if(list.length)out[id]=list;}return {saved:now,rows:out};},
  restore(saved,now=clock()){if(!saved||typeof saved!=='object'||now-Number(saved.saved||0)>MAX_SAVED_MS)return 0;let n=0;for(const [id,list] of Object.entries(saved.rows||{})){if(!Array.isArray(list)||rows.has(id))continue;const left=list.filter(p=>p&&Number(p.end||p.start)>now);if(left.length){rows.set(id,{list:left});n++;}}return n;},
  clear(){generation++;rows.clear();pending.clear();attempts.clear();}
 };
}
module.exports={REFRESH_MS,due,createGuideCache};