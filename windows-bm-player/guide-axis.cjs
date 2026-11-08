// One piecewise timeline for all channels: crowded hours extend horizontally, never compress.
function guideAxis(start,end,programmes,viewport){
 const bounds=new Set([start,end]);
 for(let t=start;t<end;t+=900000)bounds.add(t);
 for(const p of programmes){if(p.start>start&&p.start<end)bounds.add(p.start);if(p.end>start&&p.end<end)bounds.add(p.end);}
 const times=[...bounds].sort((a,b)=>a-b),widths=times.slice(1).map((t,i)=>Math.max(80,(t-times[i])/(end-start)*viewport));
 for(const p of programmes){
  const s=Math.max(start,p.start),e=Math.min(end,p.end);if(e<=s)continue;
  const segments=widths.map((_,i)=>i).filter(i=>times[i]>=s&&times[i+1]<=e);
  const span=segments.reduce((sum,i)=>sum+widths[i],0);
  const needed=Math.max(220,Math.min(Math.max(220,viewport),String(p.title||'').length*8/3+48));
  if(span<needed&&segments.length)for(const i of segments)widths[i]+=(needed-span)/segments.length;
 }
 const positions=[0];for(const w of widths)positions.push(positions[positions.length-1]+w);
 const x=t=>{if(t<=start)return 0;for(let i=0;i<widths.length;i++)if(t<=times[i+1])return positions[i]+widths[i]*(t-times[i])/(times[i+1]-times[i]);return positions[positions.length-1];};
 return {times,x,width:positions[positions.length-1]};
}
module.exports={guideAxis};