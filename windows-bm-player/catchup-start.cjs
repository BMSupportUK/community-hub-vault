'use strict';
const MINUTE=60000,DEFAULT_MINUTES=2,MAX_MINUTES=20;
function offset(memory,key){const value=memory?.[key];return Number.isInteger(value)&&value>=0&&value<=MAX_MINUTES?value:DEFAULT_MINUTES;}
function recording(item,minutes,now=Date.now()){
 const start=Math.min(item.end-MINUTE,item.start+minutes*MINUTE);
 return {...item,start,end:Math.min(now,item.end+minutes*MINUTE)};
}
function target(base,position,delta,item){
 const reached=base+Math.max(0,Number(position)||0);
 const seconds=Math.max(0,Math.min((item.end-item.start)/1000-60,reached+delta));
 return delta>0?Math.ceil(seconds/60):Math.floor(seconds/60);
}
function learned(minutes){return Math.max(0,Math.min(MAX_MINUTES,minutes));}
module.exports={DEFAULT_MINUTES,MAX_MINUTES,offset,recording,target,learned};