function normalize(value){return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\bsports\b/g,'sport').replace(/[^a-z0-9]+/g,' ').trim();}
function matches(name,query){const tokens=normalize(query).split(/\s+/).filter(Boolean),hay=normalize(name);return tokens.every(token=>hay.includes(token));}
function filterLive(items,category,query){return items.filter(item=>(String(query||'').trim()||category==='all'||item.category===category)&&matches(item.name,query));}
module.exports={matches,filterLive};