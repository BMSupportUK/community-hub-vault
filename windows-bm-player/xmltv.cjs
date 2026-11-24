'use strict';
// Whole-provider TV guide in one download (xmltv.php), grouped by channel id; rows match get_short_epg's shape.
const LIMIT=50;
function stamp(v){const m=/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)?\s*([+-]\d{4})?/.exec(String(v||'').trim());if(!m)return NaN;
 const utc=Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0));const z=m[7]||'+0000';const off=(z[0]==='-'?-1:1)*(+z.slice(1,3)*60+ +z.slice(3,5));return utc-off*60000;}
function unescape(s){return String(s||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&amp;/g,'&').trim();}
const b64=s=>Buffer.from(s,'utf8').toString('base64');
/** Programmes still to finish (from `now`), at most LIMIT per channel, as base64 title/description like get_short_epg. */
function parse(text,now=Date.now()){
 const out=new Map();const re=/<programme\b([^>]*)>([\s\S]*?)<\/programme>/g;let m;
 while((m=re.exec(text))){
  const attrs=m[1];const ch=/channel="([^"]*)"/.exec(attrs);if(!ch)continue;const id=unescape(ch[1]).toLowerCase();if(!id)continue;
  const start=stamp(/start="([^"]*)"/.exec(attrs)?.[1]),end=stamp(/stop="([^"]*)"/.exec(attrs)?.[1]);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end<=now)continue;
  let list=out.get(id);if(!list){list=[];out.set(id,list);}if(list.length>=LIMIT*2)continue;
  const title=unescape(/<title\b[^>]*>([\s\S]*?)<\/title>/.exec(m[2])?.[1]),desc=unescape(/<desc\b[^>]*>([\s\S]*?)<\/desc>/.exec(m[2])?.[1]);
  list.push({id:String(start/1000),title:b64(title),description:b64(desc),start_timestamp:String(start/1000),stop_timestamp:String(end/1000)});
 }
 for(const [id,list] of out){list.sort((a,b)=>a.start_timestamp-b.start_timestamp);if(list.length>LIMIT)out.set(id,list.slice(0,LIMIT));}
 return out;
}
module.exports={parse,stamp,LIMIT};
