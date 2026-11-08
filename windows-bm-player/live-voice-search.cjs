const {matches}=require('./live-search.cjs');
const FILLER=/\b(?:please|show|me|find|watch|play|the|a|on|today|tonight|now|live|tv|channel|channels|category|categories|event|events)\b/gi;
function voiceQuery(spoken){return String(spoken||'').replace(FILLER,' ').replace(/\s+/g,' ').trim();}
function groupedResults(categories,channels,spoken){
 const query=voiceQuery(spoken);
 if(!query)return {categories:[],channels:[]};
 return {categories:categories.filter(c=>channels.some(ch=>String(ch.category)===String(c.id))&&matches(c.name,query)),channels:channels.filter(ch=>matches(ch.name,query))};
}
module.exports={voiceQuery,groupedResults};