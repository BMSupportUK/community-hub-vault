import React,{useEffect,useRef} from 'react';
export function VideoSurface({index,visible=true}){
 const ref=useRef(null);
 useEffect(()=>{
  let frame;
  const update=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
   const rows=[...document.querySelectorAll('[data-video-index]')].map(el=>{const r=el.getBoundingClientRect();const x=Math.max(0,r.x/window.innerWidth),y=Math.max(0,r.y/window.innerHeight);return{index:Number(el.dataset.videoIndex),x,y,width:Math.max(0,Math.min(r.width/window.innerWidth,1-x)),height:Math.max(0,Math.min(r.height/window.innerHeight,1-y)),visible:el.dataset.videoVisible==='true'};});
   window.bm.surface(rows).catch(()=>{});
  });};
  const observer=new ResizeObserver(update);if(ref.current)observer.observe(ref.current);
  window.addEventListener('resize',update);window.addEventListener('scroll',update,true);update();
  return()=>{observer.disconnect();cancelAnimationFrame(frame);window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);window.bm.surface([]).catch(()=>{});};
 },[index,visible]);
 return <div className="video-surface" ref={ref} data-video-index={index} data-video-visible={visible} aria-label="In-app video"/>;
}