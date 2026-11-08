'use strict';
// Other versions of the same channel (UHD/FHD/HD/SD, country tags) for Swap channel; mirrors Android normChannel.
const TAGS=/\b(?:uk|gb|usa|us|ire|ie|ireland|au|aus|australia|ca|canada|za|south africa|nz|int|fhd|uhd|hd|sd|4k|hevc|h265|raw|backup|vip|channel|tv|50fps)\b/g;
function norm(name){let s=String(name||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}+]+/gu,' ').replace(/\+/g,' plus ');s=s.replace(/(\p{L})(\d)/gu,'$1 $2').replace(/(\d)(\p{L})/gu,'$1 $2').replace(TAGS,' ').replace(/\bsports\b/g,'sport').replace(/\b0+(\d)/g,'$1');return s.replace(/\s+/g,' ').trim();}
function variants(item,items){const key=norm(item?.name);if(!key)return[];return (items||[]).filter(o=>o&&o.id!==item.id&&norm(o.name)===key);}
/** Same event first, then variants; Not working last; current channel and duplicates dropped; max 12. */
function swapList(current,eventRows,variantRows,downNames){const down=new Set((downNames||[]).map(n=>String(n).toLowerCase()));const seen=new Set([current?.id]);const ok=[],bad=[];
 for(const [rows,sameEvent] of [[eventRows||[],true],[variantRows||[],false]])for(const r of rows){if(!r||seen.has(r.id))continue;seen.add(r.id);const o={...r,sameEvent,down:down.has(String(r.name||'').toLowerCase())};(o.down?bad:ok).push(o);}
 return [...ok,...bad].slice(0,12);}
module.exports={norm,variants,swapList};
