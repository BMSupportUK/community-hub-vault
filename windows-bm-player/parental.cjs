// Parental control (Windows and Mac), matching the Android box: a 4-digit PIN hides adult categories until unlocked for this app session.
const ADULT=/(adult|xxx|18\s*\+|porn|for adults|hustler|penthouse|playboy|brazzers|babestation|redlight|red light)/i;
const isAdult=name=>ADULT.test(String(name||''));
const validPin=pin=>/^\d{4}$/.test(String(pin||''));
function filterCatalog(data,locked){
 if(!locked||!data)return data;
 const hidden=new Set((data.categories||[]).filter(c=>isAdult(c.name)).map(c=>String(c.id)));
 return {...data,categories:(data.categories||[]).filter(c=>!hidden.has(String(c.id))),items:(data.items||[]).filter(i=>!hidden.has(String(i.category))&&!isAdult(i.categoryName))};
}
module.exports={isAdult,validPin,filterCatalog};
