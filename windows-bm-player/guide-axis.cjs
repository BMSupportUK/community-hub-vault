// Fixed half-hour timeline shared by every row; listings never affect geometry.
function guideAxis(start,end,programmes,viewport){
 const times=[];
 for(let t=start;t<end;t+=1800000)times.push(t);
 times.push(end);
 const width=Math.max(0,viewport);
 const x=t=>end>start?Math.max(0,Math.min(1,(t-start)/(end-start)))*width:0;
 return {times,x,width};
}
module.exports={guideAxis};