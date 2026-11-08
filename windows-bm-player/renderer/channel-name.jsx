import React,{useLayoutEffect,useRef,useState} from 'react';
export function ChannelName({children}){
 const frame=useRef(null),text=useRef(null);
 const [overflow,setOverflow]=useState(0);
 useLayoutEffect(()=>{const measure=()=>setOverflow(Math.max(0,(text.current?.scrollWidth||0)-(frame.current?.clientWidth||0)));measure();const observer=new ResizeObserver(measure);if(frame.current)observer.observe(frame.current);return()=>observer.disconnect();},[children]);
 return <span ref={frame} className={'channel-name-frame'+(overflow?' overflowing':'')} style={{'--channel-overflow':`-${overflow}px`,'--channel-duration':`${Math.max(6,overflow/30+3)}s`}}><span ref={text} className="channel-name-text">{children}</span></span>;
}