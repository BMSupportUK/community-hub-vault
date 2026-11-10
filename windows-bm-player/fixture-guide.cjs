// Saved website fixtures only; never country imports or category refresh.
// General TV stations never ask; official sports brands do, so matched Sports Guide events show.
function fixtureCandidate(name){return !/^(?:UK\s*\|\s*)?(?:BBC\b|ITV\b|Channel [45]\b|Sky (?:Cinema|Atlantic|Comedy|Witness)\b|Discovery\b|Cartoon\b|Nickelodeon\b|Disney\b|CNN\b|ABC:|CBS:|FOX:|NBC:|PBS:|CW:)/i.test(name);}
function overlay(events,provider){const ev=(events||[]).filter(Boolean);if(!ev.length)return provider;const keep=(provider||[]).filter(p=>{const s=+p.start_timestamp||0,e=+p.stop_timestamp||0;return !(s>0&&e>s&&ev.some(x=>s<+x.stop_timestamp&&e>+x.start_timestamp));});return [...ev,...keep].sort((a,b)=>(+a.start_timestamp||0)-(+b.start_timestamp||0));}
async function loadFixtureGuide(channel,website,provider){
 let r=null;
 if(channel&&fixtureCandidate(channel.name))try{r=await website({action:'guide',channel:channel.name});if(r.source==='sports'&&Array.isArray(r.epg_listings))return r.epg_listings;}catch{r=null;}
 const rows=await provider();
 return r&&r.source==='sports_overlay'&&Array.isArray(r.epg_listings)?overlay(r.epg_listings,rows):rows;
}
module.exports={fixtureCandidate,loadFixtureGuide,overlay};
