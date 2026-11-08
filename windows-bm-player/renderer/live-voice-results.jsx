import React from 'react';
import {groupedResults} from '../live-voice-search.cjs';
import {ChannelName} from './channel-name';

export function LiveVoiceResults({spoken,categories,channels,onCategory,onChannel,onClose}){
 const groups=groupedResults(categories,channels,spoken);
 return <div className="modal-backdrop" onClick={onClose}><div className="modal live-voice-results" role="dialog" aria-modal="true" aria-label="Live TV voice results" onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape')onClose();}}>
  <button className="close" aria-label="Close voice results" onClick={onClose}>×</button><h2>“{spoken}”</h2>
  <section aria-label="Categories"><h3>Categories <span className="count">{groups.categories.length}</span></h3><div className="modal-actions">{groups.categories.map(c=><button key={c.id} onClick={()=>onCategory(c.id)}>{c.name}</button>)}{!groups.categories.length&&<p>No matching categories</p>}</div></section>
  <section aria-label="TV channels"><h3>TV channels <span className="count">{groups.channels.length}</span></h3><div className="modal-actions">{groups.channels.map(ch=><button key={ch.id} onClick={()=>onChannel(ch)}><ChannelName>{ch.name}</ChannelName><small>{categories.find(c=>String(c.id)===String(ch.category))?.name||ch.categoryName||'Uncategorised'}</small></button>)}{!groups.channels.length&&<p>No matching TV channels</p>}</div></section>
 </div></div>;
}