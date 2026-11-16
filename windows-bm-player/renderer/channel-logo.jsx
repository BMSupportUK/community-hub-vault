import React,{useState} from 'react';

export function ChannelLogo({channel}){
 const src=channel?.poster||'';
 const [failed,setFailed]=useState('');
 return <span className="channel-logo" aria-hidden="true">{src&&failed!==src?<img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(src)}/>:<span>📺</span>}</span>;
}