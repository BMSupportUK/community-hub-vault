import React,{useEffect,useRef,useState} from 'react';
import controls from '../player-controls.cjs';
const time=v=>`${Math.floor((v||0)/60)}:${String(Math.floor((v||0)%60)).padStart(2,'0')}`;
export function PlayerControls({p,bm,actions,volume,onVolume}){
 const [tracks,setTracks]=useState({audio:[],subtitles:[]}),[rate,setRate]=useState(1);
 useEffect(()=>{let active=true;const load=()=>bm.control({index:p.index,action:'tracks'}).then(t=>{if(active&&t)setTracks(t);}).catch(()=>{});load();const id=setInterval(load,5000);return()=>{active=false;clearInterval(id);};},[p.index,p.item.id,p.backup]);
 const command=(action,value={})=>bm.control({index:p.index,action,...value});
 return <div className="playback-controls">
 <div className="transport-controls">
 {controls.canSkip(p.item.kind)&&<button aria-label="Rewind 10 seconds" title="Rewind 10 seconds" disabled={!p.seekable} onClick={()=>command('seek',{seconds:controls.skipPosition(p.position,p.duration,-10)})}>↶ 10</button>}
 <button aria-label={p.paused?'Resume playback':'Pause playback'} onClick={()=>command('pause')}>{p.paused?'▶':'Ⅱ'}</button>
 {controls.canSkip(p.item.kind)&&<button aria-label="Forward 10 seconds" title="Forward 10 seconds" disabled={!p.seekable} onClick={()=>command('seek',{seconds:controls.skipPosition(p.position,p.duration,10)})}>10 ↷</button>}
 {p.seekable&&p.duration>0&&<input type="range" aria-label="Playback position" min="0" max={p.duration} value={p.position||0} onChange={e=>command('seek',{seconds:Number(e.target.value)})}/>}
 <span className="playback-time">{time(p.position)}{p.duration>0?' / '+time(p.duration):''}</span>
 <input type="range" aria-label="Volume" min="0" max="100" value={volume} onChange={e=>onVolume(Number(e.target.value))}/>
 <label>Speed <select aria-label="Playback speed" value={rate} onChange={e=>{setRate(Number(e.target.value));command('speed',{rate:Number(e.target.value)});}}>{[.5,.75,1,1.25,1.5,2].map(r=><option key={r} value={r}>{r}×</option>)}</select></label>
 <label>Audio <select aria-label="Audio track" value={tracks.audioId??''} disabled={!tracks.audio.length} onChange={e=>command('audioTrack',{id:Number(e.target.value)}).then(setTracks)}>{!tracks.audio.length&&<option value="">Default</option>}{tracks.audio.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
 <label>Subtitles <select aria-label="Subtitle track" value={tracks.subtitleId??-1} onChange={e=>command('subtitleTrack',{id:Number(e.target.value)}).then(setTracks)}><option value="-1">Off</option>{tracks.subtitles.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
 </div><div className="player-actions">{actions}</div></div>;
}
export function usePlayerControls(active,held){
 const last=useRef(Date.now()),[shown,setShown]=useState(true);
 useEffect(()=>{if(!active)return;last.current=Date.now();setShown(true);const reveal=()=>{last.current=Date.now();setShown(true);};const tick=setInterval(()=>setShown(controls.visible(Date.now(),last.current,held)),250);for(const e of ['pointermove','pointerdown','keydown','focusin'])window.addEventListener(e,reveal);return()=>{clearInterval(tick);for(const e of ['pointermove','pointerdown','keydown','focusin'])window.removeEventListener(e,reveal);};},[active,held]);
 return shown;
}