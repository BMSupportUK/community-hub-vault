import React,{useEffect,useRef,useState} from 'react';
import {VideoSurface} from './video-surface';
import {VoiceButton} from './voice';

// Live TV laid out like the Android/Amazon BM Player: preview top-left, programme info beside it with
// Search TV / Voice search top right, a slim date row (◀ 24h / Now / 24h ▶ / Category pill) and the guide grid below.
// 1st click on a channel plays it in the preview; the 2nd click on that channel opens its play menu.
const SLOT=1800000,WINDOW=4*SLOT;
const clock=v=>new Date(v).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
const slotOf=t=>Math.floor(t/SLOT)*SLOT;
let tapAt=0;

export function LiveGuide({channels,categories,category,onCategory,allCount,selected,onPreview,onChoose,onReminder,onCatchup,reminders,isFavourite,onFavourite,playing,hidden,query,onQuery,toast,epg}){
 const [start,setStart]=useState(slotOf(Date.now()));
 const [focus,setFocus]=useState(null); // {channel, programme}
 const [catOpen,setCatOpen]=useState(false);
 const [searchOpen,setSearchOpen]=useState(false);
 const [guide,setGuide]=useState({});
 const asked=useRef(new Set()),grid=useRef(null);
 const now=Date.now();
 async function load(ch){if(asked.current.has(ch.id))return;asked.current.add(ch.id);try{const p=await epg(ch.id);setGuide(g=>({...g,[ch.id]:p||[]}));}catch{setGuide(g=>({...g,[ch.id]:[]}));}}
 // Fetch programmes only for rows that scroll into view, three at a time like the Android guide.
 useEffect(()=>{const root=grid.current;if(!root)return;const queue=[];let running=0;
  const pump=()=>{while(running<3&&queue.length){const ch=queue.shift();running++;load(ch).finally(()=>{running--;pump();});}};
  const io=new IntersectionObserver(rows=>{rows.forEach(r=>{if(r.isIntersecting){const ch=channels.find(c=>c.id===r.target.dataset.ch);if(ch&&!asked.current.has(ch.id))queue.push(ch);}});pump();},{root,rootMargin:'200px'});
  root.querySelectorAll('[data-ch]').forEach(el=>io.observe(el));return()=>io.disconnect();},[channels]);
 useEffect(()=>{grid.current?.scrollTo(0,0);setFocus(null);},[category]);
 const list=id=>guide[id]||[];
 const onAt=(id,t)=>list(id).find(p=>p.start<=t&&p.end>t);
 const nextAfter=(id,p)=>list(id).find(q=>q.start>=p.end);
 const shownCh=focus?.channel||selected;
 const shownProg=focus?.programme||(shownCh?onAt(shownCh.id,now):null);
 const catName=id=>categories.find(c=>c.id===id)?.name||'';
 const currentCat=category==='all'?'All':catName(category);
 function pick(ch,p){
  if(!selected||selected.id!==ch.id){onPreview(ch);return;}
  if(p&&p.start>now){onReminder(ch,p);return;}
  if(p&&p.end<=now){if(ch.archive>0)onCatchup(ch);else toast('This programme has ended.');return;}
  onChoose(ch);
 }
 const live=shownProg&&shownProg.start<=now&&shownProg.end>now;
 const left=shownProg?(live?Math.ceil((shownProg.end-now)/60000)+' min left':Math.round((shownProg.end-shownProg.start)/60000)+' min'):'';
 const nx=shownCh&&shownProg?nextAfter(shownCh.id,shownProg):null;
 const dateLabel=new Date(start).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})+', '+clock(now);
 return <div className="lg">
  <div className="lg-top">
   <div className="lg-preview" role="button" title={selected?'Double-click for full screen':undefined} onClick={()=>{if(!selected){toast('Click a channel to preview it');return;}const t=Date.now();if(t-tapAt<500){tapAt=0;onChoose(selected,true);}else tapAt=t;}}>
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
    <div className={'lg-ch'+(selected?.id===ch.id?' on':'')}><button onClick={()=>pick(ch,null)} onFocus={()=>setFocus({channel:ch,programme:onAt(ch.id,now)})}><b>{n+1}</b> {ch.name}</button>{ch.archive>0&&<button className="catchup-clock" title={'Catch up on '+ch.name} aria-label={'Catch up on '+ch.name} onClick={()=>onCatchup(ch)}>🕘</button>}</div>
    <div className="lg-line">
     {now>=start&&now<start+WINDOW&&<i className="lg-now" style={{left:(now-start)/WINDOW*100+'%'}}/>}
     {list(ch.id).filter(p=>p.end>start&&p.start<start+WINDOW).map(p=>{const on=p.start<=now&&p.end>now;return <button key={p.id} className={'lg-prog'+(on&&selected?.id===ch.id?' on':'')} style={{left:Math.max(0,(p.start-start)/WINDOW*100)+'%',width:(Math.min(start+WINDOW,p.end)-Math.max(start,p.start))/WINDOW*100+'%'}} onFocus={()=>setFocus({channel:ch,programme:p})} onMouseEnter={()=>setFocus({channel:ch,programme:p})} onClick={()=>pick(ch,p)}>{reminders.some(r=>r.id===ch.id+':'+p.start)?'⏰ ':''}{p.title}<small>{clock(p.start)}</small></button>;})}
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
