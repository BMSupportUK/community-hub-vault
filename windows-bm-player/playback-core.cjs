function orderBrowse(items,kind,mode='added'){
 const rows=[...items];
 if(kind==='live'||mode==='default')return rows;
 return rows.sort((a,b)=>mode==='az'?a.name.localeCompare(b.name):mode==='za'?b.name.localeCompare(a.name):mode==='rating'?b.rating-a.rating:b.added-a.added);
}
function defaultCategory(categories,kind){
 const rows=categories||[];
 const pattern=kind==='live'?/^uk\s*\|\s*free\s*to\s*air/i:kind==='film'?/\bcinema\b/i:kind==='series'?/\brecommend(?:ed)?\b/i:null;
 return (pattern&&rows.find(c=>pattern.test(c.name))||rows[0])?.id||'all';
}
function surfaceRows(value){
 if(!Array.isArray(value)||value.length>3)return [];
 return value.filter(r=>Number.isInteger(r.index)&&r.index>=0&&r.index<3&&['x','y','width','height'].every(k=>Number.isFinite(r[k])&&r[k]>=0&&r[k]<=1)&&r.x+r.width<=1.001&&r.y+r.height<=1.001).map(r=>({...r,visible:r.visible===true}));
}
// Screen-pixel box for a pane; null when it is too small to draw into. libVLC's
// video output fails if its window is squashed to ~0px mid-play (preview → full screen
// relayout), which ended the stream and forced a reconnect, so tiny boxes hide instead.
function paneBox(row,width,height){const x=Math.round(row.x*width),y=Math.round(row.y*height),w=Math.round(row.width*width),h=Math.round(row.height*height);return row.visible&&w>=16&&h>=16?{x,y,w,h}:null;}
module.exports={orderBrowse,surfaceRows,defaultCategory,paneBox};