import React,{useEffect,useRef,useState} from 'react';
import {groupedResults} from '../live-voice-search.cjs';
import {ChannelName} from './channel-name';

export function LiveVoiceResults({spoken,categories,channels,loadEvents,onCategory,onChannel,onEvent,onClose}){
 const [events,setEvents]=useState([]),[status,setStatus]=useState('loading'),[attempt,setAttempt]=useState(0),[sports,setSports]=useState(null);
 const load=useRef(loadEvents);load.current=loadEvents;
 useEffect(()=>{let active=true;setStatus('loading');load.current().then(r=>{if(active){setSports(r);setEvents(r?.events||[]);setStatus(r?'ready':'error');}}).catch(()=>{if(active)setStatus('error');});return()=>{active=false;};},[attempt]);
 const groups=groupedResults(categories,channels,events,spoken);
 return <div className="modal-backdrop" onClick={onClose}><div className="modal live-voice-results" role="dialog" aria-modal="true" aria-label="Live TV voice results" onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape')onClose();}}>
  <button className="close" aria-label="Close voice results" onClick={onClose}>×</button><h2>“{spoken}”</h2>
  <section aria-label="Categories"><h3>Categories <span className="count">{groups.categories.length}</span></h3><div className="modal-actions">{groups.categories.map(c=><button key={c.id} onClick={()=>onCategory(c.id)}>{c.name}</button>)}{!groups.categories.length&&<p>No matching categories</p>}</div></section>
  <section aria-label="TV channels"><h3>TV channels <span className="count">{groups.channels.length}</span></h3><div className="modal-actions">{groups.channels.map(ch=><button key={ch.id} onClick={()=>onChannel(ch)}><ChannelName>{ch.name}</ChannelName><small>{categories.find(c=>String(c.id)===String(ch.category))?.name||ch.categoryName||'Uncategorised'}</small></button>)}{!groups.channels.length&&<p>No matching TV channels</p>}</div></section>
  <section aria-label="Events"><h3>Events <span className="count">{groups.events.length}</span></h3>{status==='loading'?<p role="status">Loading sports listings… please wait</p>:status==='error'?<><p role="alert">Couldn’t load events</p><button onClick={()=>setAttempt(a=>a+1)}>Retry events</button></>:<div className="modal-actions">{groups.events.map((e,i)=><button key={e.start+':'+e.title+':'+i} onClick={()=>onEvent(e,sports)}>{e.title}<small>{new Date(e.start).toLocaleString('en-GB',{timeZone:'Europe/London',weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})} · {e.competition}</small></button>)}{!groups.events.length&&<p>No matching events</p>}</div>}</section>
 </div></div>;
}