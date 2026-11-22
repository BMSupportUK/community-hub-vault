'use strict';
// Splits the provider's "EPL | Premier League Hub" Live TV category into one category per
// overseas broadcaster; the rest stay in the original category renamed "... | Other".
// Mirrors tv-player HubSplit.java — keep in step.
const GROUPS=[['stan','Stan Sport'],['starhub','Star Hub Premier'],['fubo','Fubo Sports'],['plplus','Premier League+'],['astro','Astro Premier League'],['nowhk','Now HK Sports'],['flowsport','Flowsport'],['monomax','Monomax'],['coupang','Coupang Play'],['peacock','Peacock Sports']];
const norm=s=>String(s||'').toLowerCase().replace(/\s+/g,' ').trim();
const isHub=name=>norm(name).includes('premier league hub');
function group(name){const n=norm(name);
 if(n.includes('coupang'))return 'coupang';
 if(n.includes('peacock'))return 'peacock';
 if(n.includes('stan sport'))return 'stan';
 if(n.includes('star hub')||n.includes('starhub'))return 'starhub';
 if(n.includes('fubo'))return 'fubo';
 if(n.includes('premier league+')||n.includes('premier league +'))return 'plplus';
 if(n.startsWith('astro')||n.includes(' astro'))return 'astro';
 if(n.includes('now hk')||n.includes('nowhk'))return 'nowhk';
 if(n.includes('flowsport'))return 'flowsport';
 if(n.includes('monomax'))return 'monomax';
 return null;}
function split(cats,items){
 const hubs=new Map(cats.filter(c=>isHub(c.name)).map(c=>[c.id,c.name]));
 if(!hubs.size)return {categories:cats,items};
 const categories=[];
 for(const c of cats){if(!hubs.has(c.id)){categories.push(c);continue;}
  for(const [slug,label]of GROUPS)categories.push({id:c.id+'~'+slug,name:c.name.trim()+' | '+label});
  categories.push({id:c.id,name:c.name.trim()+' | Other'});}
 const out=items.map(i=>{if(!hubs.has(String(i.category)))return i;const g=group(i.name);return g?{...i,category:i.category+'~'+g}:i;});
 return {categories,items:out};
}
module.exports={group,isHub,split};
