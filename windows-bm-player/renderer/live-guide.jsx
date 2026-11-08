import React,{useEffect,useRef,useState} from 'react';
import {VideoSurface} from './video-surface';
import {VoiceButton} from './voice';
import checkin from '../checkin.cjs';
import guideRefresh from '../guide-refresh.cjs';
import guideActions from '../guide-action.cjs';

// Live TV laid out like the Android/Amazon BM Player: preview top-left, programme info beside it with
// Search TV / Voice search top right, a slim date row (◀ 24h / Now / 24h ▶ / Category pill) and the guide grid below.
// 1st click on a channel plays it in the preview; the 2nd click on that channel opens its play menu.
const SLOT=1800000,WINDOW=4*SLOT;
const clock=v=>new Date(v).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
const slotOf=t=>Math.floor(t/SLOT)*SLOT;
let tapAt=0;

export function LiveGuide({onFull,channels,categories,category,onCategory,allCount,selected,onPreview,onChoose,onReminder,onCatchup,reminders,isFavourite,onFavourite,playing,hidden,query,onQuery,toast,epg}){
 const [start,setStart]=useState(slotOf(Date.now()));
 const [focus,setFocus]=useState(null); // {channel, programme}
 const [catOpen,setCatOpen]=useState(false);
 const [searchOpen,setSearchOpen]=useState(false);
 const [guide,setGuide]=useState({});
 const asked=useRef(new Map()),pending=useRef(new Set()),grid=useRef(null);
 const epgRef=useRef(epg);epgRef.current=epg;
 const now=Date.now();
 async function load(ch,isActive){if(pending.current.has(ch.id)||!guideRefresh.due(asked.current.get(ch.id)))return;pending.current.add(ch.id);try{const p=await epgRef.current(ch.id);if(!isActive())return;asked.current.set(ch.id,Date.now());setGuide(g=>({...g,[ch.id]:p||[]}));}catch{/* Keep the last good line-up and retry on the next tick. */}finally{pending.current.delete(ch.id);}}
 // Fetch programmes only for rows that scroll into view, three at a time like the Android guide.
 useEffect(()=>{const root=grid.current;if(!root)return;const queue=[],visible=new Set();let running=0,active=true;
  const pump=()=>{while(active&&running<3&&queue.length){const ch=queue.shift();running++;load(ch,()=>active).finally(()=>{running--;pump();});}};
  const enqueue=ch=>{if(ch&&!queue.some(q=>q.id===ch.id))queue.push(ch);};
  const io=new IntersectionObserver(rows=>{rows.forEach(r=>{const id=r.target.dataset.ch;if(r.isIntersecting){visible.add(id);enqueue(channels.find(c=>String(c.id)===id));}else visible.delete(id);});pump();},{root,rootMargin:'200px'});
  root.querySelectorAll('[data-ch]').forEach(el=>io.observe(el));
  const cancel=checkin.every(async()=>{if(document.hidden)return;visible.forEach(id=>enqueue(channels.find(c=>String(c.id)===id)));pump();},()=>60000,60000+Math.random()*12000);
  return()=>{active=false;queue.length=0;cancel();io.disconnect();};},[channels]);
 useEffect(()=>{grid.current?.scrollTo(0,0);setFocus(null);},[category]);
 const list=id=>guide[id]||[];
 const onAt=(id,t)=>list(id).find(p=>p.start<=t&&p.end>t);
 const nextAfter=(id,p)=>list(id).find(q=>q.start>=p.end);
 const shownCh=focus?.channel||selected;
 const shownProg=(focus?.programme&&shownCh?list(shownCh.id).find(p=>p.id===focus.programme.id):null)||(shownCh?onAt(shownCh.id,now):null);
 const catName=id=>categories.find(c=>c.id===id)?.name||'';
 const currentCat=category==='all'?'All':catName(category);
 function pick(ch,p){
  const action=guideActions.guideAction(ch,p,selected,Date.now());
  if(action==='reminder'){onReminder(ch,p);return;}
  if(action==='none')return;
  if(action==='preview'){onPreview(ch);return;}
  if(action==='ended'){if(ch.archive>0)onCatchup(ch);else toast('This programme has ended.');return;}
  onChoose(ch);
 }
 const live=shownProg&&shownProg.start<=now&&shownProg.end>now;
 const left=shownProg?(live?Math.ceil((shownProg.end-now)/60000)+' min left':Math.round((shownProg.end-shownProg.start)/60000)+' min'):'';
 const nx=shownCh&&shownProg?nextAfter(shownCh.id,shownProg):null;
 const dateLabel=new Date(start).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})+', '+clock(now);
 return <div className="lg">
  <div className="lg-top">
   <div className="lg-preview" role="button" title={selected?'Double-click for full screen':undefined} onClick={()=>{if(!selected){toast('Click a channel to preview it');return;}const t=Date.now();if(t-tapAt<500){tapAt=0;onFull(selected);}else tapAt=t;}}>
    {playing.length>0?<VideoSurface key={playing[0].item.id} index={0} visible={!hidden&&!catOpen}/>:<div className="preview-placeholder"><img src="preview_family.jpg" alt="Family on a sofa watching TV, one pointing a remote at the screen"/></div>}
   </div>
   <div className="lg-info">
    <div className="lg-pills">
     {searchOpen&&<input autoFocus aria-label="Search TV" placeholder="Search channels" value={query} onChange={e=>onQuery(e.target.value)}/>}
     <button className="pill" onClick={()=>{setSearchOpen(o=>!o);if(searchOpen)onQuery('');}}>🔍 Search TV</button>
     <VoiceButton onText={t=>{setSearchOpen(true);onQuery(t);}} onError={toast}/>
    </div>
    <h2 className="lg-title">{shownProg?.title||shownCh?.name||'Click a channel to preview'}</h2>
    {shownProg&&<div className="lg-time">{clock(shownProg.start)} – {clock(shownProg.end)}{left&&<>  ·  {left}</>}</div>}
    {live&&<div className="lg-bar"><i style={{width:Math.min(100,Math.round((now-shownProg.start)/(shownProg.end-shownProg.start)*100))+'%'}}/></div>}
    {shownProg?.desc&&<p className="lg-desc">{shownProg.desc}</p>}
    <div className="lg-next"><span>{nx?<>Next:  {clock(nx.start)}  {nx.title}</>:''}</span>{shownCh&&<button className="lg-star" aria-label={(isFavourite(shownCh)?'Remove favourite: ':'Add favourite: ')+shownCh.name} aria-pressed={isFavourite(shownCh)} onClick={()=>onFavourite(shownCh)}>{isFavourite(shownCh)?'★':'☆'}</button>}<span className="lg-cat">{shownCh?catName(shownCh.category):''}</span></div>
   </div>
  </div>
  <div className="lg-dates">
   <strong>{dateLabel}</strong>
   <button className="mini" aria-label="Back 24 hours" onClick={()=>setStart(s=>s-86400000)}>📅 ◀ 24h</button>
   <button className="mini" aria-label="Back to now" onClick={()=>setStart(slotOf(Date.now()))}>Now</button>
   <button className="mini" aria-label="Forward 24 hours" onClick={()=>setStart(s=>s+86400000)}>24h ▶</button>
   <button className="mini" aria-label="Choose a category" onClick={()=>setCatOpen(true)}>☰ Category: {currentCat}</button>
   <span className="lg-step"><button className="mini" aria-label="Earlier" onClick={()=>setStart(s=>s-SLOT)}>◀</button><button className="mini" aria-label="Later" onClick={()=>setStart(s=>s+SLOT)}>▶</button></span>
  </div>
  <div className="lg-grid" ref={grid}>
   <div className="lg-row lg-head"><div className="lg-ch">{new Date(start).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})}</div><div className="lg-times">{[0,1,2,3].map(i=><span key={i}>{clock(start+i*SLOT)}</span>)}</div></div>
   {channels.map((ch,n)=><div className="lg-row" key={ch.id} data-ch={ch.id}>
    <div className={'lg-ch'+(selected?.id===ch.id?' on':'')}><button onClick={()=>pick(ch,null)} onFocus={()=>setFocus({channel:ch,programme:onAt(ch.id,now)})}><span className="lg-channel-name"><b>{n+1}</b> {ch.name}</span>{query.trim()&&<small className="lg-search-category" title={catName(ch.category)}>{catName(ch.category)||'Uncategorised'}</small>}</button>{ch.archive>0&&<button className="catchup-clock" title={'Catch up on '+ch.name} aria-label={'Catch up on '+ch.name} onClick={()=>onCatchup(ch)}>🕘</button>}</div>
    <div className="lg-line">
     {now>=start&&now<start+WINDOW&&<i className="lg-now" style={{left:(now-start)/WINDOW*100+'%'}}/>}
     {list(ch.id).filter(p=>p.end>start&&p.start<start+WINDOW).map(p=>{const on=p.start<=now&&p.end>now,eligible=guideActions.reminderEligible(p,now),set=reminders.some(r=>r.id===ch.id+':'+p.start);return <div key={p.id} className={'lg-prog'+(on&&selected?.id===ch.id?' on':'')} style={{left:Math.max(0,(p.start-start)/WINDOW*100)+'%',width:(Math.min(start+WINDOW,p.end)-Math.max(start,p.start))/WINDOW*100+'%'}} onMouseEnter={()=>setFocus({channel:ch,programme:p})}>
      <button className="lg-prog-title" onFocus={()=>setFocus({channel:ch,programme:p})} onClick={()=>pick(ch,p)}><span>{p.title}</span><small>{clock(p.start)}</small></button>
      {eligible&&<button className={'lg-reminder'+(set?' set':'')} title={(set?'Remove reminder for ':'Set reminder for ')+p.title} aria-label={(set?'Remove reminder for ':'Set reminder for ')+p.title} aria-pressed={set} onFocus={()=>setFocus({channel:ch,programme:p})} onClick={()=>onReminder(ch,p)}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>{set&&<path d="m8 10 3 3 5-5"/>}</svg></button>}
     </div>;})}
     {guide[ch.id]&&!list(ch.id).some(p=>p.end>start&&p.start<start+WINDOW)&&<span className="lg-empty">No guide information for this time</span>}
     {!guide[ch.id]&&<span className="lg-empty">Loading programmes…</span>}
    </div>
   </div>)}
   {!channels.length&&<p className="empty">No channels in {currentCat}.</p>}
  </div>
  {catOpen&&<div className="lg-scrim" onClick={()=>setCatOpen(false)}><div className="lg-cats" role="dialog" aria-label="Categories" onClick={e=>e.stopPropagation()}>
   <h3>Categories</h3>
   <div className="lg-cat-list">
    <button className={category==='all'?'selected':''} autoFocus={category==='all'} onClick={()=>{onCategory('all');setCatOpen(false);}}>{category==='all'?'✓ ':''}All <span className="count">{allCount}</span></button>
    {categories.map(c=><button key={c.id} className={category===c.id?'selected':''} autoFocus={category===c.id} onClick={()=>{onCategory(c.id);setCatOpen(false);}}>{category===c.id?'✓ ':''}{c.name}</button>)}
   </div>
   <button onClick={()=>setCatOpen(false)}>Close</button>
  </div></div>}
 </div>;
}
