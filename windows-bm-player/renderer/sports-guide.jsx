import React,{useEffect,useMemo,useState} from 'react';
import {matchChannel} from '../../src/lib/player-channel-match';
import {channelInCountry} from '../../src/lib/sports-channel-links';
import eventSearch from '../event-search.cjs';

// Sports guide (same layout as Android): day pills + website Category pop-up, one card per game, its channels beside it.
const ukDate=ms=>new Date(ms).toLocaleDateString('en-CA',{timeZone:'Europe/London'});
const clock=ms=>new Date(ms).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/London'});
export function ukDayIndex(start,now){const a=Date.parse(ukDate(now)),b=Date.parse(ukDate(start));return Math.max(0,Math.round((b-a)/86400000));}
export function inCategory(e,sport,sub,guide){return !sport||(e.sport===sport&&(!sub||(e.subcategory||'')===sub)&&(!guide||e.competition===guide));}
/** Default category: the website's first one (Daily Sports) and its first sub-category. */
export function defaultCategory(sports){const c=(sports&&sports.categories||[])[0];return c?{sport:c.name,sub:(c.subs||[])[0]||null,guide:null}:{sport:null,sub:null,guide:null};}
const lower=s=>String(s||'').toLowerCase();
/** Spoken or typed search, like Android: every word must start a word in the event text; 3+ words may miss one. "Moto GP" also finds "MotoGP". */
export const matchesSearch=eventSearch.matchesSearch;

/** Channel rows for one game: guide channels, then sports passes, then each club's own channels. */
export function sportsRows(e,items,aliases,down=[]){
 const crossedSet=new Set([...(e.unavailable||[]),...down].map(lower)),isDown=(c,n)=>crossedSet.has(lower(c))||crossedSet.has(lower(n));
 const rows=[],seen=new Set(),names=items.map(i=>i.name),byName=new Map(items.map(i=>[i.name,i]));
 const where=lower([e.sport,e.subcategory,e.competition].join(' '));
 const clubs=!!e.teamChannels||where.includes('ifollow')||where.includes('scot');
 const teams=String(e.title||'').split(/\s+(?:v|vs\.?|v\.)\s+|\s+-\s+/i).map(t=>t.trim()).filter(Boolean);
 const teamSet=new Set(teams.map(lower)),pass=new Set((e.passChannels||[]).map(lower));
 [['Channels',false],['Sports passes',true]].forEach(([heading,isPass])=>{
  const list=(e.channels||[]).filter(c=>pass.has(lower(c))===isPass&&!(clubs&&teamSet.has(lower(c))));
  if(!list.length)return;rows.push({heading});
  for(const c of list){const cc=(e.channelCountry||{})[c];const m=matchChannel(c,names,aliases).filter(n=>channelInCountry(n,cc));if(!m.length)rows.push({missing:c});for(const n of m)if(!seen.has(n)){seen.add(n);rows.push({item:byName.get(n),down:isDown(c,n),early:isDown(c,n)&&e.start>Date.now()});}}
 });
 if(clubs){rows.push({heading:'Club channels'});for(const t of teams){const words=lower(t).replace(/\b(fc|afc|the)\b/g,' ').split(/\s+/).filter(Boolean);const m=items.filter(i=>{const n=lower(i.name).split(/[^a-z0-9]+/);return words.length&&words.every(w=>n.includes(w));}).slice(0,15);if(!m.length)rows.push({missing:'No '+t+' channel in your list'});for(const i of m)if(!seen.has(i.name)){seen.add(i.name);rows.push({item:i});}}}
 return rows;
}

