const FILLER=new Set(['v','vs','versus','and','the','fc','afc','match','game','on','watch','show','me','find','play','a','for','please','tonight','today','now','live','is','it','what','where','channel','channels','sports','sport','guide']);
const words=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(' ').filter(Boolean);
function matchesSearch(e,query){
 const want=words(query).filter(w=>!FILLER.has(w));if(!want.length)return false;
 const hw=words([e.title,e.competition,e.sport,e.subcategory,...(e.channels||[])].join(' '));
 const hay=' '+hw.join(' ')+' ',joined=' '+hw.join('')+' ';
 const has=w=>hay.includes(' '+w);
 let found=0;for(let i=0;i<want.length;i++){if(has(want[i]))found++;else if(i+1<want.length&&has(want[i]+want[i+1])){found+=2;i++;}else if(joined.includes(want[i]))found++;}
 return found>=want.length||(want.length>=3&&found>=want.length-1);
}
module.exports={matchesSearch};