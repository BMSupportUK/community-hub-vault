import React,{useEffect,useRef} from 'react';
export function VideoSurface({index,visible=true,still=null,audioOnly=false}){
 const ref=useRef(null);
 useEffect(()=>{
  let frame,last='';
  const update=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
   const rows=[...document.querySelectorAll('[data-video-index]')].map(el=>{const r=el.getBoundingClientRect();const x=Math.max(0,r.x/window.innerWidth),y=Math.max(0,r.y/window.innerHeight);return{index:Number(el.dataset.videoIndex),x,y,width:Math.max(0,Math.min(r.width/window.innerWidth,1-x)),height:Math.max(0,Math.min(r.height/window.innerHeight,1-y)),visible:el.dataset.videoVisible==='true'};});
   const key=JSON.stringify(rows);if(key===last)return;last=key; // unchanged position: skip the trip to the main process
   window.bm.surface(rows).catch(()=>{});
  });};
  const observer=new ResizeObserver(update);if(ref.current)observer.observe(ref.current);
  window.addEventListener('resize',update);const onScroll=e=>{const t=e.target;if(t===document||t===window||(t instanceof Element&&t.querySelector('[data-video-index]')))update();};
  window.addEventListener('scroll',onScroll,true);update();
  return()=>{observer.disconnect();cancelAnimationFrame(frame);window.removeEventListener('resize',update);window.removeEventListener('scroll',onScroll,true);window.bm.surface([]).catch(()=>{});};
 },[index,visible,audioOnly]);
 const MacVideo=typeof window!=='undefined'?window.__bmMacVideo:null;
 return <div className="video-surface" ref={ref} data-video-index={index} data-video-visible={visible&&!audioOnly} aria-label={audioOnly?'Radio studio illustration':'In-app video'}>
  {still&&<img className="video-still" src={still} alt=""/>}
  {MacVideo&&<MacVideo index={index}/>}
  {audioOnly&&<img className="radio-studio-art" src="radio_studio.jpg" alt="Radio station DJ mixing songs in the studio"/>}
 </div>;
}