export function SportsGuide({sports,loading,onBack,onRefresh,loadChannels,play,voice,initialEvent}){
 const [cat,setCat]=useState(()=>defaultCategory(sports)),[day,setDay]=useState(0),[sel,setSel]=useState(0),[popup,setPopup]=useState(null),[items,setItems]=useState(null),[query,setQuery]=useState(''),[channelsLoading,setChannelsLoading]=useState(true),[channelsError,setChannelsError]=useState(false);
 const now=Date.now();
 useEffect(()=>{let live=true;loadChannels().then(r=>{if(!live)return;if(r&&Array.isArray(r.items)){setItems(r.items);setChannelsError(false);}else setChannelsError(true);}).catch(()=>{if(live)setChannelsError(true);}).finally(()=>{if(live)setChannelsLoading(false);});return()=>{live=false;};},[]);
 useEffect(()=>{if(!cat.sport&&sports.categories&&sports.categories.length)setCat(defaultCategory(sports));},[sports]);
 const ended=e=>(e.end||e.start+3*3600000)<=now;
 const upcoming=useMemo(()=>(sports.events||[]).filter(e=>(e.end||e.start+3*3600000)+2*3600000>now),[sports]);
 const inCat=upcoming.filter(e=>inCategory(e,cat.sport,cat.sub,cat.guide));
 const perDay=Array.from({length:7},(_,d)=>inCat.filter(e=>ukDayIndex(e.start,now)===d).length);
 const q=lower(query).trim();
 const [focusedEvent,setFocusedEvent]=useState(initialEvent||null);
 useEffect(()=>{if(!initialEvent)return;const event=(sports.events||[]).find(e=>String(e.start)+':'+e.title===initialEvent);if(event){setCat({sport:event.sport||null,sub:event.subcategory||null,guide:event.competition||null});setDay(ukDayIndex(event.start,Date.now()));}},[initialEvent,sports]);
 const cards=focusedEvent?upcoming.filter(e=>String(e.start)+':'+e.title===focusedEvent):q?upcoming.filter(e=>matchesSearch(e,q)):inCat.filter(e=>ukDayIndex(e.start,now)===day).slice().sort((a,b)=>ended(a)-ended(b));
 const current=cards[Math.min(sel,cards.length-1)];
 const rows=useMemo(()=>current&&items?sportsRows(current,items,sports.aliases||[],sports.unavailable||[]):[],[current,items,sports]);
 const cats=(sports.categories&&sports.categories.length?sports.categories:[...new Set(upcoming.map(e=>e.sport))].map(name=>({name,subs:[]})));
 const count=(sport,sub,guide)=>upcoming.filter(e=>inCategory(e,sport,sub,guide)).length;
 const guidesOf=(sport,sub)=>(sports.guides||{})[sport+'|'+(sub||'')]||[];
 const pick=(sport,sub,guide=null)=>{setFocusedEvent(null);setCat({sport,sub,guide});setDay(0);setSel(0);setPopup(null);};
 const label=!cat.sport?'Choose':[cat.sport,cat.sub,cat.guide].filter(Boolean).join(' › ');
 const dayName=d=>d===0?'Today':d===1?'Tomorrow':new Date(now+d*86400000).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',timeZone:'Europe/London'});
 return <main className="content sports-guide">
  <div className="toolbar"><button onClick={onBack}>← Back</button><h2>Sports guide</h2><button onClick={()=>setPopup('main')}>☰ Category: {label}</button><input placeholder="Search events" aria-label="Search events" value={query} onChange={e=>{setFocusedEvent(null);setQuery(e.target.value);setSel(0);}}/>{voice(t=>{setFocusedEvent(null);setQuery(t);setSel(0);})}<button onClick={onRefresh}>⟳ Refresh</button></div>
  {!q&&<div className="sports-days">{perDay.map((n,d)=><button key={d} className={d===day?'selected':n?'':'empty-day'} onClick={()=>{setFocusedEvent(null);setDay(d);setSel(0);}}>{dayName(d)}{n?'  '+n:''}</button>)}</div>}
  {(loading||channelsLoading)&&<p role="status" aria-live="polite" className="empty">Loading sports listings… please wait</p>}
  {loading&&!upcoming.length?null:<div className="sports-layout">
   <div className="sports-cards">{cards.length?cards.map((e,i)=>{const n=(e.channels||[]).length,done=ended(e),isLive=!done&&e.start<=now;return <button key={i} className={'sports-card'+(e===current?' selected':'')+(done?' finished':'')} onClick={()=>setSel(i)} onFocus={()=>setSel(i)}>
     <span className={'sports-time'+(isLive?' live':'')+(done?' done':'')}>{done?'Finished':isLive?'LIVE':clock(e.start)}</span><span className="sports-name"><b>{e.title}</b><small>{e.competition}{e.subcategory?' · '+e.subcategory:''}</small></span><span className="sports-pill">{n} {n===1?'channel':'channels'}</span></button>;}):<p className="empty">No games here – pick another day or category.</p>}</div>
   <aside className="sports-panel">{current&&<><h3>{current.title}</h3><p className="muted">{ended(current)?'Finished':current.start<=now?'🔴 Live now':dayName(ukDayIndex(current.start,now))+' '+clock(current.start)} · {current.competition}</p>
    {!items?<p className="muted">{channelsError?'Couldn’t load channels – reopen Sports guide to try again':'Finding channels…'}</p>:rows.map((r,i)=>r.heading?<div key={i} className="sports-heading">{r.heading}</div>:r.item?<button key={i} className={'sports-channel'+(r.down?' crossed':'')} onClick={()=>play(r.item,String(current.start)+':'+current.title)}><span>{r.down?(r.early?'⏳ ':'❌ '):''}{r.item.name}{r.down&&<small className="sports-down">{r.early?'Event hasn\'t started yet – this channel goes live nearer the start':'Not working right now – try another channel'}</small>}</span><span className="sports-play">▶ Play</span></button>:<div key={i} className="sports-channel off"><span>{r.missing}</span><span className="muted">Not in your channels</span></div>)}</>}</aside>
  </div>}
  {popup&&<div className="modal-backdrop" onClick={()=>setPopup(null)}><div className="modal" onClick={e=>e.stopPropagation()}>
   {popup==='main'?<><h2>Choose a category</h2><div className="modal-actions">{cats.map(c=><button key={c.name} className={cat.sport===c.name?'primary':''} onClick={()=>c.subs&&c.subs.length?setPopup(c):guidesOf(c.name,null).length>1?setPopup({guidesFor:c.name,sub:null,back:'main'}):pick(c.name,null)}>{c.name} ({count(c.name,null)}){(c.subs&&c.subs.length)||guidesOf(c.name,null).length>1?'  ›':''}</button>)}<button onClick={()=>setPopup(null)}>Close</button></div></>
   :popup.guidesFor?<><h2>{[popup.guidesFor,popup.sub].filter(Boolean).join(' › ')}</h2><div className="modal-actions"><button onClick={()=>pick(popup.guidesFor,popup.sub)}>All {popup.sub||popup.guidesFor} ({count(popup.guidesFor,popup.sub)})</button>{guidesOf(popup.guidesFor,popup.sub).map(g=><button key={g} className={cat.guide===g?'primary':''} onClick={()=>pick(popup.guidesFor,popup.sub,g)}>{g} ({count(popup.guidesFor,popup.sub,g)})</button>)}<button onClick={()=>setPopup(popup.back)}>◀ Back</button></div></>
   :<><h2>{popup.name}</h2><div className="modal-actions"><button onClick={()=>pick(popup.name,null)}>All {popup.name} ({count(popup.name,null)})</button>{popup.subs.map(s=><button key={s} className={cat.sport===popup.name&&cat.sub===s?'primary':''} onClick={()=>guidesOf(popup.name,s).length>1?setPopup({guidesFor:popup.name,sub:s,back:popup}):pick(popup.name,s)}>{s} ({count(popup.name,s)}){guidesOf(popup.name,s).length>1?'  ›':''}</button>)}<button onClick={()=>setPopup('main')}>◀ Back</button></div></>}
  </div></div>}
 </main>;
}
