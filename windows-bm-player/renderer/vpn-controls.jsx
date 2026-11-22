import React,{useEffect,useState} from 'react';
import qrcode from 'qrcode-generator';
const bm=window.bm;
export function VpnBadge({vpn,onLocation}){return vpn?.present?<button className={'vpn-indicator '+vpn.status} onClick={onLocation} aria-label="Change VPN location" title="Change VPN location">● VPN {vpn.status==='on'?'on':vpn.status==='connecting'?'connecting':vpn.status==='failed'?'connection lost':'off'}</button>:null;}
const pounds=p=>'£'+(p/100).toFixed(2);
function qrSvg(text){const q=qrcode(0,'M');q.addData(text);q.make();return q.createSvgTag({cellSize:5,margin:2,scalable:true});}
// Same as the box: price and dates, a QR code to scan and pay on a phone, or open the pay page on this computer.
function GetVpn({onReady,compact}){
 const [q,setQ]=useState(null),[link,setLink]=useState(''),[waiting,setWaiting]=useState(false),[err,setErr]=useState('');
 useEffect(()=>{bm.vpnQuote().then(setQ).catch(()=>setErr('Couldn\'t reach BM Support.'));},[]);
 useEffect(()=>{if(!waiting)return;const t=setInterval(()=>{bm.vpnRefresh().then(s=>{if(s?.present){setWaiting(false);onReady(s);}}).catch(()=>{});},5000);return()=>clearInterval(t);},[waiting]);
 useEffect(()=>{if(q?.ok&&!link)start();},[q]);
 if(err)return <span className="muted" role="alert">{err}</span>;
 if(!q)return <span className="muted">Checking price…</span>;
 if(!q.ok)return <span className="muted">{q.reason}</span>;
 const end=q.until?new Date(q.until).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/London'}):'';
 function start(){return bm.vpnPayLink().then(url=>{setLink(url);setWaiting(true);}).catch(e=>setErr(e?.message||'Couldn\'t start the payment.'));}
 return <><span className="muted">{pounds(q.pence)} for {q.days} days · £2 a month, charged by the day · ends with your subscription on {end}</span>
  {link?<><div className="vpn-qr" aria-label="Scan to pay for the VPN" dangerouslySetInnerHTML={{__html:qrSvg(link)}}/><span className="muted">📱 Scan with your phone camera to pay, or <button className="link-button" onClick={()=>bm.vpnBuy().catch(()=>{})}>open the pay page on this computer</button>.</span><span className="muted" role="status">⏳ The VPN appears here once it's paid.</span></>
  :<div className="setting-actions"><button onClick={start}>🔐 Get VPN · {pounds(q.pence)}</button></div>}</>;
}
export function GetVpnPill({vpn,signedIn,onReady}){
 const [open,setOpen]=useState(false);
 if(!signedIn||vpn?.present)return null;
 return <><button className="pill vpn-get" onClick={()=>setOpen(true)}>🔐 Get VPN</button>{open&&<div className="modal-backdrop"><section className="modal vpn-buy" role="dialog" aria-modal="true" aria-label="Get VPN"><button className="close" aria-label="Close" onClick={()=>setOpen(false)}>×</button><h2>🔐 Get VPN</h2><div className="vpn-buy-body"><GetVpn onReady={s=>{setOpen(false);onReady(s);}}/></div></section></div>}</>;
}
export function VpnSetting({vpn,onLocation,onCommand,onReady=()=>{}}){return <div className="setting"><h3>VPN</h3>{!vpn?.present&&<GetVpn onReady={onReady}/>}{vpn?.present&&<span className="muted">{vpn.server||'Choose a location'}</span>}{vpn?.present&&<><span className={'vpn-indicator '+vpn.status}>● {vpn.status==='on'?'Connected':vpn.status==='connecting'?'Connecting…':vpn.status==='failed'?'Connection lost':'Off'}</span><div className="setting-actions"><button onClick={()=>onCommand({command:vpn.status==='off'?'on':'off'})}>{vpn.status==='off'?'Switch on':'Switch off'}</button><button onClick={onLocation}>🌐 Location</button></div></>}</div>;}
export function VpnLocations({bm,vpn,onClose,onCommand}){
 const [rows,setRows]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let current=true;bm.vpnServers().then(r=>{if(current)setRows(r);}).catch(()=>{if(current)setError('Could not load VPN locations.');});return()=>{current=false;};},[bm]);
 async function choose(value){setBusy(true);setError('');try{await onCommand(value);onClose();}catch{setError('Could not change the VPN. Try another server.');}finally{setBusy(false);}}
 return <div className="modal-backdrop"><section className="modal vpn-locations" role="dialog" aria-modal="true" aria-label="Change VPN location"><button className="close" aria-label="Close VPN locations" onClick={onClose}>×</button><h2>VPN location</h2><span className="muted">{vpn?.server}</span>{error&&<p role="alert">{error}</p>}<div className="modal-actions"><button disabled={busy} onClick={()=>choose({command:'best'})}>⚡ Use the best server</button>{!rows&&!error&&<span role="status">Loading server traffic…</span>}{rows?.map(s=><button className="vpn-server" key={s.id} disabled={busy} onClick={()=>choose({command:'server',server_id:s.id})}><span>{s.city} ({s.country})</span><span className="muted">{s.ping>0?'VPN ping '+s.ping+' ms · ':''}Traffic: {s.traffic===null?'Unknown':s.traffic.toLocaleString('en-GB')}</span>{s.traffic!==null&&<progress max="100" value={s.traffic_bar} aria-label={s.city+' traffic comparison'}/>}</button>)}</div>{busy&&<span role="status">Changing location…</span>}</section></div>;
}
/** Home-screen Private DNS switch (free, on by default); the VPN covers lookups while connected. */
export function DnsPill({on,vpnOn,onToggle}){const label=vpnOn?'via VPN':on?'On':'Off';return <button className={'vpn-indicator '+(vpnOn||on?'on':'off')} onClick={onToggle} aria-label={on?'Private DNS on, click to switch off':'Private DNS off, click to switch on'} title="Private DNS gets round broadband blocks on channel lists and the TV guide. If a channel still won't play, try the VPN.">● DNS: {label}</button>;}
