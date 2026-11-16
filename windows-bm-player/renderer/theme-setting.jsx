import React,{useEffect,useState} from 'react';
// Settings › Theme: the owner's switched-on home-screen themes plus the standard look.
export function ThemeSetting({current,shade,onPick,onShade}){
 const [items,setItems]=useState(null),[error,setError]=useState(false);
 useEffect(()=>{let on=true;window.bm.themes().then(r=>{if(on)setItems(r||[]);}).catch(()=>{if(on)setError(true);});return()=>{on=false;};},[]);
 const groups=[...new Set((items||[]).map(t=>t.group))];
 return <div className="setting"><h3>🎨 Theme</h3><span className="muted">Changes the picture behind your home screen.</span>
  {error?<span className="muted">Couldn't load themes. Check your internet.</span>:!items?<span className="muted">Loading themes…</span>:
  <select aria-label="Theme" value={current?.id||''} onChange={e=>{const t=items.find(x=>x.id===e.target.value);onPick(t||null);}}>
   <option value="">Standard (BM Player)</option>
   {groups.map(g=><optgroup key={g} label={g}>{items.filter(t=>t.group===g).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>)}
  </select>}
  {current&&<select aria-label="Picture shading" value={shade||'medium'} onChange={e=>onShade(e.target.value)}><option value="light">Shading: Light (brightest picture)</option><option value="medium">Shading: Medium</option><option value="strong">Shading: Strong (easiest to read)</option></select>}</div>;
}
