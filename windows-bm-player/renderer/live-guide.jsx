import React,{memo,useEffect,useRef,useState} from 'react';
import {VideoSurface} from './video-surface';
import {VoiceButton} from './voice';
import guideActions from '../guide-action.cjs';
import {isRadio} from '../radio-channel.cjs';
import {ChannelName} from './channel-name';
import {ChannelLogo} from './channel-logo';
import guideAxis from '../guide-axis.cjs';
import {channelLabel,eventProgramme} from '../event-channel.cjs';

// Live TV laid out like the Android/Amazon BM Player: preview top-left, programme info beside it with
// Search TV / Voice search top right, a slim date row (◀ 24h / Now / 24h ▶ / Category pill) and the guide grid below.
// 1st click on a channel plays it in the preview; the 2nd click on that channel opens its play menu.
const SLOT=1800000,WINDOW=4*SLOT;
const clock=v=>new Date(v).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
const slotOf=t=>Math.floor(t/SLOT)*SLOT;
let tapAt=0;

const reminderKeyFor=(reminders,id)=>reminders.filter(r=>String(r.id).startsWith(id+':')).map(r=>r.id).join(',');
// One guide row, redrawn only when its own channel, listings, time window or selection changes,
// so hovering/focusing a programme no longer redraws every channel in the guide.
const GuideRow=memo(function GuideRow({ch,n,on,rows,listed,start,now,axisWidth,gridWidth,query,category,h}){
 const axis=guideAxis.guideAxis(start,start+WINDOW,[],gridWidth);
 const shown=listed.filter(p=>p.end>start&&p.start<start+WINDOW);
 return <div className="lg-row" data-ch={ch.id} style={{width:axisWidth+240}}>
    <div className={'lg-ch'+(on?' on':'')}><button onClick={()=>h.pick(ch,null)} onFocus={()=>h.focusCh(ch)}><ChannelLogo channel={ch}/><span className="channel-label"><ChannelName>{channelLabel(ch.name,n)}</ChannelName>{query.trim()&&<small className="lg-search-category" title={category}>{category||'Uncategorised'}</small>}</span></button></div>
    <div className="lg-line">
     {now>=start&&now<start+WINDOW&&<i className="lg-now" style={{left:axis.x(now)}}/>}
     {shown.map(p=>{const live=p.start<=now&&p.end>now,eligible=guideActions.reminderEligible(p,now),set=h.isSet(ch,p);return <div key={p.id} className={'lg-prog'+(live&&on?' on':'')} style={{left:axis.x(Math.max(start,p.start)),width:axis.x(Math.min(start+WINDOW,p.end))-axis.x(Math.max(start,p.start))}} onMouseEnter={()=>h.focus(ch,p)}>
      <button className="lg-prog-title" title={p.title} onFocus={e=>{e.currentTarget.parentElement?.scrollIntoView({block:'nearest',inline:'nearest'});h.focus(ch,p);}} onClick={()=>h.pick(ch,p)}><span>{p.title}</span></button>
      {eligible&&<button className={'lg-reminder'+(set?' set':'')} title={(set?'Remove reminder for ':'Set reminder for ')+p.title} aria-label={(set?'Remove reminder for ':'Set reminder for ')+p.title} aria-pressed={set} onFocus={e=>{e.currentTarget.parentElement?.scrollIntoView({block:'nearest',inline:'nearest'});h.focus(ch,p);}} onClick={()=>h.reminder(ch,p)}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>{set&&<path d="m8 10 3 3 5-5"/>}</svg></button>}
     </div>;})}
     {rows&&!shown.length&&<span className="lg-empty">No guide information for this time</span>}
    </div>
   </div>;
});

