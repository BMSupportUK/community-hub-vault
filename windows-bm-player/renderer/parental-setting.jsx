import React,{useState} from 'react';
import {validPin} from '../parental.cjs';
// Settings › Parental control: set, unlock (until the app closes), change or switch off the 4-digit PIN.
async function hash(pin){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('bm-parental:'+pin));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function ParentalSetting({pinHash,unlocked,onUnlock,onSave,toast}){
 const [step,setStep]=useState(null),[pin,setPin]=useState(''),[error,setError]=useState('');
 const open=s=>{setStep(s);setPin('');setError('');};
 async function submit(e){e.preventDefault();if(!validPin(pin)){setError('Use 4 numbers');return;}const h=await hash(pin);
  if(step==='set'||step==='new'){await onSave(h);onUnlock(false);setStep(null);toast('Parental control on – adult categories are hidden');return;}
  if(h!==pinHash){setError('Wrong PIN');setPin('');return;}
  if(step==='unlock'){onUnlock(true);setStep(null);toast('Adult categories unlocked until the app closes');}
  else if(step==='change')open('new');
  else if(step==='off'){await onSave(null);onUnlock(false);setStep(null);toast('Parental control off');}}
 const status=!pinHash?'Off':unlocked?'Unlocked':'On';
 return <div className="setting"><h3>🔒 Parental control: {status}</h3><span className="muted">Hides adult categories behind a 4-digit PIN.</span>
  {!pinHash?<button onClick={()=>open('set')}>Set PIN</button>:<div className="setting-actions">
   {unlocked?<button onClick={()=>{onUnlock(false);toast('Adult categories locked again');}}>Lock again</button>:<button onClick={()=>open('unlock')}>Unlock</button>}
   <button onClick={()=>open('change')}>Change PIN</button><button onClick={()=>open('off')}>Turn off</button></div>}
  {step&&<div className="modal-backdrop"><form className="modal" onSubmit={submit}><h2>{step==='set'?'Set a parental PIN':step==='new'?'Set a new parental PIN':'Enter your parental PIN'}</h2>
   <input autoFocus type="password" inputMode="numeric" maxLength={4} aria-label="4 digit PIN" placeholder="4 digit PIN" value={pin} onChange={e=>{setPin(e.target.value.replace(/\D/g,''));setError('');}}/>
   {error&&<p role="alert">{error}</p>}<div className="modal-actions" style={{marginTop:16}}><button className="primary" type="submit">OK</button><button type="button" onClick={()=>setStep(null)}>Cancel</button></div></form></div>}</div>;
}
