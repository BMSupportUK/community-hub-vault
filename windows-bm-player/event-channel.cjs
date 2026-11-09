// Presentation-only daily feeds: retain the original name/id for matching and playback.
function eventChannel(name){
 const match=/^\s*(\d{1,4})\s*\|\s*(.*)$/.exec(String(name||''));
 if(!match)return null;
 const text=match[2].trim(),time=/(?:^|\s)([01]?\d|2[0-3]):([0-5]\d)(?=\s|$)/.exec(text);
 return {number:match[1],title:time?text.replace(time[0],' ').trim():text,hour:time?Number(time[1]):null,minute:time?Number(time[2]):null};
}
function channelLabel(name,row){const e=eventChannel(name);return e?e.number:(row+1)+'  '+name;}
function eventProgramme(name,now=Date.now()){
 const e=eventChannel(name);if(!e||!e.title||e.hour===null)return null;
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));
 let start=Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),e.hour,e.minute);
 const ukHour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',hourCycle:'h23'}).format(start));
 start-=((ukHour-e.hour+24)%24)*3600000;
 // Match saved fixtures' three-hour fallback when the provider supplies no finish time.
 return {id:'event:'+start,title:e.title,desc:'',start,end:start+10800000};
}
module.exports={eventChannel,channelLabel,eventProgramme};