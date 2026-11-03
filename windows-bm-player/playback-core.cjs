function orderBrowse(items,kind,mode='added'){
 const rows=[...items];
 if(kind==='live'||mode==='default')return rows;
 return rows.sort((a,b)=>mode==='az'?a.name.localeCompare(b.name):mode==='za'?b.name.localeCompare(a.name):mode==='rating'?b.rating-a.rating:b.added-a.added);
}
function surfaceRows(value){
 if(!Array.isArray(value)||value.length>3)return [];
 return value.filter(r=>Number.isInteger(r.index)&&r.index>=0&&r.index<3&&['x','y','width','height'].every(k=>Number.isFinite(r[k])&&r[k]>=0&&r[k]<=1)&&r.x+r.width<=1.001&&r.y+r.height<=1.001).map(r=>({...r,visible:r.visible===true}));
}
module.exports={orderBrowse,surfaceRows};