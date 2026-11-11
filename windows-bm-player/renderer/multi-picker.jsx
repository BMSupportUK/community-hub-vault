import React,{useEffect,useRef,useState} from 'react';
import {ChannelName} from './channel-name';

// Multi-screen channel picker: categories on the left, channels with what's on now on the right.
// No two-hour guide grid, so it opens straight away; "now" listings load only for rows that come into view.
const clock=t=>new Date(t).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});

function Row({ch,epg,cache,onPick}){
 const ref=useRef(null);
 const nowOf=list=>{const t=Date.now();return (list||[]).find(p=>p.start<=t&&p.end>t)||null;};
 const [prog,setProg]=useState(()=>{const l=cache?.peek?.(ch.id);return l?{p:nowOf(l)}:null;});
 useEffect(()=>{if(prog)return;const el=ref.current;if(!el)return;let gone=false;
  const io=new IntersectionObserver(es=>{if(!es.some(e=>e.isIntersecting))return;io.disconnect();Promise.resolve(epg(ch.id)).then(l=>{if(!gone)setProg({p:nowOf(l)});}).catch(()=>{if(!gone)setProg({p:null});});});
  io.observe(el);return()=>{gone=true;io.disconnect();};},[ch.id]);
 return <button ref={ref} className="mp-row" onClick={()=>onPick(ch)}><ChannelName>{ch.name}</ChannelName><small>{!prog?'Loading what\'s on…':prog.p?<>Now: {prog.p.title}  ·  {clock(prog.p.start)}–{clock(prog.p.end)}</>:'No listing'}</small></button>;
}

export function MultiPicker({channels,categories,category,onCategory,allCount,epg,cache,onPick,screen,onBack}){
 return <div className="multi-picker">
  <div className="mp-head"><button onClick={onBack}>← Back to screens</button><h2>Screen {screen} – pick a channel</h2></div>
  <div className="mp-body">
   <nav className="mp-cats">
    <button className={category==='all'?'selected':''} onClick={()=>onCategory('all')}>All <span className="count">{allCount}</span></button>
    {categories.map(c=><button key={c.id} className={category===c.id?'selected':''} onClick={()=>onCategory(c.id)}>{c.name}</button>)}
   </nav>
   <div className="mp-list">{channels.length?channels.map(ch=><Row key={ch.id} ch={ch} epg={epg} cache={cache} onPick={onPick}/>):<p className="empty">No channels in this category.</p>}</div>
  </div>
 </div>;
}
