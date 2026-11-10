// Saved website fixtures only; never country imports or category refresh.
function fixtureCandidate(name){return !/\b(?:sky sports|tnt sports|bt sport|eurosport|premier sports|espn|bein sports|fox sports|nbc sports|cbs sports|tsn|sportsnet|supersport|willow|ten sports|star sports|sony sports)\b/i.test(name)&&!/^(?:UK\s*\|\s*)?(?:BBC\b|ITV\b|Channel [45]\b|Sky (?:Cinema|Atlantic|Comedy|Witness)\b|Discovery\b|Cartoon\b|Nickelodeon\b|Disney\b|CNN\b|ABC:|CBS:|FOX:|NBC:|PBS:|CW:)/i.test(name);}
async function loadFixtureGuide(channel,website,provider){
 if(channel&&fixtureCandidate(channel.name))try{const r=await website({action:'guide',channel:channel.name});if(r.source==='sports'&&Array.isArray(r.epg_listings))return r.epg_listings;}catch{}
 return provider();
}
module.exports={fixtureCandidate,loadFixtureGuide};
