import React,{useEffect,useState} from 'react';
import {validPin} from '../parental.cjs';
// Settings › Parental control: set, unlock (until the app closes), change or switch off the 4-digit PIN.
async function hash(pin){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('bm-parental:'+pin));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
const KINDS=[['live','Live TV'],['film','Movies'],['series','Series']];
function HideCategories({kind,label,saved,load,onSave,onClose}){
 const [cats,setCats]=useState(null),[ids,setIds]=useState(new Set((saved||[]).map(String))),[error,setError]=useState('');
 useEffect(()=>{let on=true;load(kind).then(d=>{if(on)setCats(d.categories||[]);}).catch(e=>{if(on)setError(e.message);});return()=>{on=false;};},[kind]);
 const flip=id=>setIds(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});
 return <div className="modal-backdrop"><div className="modal"><h2>Hide {label} categories</h2><p>Tick the categories to hide.</p>{error&&<p role="alert">{error}</p>}{!cats&&!error?<p role="status">Loading categories…</p>:<div className="category-order-list">{(cats||[]).map(c=><label key={c.id} className="hide-row"><input type="checkbox" checked={ids.has(String(c.id))} onChange={()=>flip(String(c.id))}/> {c.name}</label>)}</div>}
  <div className="modal-actions" style={{marginTop:16}}><button className="primary" disabled={!cats} onClick={async()=>{await onSave(kind,[...ids]);onClose();}}>Save</button><button onClick={async()=>{await onSave(kind,[]);onClose();}}>Show all</button><button onClick={onClose}>Cancel</button></div></div></div>;
}
export function ParentalSetting({pinHash,unlocked,onUnlock,onSave,toast,hidden,onHide,load}){
 const [hideKind,setHideKind]=useState(null);
 const [step,setStep]=useState(null),[pin,setPin]=useState(''),[error,setError]=useState('');
 const open=s=>{setStep(s);setPin('');setError('');};
 async function submit(e){e.preventDefault();if(!validPin(pin)){setError('Use 4 numbers');return;}const h=await hash(pin);
  if(step==='set'||step==='new'){await onSave(h);onUnlock(false);setStep(null);toast('Parental control on – adult categories are hidden');return;}
  if(h!==pinHash){setError('Wrong PIN');setPin('');return;}
  if(step==='unlock'){onUnlock(true);setStep(null);toast('Adult categories unlocked until the app closes');}
  else if(step==='change')open('new');
  else if(step==='hide')setStep('hide-pick');
  else if(step==='off'){await onSave(null);onUnlock(false);setStep(null);toast('Parental control off');}}
 const status=!pinHash?'Off':unlocked?'Unlocked':'On';
 return <div className="setting"><h3>🔒 Parental control: {status}</h3><span className="muted">Hides adult categories behind a 4-digit PIN.</span>
  {!pinHash?<button onClick={()=>open('set')}>Set PIN</button>:<div className="setting-actions">
   {unlocked?<button onClick={()=>{onUnlock(false);toast('Adult categories locked again');}}>Lock again</button>:<button onClick={()=>open('unlock')}>Unlock</button>}
   <button onClick={()=>open('hide')}>Hide categories</button><button onClick={()=>open('change')}>Change PIN</button><button onClick={()=>open('off')}>Turn off</button></div>}
  {step==='hide-pick'&&<div className="modal-backdrop"><div className="modal"><h2>Hide categories in…</h2><div className="modal-actions">{KINDS.map(([k,l])=><button key={k} onClick={()=>{setStep(null);setHideKind([k,l]);}}>{l}</button>)}<button onClick={()=>setStep(null)}>Cancel</button></div></div></div>}
  {hideKind&&<HideCategories kind={hideKind[0]} label={hideKind[1]} saved={hidden['category_hidden_'+hideKind[0]]} load={load} onSave={onHide} onClose={()=>{setHideKind(null);toast('Hidden categories saved');}}/>}
  {step&&step!=='hide-pick'&&<div className="modal-backdrop"><form className="modal" onSubmit={submit}><h2>{step==='set'?'Set a parental PIN':step==='new'?'Set a new parental PIN':'Enter your parental PIN'}</h2>
   <input autoFocus type="password" inputMode="numeric" maxLength={4} aria-label="4 digit PIN" placeholder="4 digit PIN" value={pin} onChange={e=>{setPin(e.target.value.replace(/\D/g,''));setError('');}}/>
   {error&&<p role="alert">{error}</p>}<div className="modal-actions" style={{marginTop:16}}><button className="primary" type="submit">OK</button><button type="button" onClick={()=>setStep(null)}>Cancel</button></div></form></div>}</div>;
}