export function LiveGuide({radioMode=false,onFull,maxScreens=1,onMulti,channels,categories,category,onCategory,allCount,selected,onPreview,onChoose,onReminder,onCatchup,reminders,isFavourite,onFavourite,playing,hidden,query,onQuery,onVoice,toast,epg,cache,feedLabel}){
 const [start,setStart]=useState(slotOf(Date.now()));
 const [focus,setFocus]=useState(null); // {channel, programme}
 const [catOpen,setCatOpen]=useState(false);
 const [searchOpen,setSearchOpen]=useState(false);
 const guide=Object.fromEntries(channels.map(ch=>[ch.id,cache.peek(ch.id)||[]]));
 const grid=useRef(null);
 const [gridWidth,setGridWidth]=useState(800);
 useEffect(()=>{const root=grid.current;if(!root)return;
 const measure=()=>setGridWidth(Math.max(220,root.clientWidth-240));
 measure();const resize=new ResizeObserver(measure);resize.observe(root);return()=>resize.disconnect();},[]);
 const [now,setNow]=useState(Date.now);
 // Update the clock/progress only; scrolling and elapsed time never request listings.
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),60000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{grid.current?.scrollTo(0,0);setFocus(null);},[category]);
 const list=id=>{const rows=guide[id]||[];if(rows.length)return rows;const event=eventProgramme(channels.find(ch=>ch.id===id)?.name,now);return event?[event]:[];};
 const onAt=(id,t)=>list(id).find(p=>p.start<=t&&p.end>t);
 const nextAfter=(id,p)=>list(id).find(q=>q.start>=p.end);
 const shownCh=focus?.channel||selected;
 const shownProg=radioMode?null:(focus?.programme&&shownCh?list(shownCh.id).find(p=>p.id===focus.programme.id):null)||(shownCh?onAt(shownCh.id,now):null);
 const catName=id=>categories.find(c=>c.id===id)?.name||'';
 const currentCat=category==='all'?'All':catName(category);
 function pick(ch,p){
  const action=guideActions.guideAction(ch,p,selected,Date.now());
  if(action==='reminder'){onReminder(ch,p);return;}
  if(action==='none')return;
  if(action==='preview'){onPreview(ch);return;}
  if(action==='ended'){toast('This programme has ended. Catch up is on the home screen.');return;}
  onChoose(ch);
 }
 const live=shownProg&&shownProg.start<=now&&shownProg.end>now;
 const left=shownProg?(live?Math.ceil((shownProg.end-now)/60000)+' min left':Math.round((shownProg.end-shownProg.start)/60000)+' min'):'';
 const nx=shownCh&&shownProg?nextAfter(shownCh.id,shownProg):null;
 const dateLabel=new Date(start).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})+', '+clock(now);
 const axis=guideAxis.guideAxis(start,start+WINDOW,[],gridWidth);
 const live$=useRef({});live$.current={pick,setFocus,onAt,onReminder,onCatchup,reminders};
 const handlers=useRef({pick:(c,p)=>live$.current.pick(c,p),focusCh:c=>live$.current.setFocus({channel:c,programme:live$.current.onAt(c.id,Date.now())}),focus:(c,p)=>live$.current.setFocus({channel:c,programme:p}),reminder:(c,p)=>live$.current.onReminder(c,p),catchup:c=>live$.current.onCatchup(c),isSet:(c,p)=>live$.current.reminders.some(r=>r.id===c.id+':'+p.start)}).current;
 return <div className={'lg'+(radioMode?' lg-radio':'')}>
  <div className="lg-top">
   <div className="lg-preview" role="button" title={selected?'Click for full screen':undefined} onClick={()=>{if(!selected){toast('Click a channel to preview it');return;}onFull(selected);}}>
    {playing.length>0?<VideoSurface key={playing[0].item.id} index={0} visible={!hidden&&!catOpen} audioOnly={isRadio(playing[0].item)}/>:<div className="preview-placeholder"><img src={radioMode||isRadio(shownCh)?'radio_studio.jpg':'preview_family.jpg'} alt={radioMode||isRadio(shownCh)?'Radio station DJ mixing songs in the studio':'Family on a sofa watching TV, one pointing a remote at the screen'}/></div>}
    {guideActions.previewFullScreen(playing)&&<button className="lg-full" aria-label="Full screen" title="Full screen" onClick={e=>{e.stopPropagation();onFull(guideActions.previewFullScreen(playing));}}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>}
   </div>
   <div className="lg-info">
    {feedLabel&&<div role="status" className="feed-pill preview-feed">{feedLabel}</div>}
    <div className="lg-pills">
     {searchOpen&&<input autoFocus aria-label={radioMode?'Search radio':'Search TV'} placeholder={radioMode?'Search stations':'Search channels'} value={query} onChange={e=>onQuery(e.target.value)}/>}
     <button className="pill" onClick={()=>{setSearchOpen(o=>!o);if(searchOpen)onQuery('');}}>🔍 {radioMode?'Search radio':'Search TV'}</button>
     <VoiceButton onText={radioMode?onQuery:onVoice} onError={toast}/>
    </div>
    <h2 className="lg-title">{shownProg?.title||shownCh?.name||(radioMode?'Choose a radio station':'Click a channel to preview')}</h2>
    {shownProg&&<div className="lg-time">{clock(shownProg.start)} – {clock(shownProg.end)}{left&&<>  ·  {left}</>}</div>}
    {live&&<div className="lg-bar"><i style={{width:Math.min(100,Math.round((now-shownProg.start)/(shownProg.end-shownProg.start)*100))+'%'}}/></div>}
    {shownProg?.desc&&<p className="lg-desc">{shownProg.desc}</p>}
    <div className="lg-next"><span>{nx?<>Next:  {clock(nx.start)}  {nx.title}</>:''}</span>{shownCh&&<button className="lg-star" aria-label={(isFavourite(shownCh)?'Remove favourite: ':'Add favourite: ')+shownCh.name} aria-pressed={isFavourite(shownCh)} onClick={()=>onFavourite(shownCh)}>{isFavourite(shownCh)?'★':'☆'}</button>}{!radioMode&&<span className="lg-cat">{shownCh?catName(shownCh.category):''}</span>}</div>
   </div>
  </div>
  {radioMode?<div className="lg-dates">
   <strong>📻 Radio stations</strong>
  </div>:<div className="lg-dates">
   <strong>{dateLabel}</strong>
   <button className="mini" aria-label="Back 24 hours" onClick={()=>setStart(s=>s-86400000)}>📅 ◀ 24h</button>
   <button className="mini" aria-label="Back to now" onClick={()=>setStart(slotOf(Date.now()))}>Now</button>
   <button className="mini" aria-label="Forward 24 hours" onClick={()=>setStart(s=>s+86400000)}>24h ▶</button>
   <button className="mini" aria-label="Choose a category" onClick={()=>setCatOpen(true)}>☰ Category: {currentCat}</button>
   <span className="lg-step"><button className="mini" aria-label="Earlier" onClick={()=>setStart(s=>s-SLOT)}>◀</button><button className="mini" aria-label="Later" onClick={()=>setStart(s=>s+SLOT)}>▶</button></span>
  </div>}
  {radioMode?<div className="lg-radio-list" ref={grid}>
   {channels.map(ch=><button key={ch.id} className={selected?.id===ch.id?'selected':''} onFocus={()=>setFocus({channel:ch,programme:null})} onClick={()=>pick(ch,null)}><ChannelLogo channel={ch}/><span>{ch.name}</span></button>)}
   {!channels.length&&<p className="empty">No radio stations found.</p>}
  </div>:<div className="lg-grid" ref={grid}>
   <div className="lg-row lg-head" style={{width:axis.width+240}}><div className="lg-ch">{new Date(start).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})}</div><div className="lg-times">{axis.times.slice(0,-1).map(t=><span key={t} style={{left:axis.x(t)}}>{clock(t)}</span>)}</div></div>
   {channels.map((ch,n)=><GuideRow key={ch.id} ch={ch} n={n} on={selected?.id===ch.id} rows={guide[ch.id]} listed={list(ch.id)} start={start} now={now} axisWidth={axis.width} gridWidth={gridWidth} query={query} category={catName(ch.category)} reminderKey={reminderKeyFor(reminders,ch.id)} h={handlers}/>)}
   {!channels.length&&<p className="empty">No channels in {currentCat}.</p>}
  </div>}
  {!radioMode&&catOpen&&<div className="lg-scrim" onClick={()=>setCatOpen(false)}><div className="lg-cats" role="dialog" aria-label="Categories" onClick={e=>e.stopPropagation()}>
   <h3>Categories</h3>
   <div className="lg-cat-list">
    <button className={category==='all'?'selected':''} autoFocus={category==='all'} onClick={()=>{onCategory('all');setCatOpen(false);}}>{category==='all'?'✓ ':''}All <span className="count">{allCount}</span></button>
    {categories.map(c=><button key={c.id} className={category===c.id?'selected':''} autoFocus={category===c.id} onClick={()=>{onCategory(c.id);setCatOpen(false);}}>{category===c.id?'✓ ':''}{c.name}</button>)}
   </div>
   <button onClick={()=>setCatOpen(false)}>Close</button>
  </div></div>}
 </div>;
}
