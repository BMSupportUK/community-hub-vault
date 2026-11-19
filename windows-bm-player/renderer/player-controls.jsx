import React,{useEffect,useRef,useState} from 'react';
import controls from '../player-controls.cjs';
const time=v=>`${Math.floor((v||0)/60)}:${String(Math.floor((v||0)%60)).padStart(2,'0')}`;
// Box 6.10 catch up: each press stacks one minute (back or forward); the recording reopens once, 1.5s after the last press.
function CatchupJump({command}){
 const [pending,setPending]=useState(0),timer=useRef(null),total=useRef(0);
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 const press=step=>{total.current+=step;setPending(total.current);clearTimeout(timer.current);timer.current=setTimeout(()=>{const minutes=total.current;total.current=0;setPending(0);if(minutes)command('catchupSkip',{delta:minutes*60});},1500);};
 return <><button aria-label="Back one minute" title="Back one minute" onClick={()=>press(-1)}>⏪ Back 1 min</button><button aria-label="Fast forward one minute" title="Fast forward – press again to add a minute" onClick={()=>press(1)}>⏩ Fast forward</button>{pending!==0&&<span className="playback-time" role="status">{pending>0?'+':'−'}{Math.abs(pending)} min</span>}</>;
}
export function PlayerControls({p,bm,actions,volume,onVolume}){
 const [tracks,setTracks]=useState({audio:[],subtitles:[]}),[rate,setRate]=useState(1);
 useEffect(()=>{let active=true;const load=()=>bm.control({index:p.index,action:'tracks'}).then(t=>{if(active&&t)setTracks(t);}).catch(()=>{});load();const id=setInterval(load,5000);return()=>{active=false;clearInterval(id);};},[p.index,p.item.id,p.backup]);
 const command=(action,value={})=>bm.control({index:p.index,action,...value});
 return <div className="playback-controls">
 <div className="transport-controls">
 {p.item.kind==='catchup'&&<CatchupJump command={command}/>}
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
export function usePlayerControls(active,held,fullscreen=false){
 const last=useRef(Date.now()),[shown,setShown]=useState(true);
 useEffect(()=>{if(!active)return;last.current=Date.now();setShown(true);const reveal=()=>{last.current=Date.now();setShown(true);};const tick=setInterval(()=>setShown(controls.visible(Date.now(),last.current,held)),250);const events=controls.revealEvents(fullscreen);for(const e of events)window.addEventListener(e,reveal);return()=>{clearInterval(tick);for(const e of events)window.removeEventListener(e,reveal);};},[active,held,fullscreen]);
 return shown;
}