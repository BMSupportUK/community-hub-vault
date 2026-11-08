const { matchChannel } = require('../src/lib/player-channel-match');
const { channelInCountry } = require('../src/lib/sports-channel-links');
function sportsRows(event, items, aliases) {
  const names = items.map(i => i.name), selected = new Set();
  for (const channel of event.channels || []) for (const name of matchChannel(channel, names, aliases)) {
    if (channelInCountry(name, event.channelCountry?.[channel])) selected.add(name);
  }
  return items.filter(i => selected.has(i.name));
}
module.exports = { sportsRows };