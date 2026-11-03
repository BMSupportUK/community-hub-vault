import React,{useEffect,useRef,useState} from 'react';

const MAX_SECONDS=7,TARGET_RATE=16000;

/** 16 kHz mono 16-bit WAV, small enough to send in one go. */
export function encodeWav(chunks,rate){
 const step=Math.max(1,Math.round(rate/TARGET_RATE)),outRate=Math.round(rate/step);
 const total=chunks.reduce((n,c)=>n+c.length,0),length=Math.floor(total/step);
 const view=new DataView(new ArrayBuffer(44+length*2));
 const tag=(o,v)=>{for(let i=0;i<v.length;i++)view.setUint8(o+i,v.charCodeAt(i));};
 tag(0,'RIFF');view.setUint32(4,36+length*2,true);tag(8,'WAVE');tag(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
 view.setUint32(24,outRate,true);view.setUint32(28,outRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);tag(36,'data');view.setUint32(40,length*2,true);
 let o=44,i=0;for(const c of chunks)for(const v of c){if(i++%step)continue;if(o>=44+length*2)break;const s=Math.max(-1,Math.min(1,v));view.setInt16(o,s*(s<0?32768:32767),true);o+=2;}
 return new Uint8Array(view.buffer);
}
function base64(bytes){let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);}

/** Mic button: click, speak, it stops by itself (or click again) and fills in the search. */
export function VoiceButton({onText,onError}){
 const [phase,setPhase]=useState('idle'),[left,setLeft]=useState(MAX_SECONDS);
 const rec=useRef(null);
 useEffect(()=>()=>rec.current?.cancel(),[]);
 async function start(){
  try{
   if(!await window.bm.micAccess())throw new Error('Allow BM Player to use your microphone in your computer settings, then try again.');
   const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
   const ctx=new AudioContext();await ctx.resume();
   const source=ctx.createMediaStreamSource(stream),node=ctx.createScriptProcessor(4096,1,1),chunks=[];
   node.onaudioprocess=e=>chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
   source.connect(node);node.connect(ctx.destination);
   let done=false,timer,tick;
   const cleanup=()=>{clearTimeout(timer);clearInterval(tick);stream.getTracks().forEach(t=>t.stop());node.disconnect();source.disconnect();ctx.close().catch(()=>{});rec.current=null;};
   const finish=async()=>{if(done)return;done=true;const rate=ctx.sampleRate;cleanup();setPhase('working');
    try{const wav=encodeWav(chunks,rate);if(wav.length<4096)throw new Error('Didn\'t hear anything. Click the microphone and speak.');const text=await window.bm.voice({audio:base64(wav),mime:'audio/wav'});if(text)onText(text);}
    catch(e){onError?.(e.message||'Voice search failed. Try again.');}finally{setPhase('idle');}};
   rec.current={stop:finish,cancel:()=>{done=true;cleanup();}};
   setLeft(MAX_SECONDS);setPhase('listening');
   tick=setInterval(()=>setLeft(n=>Math.max(0,n-1)),1000);timer=setTimeout(finish,MAX_SECONDS*1000);
  }catch(e){setPhase('idle');onError?.(e.name==='NotAllowedError'?'Allow BM Player to use your microphone, then try again.':e.name==='NotFoundError'?'No microphone found on this computer.':e.message);}
 }
 const label=phase==='listening'?`● Listening… ${left}s (click to finish)`:phase==='working'?'… Working':'🎤 Voice';
 return <button type="button" className={'voice'+(phase==='listening'?' primary':'')} aria-label="Voice search" disabled={phase==='working'} onClick={()=>phase==='listening'?rec.current?.stop():start()}>{label}</button>;
}
