/** Episode card label: the episode number and that episode's title kept apart, so a card can put them on separate lines instead of truncating one long line. */
const SEP='[\\s.:|_\\-\u2013\u2014]*';
const esc=v=>v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
/** Strips a repeated series name and S01E03-style codes so only the episode's own title is left. */
function cleanEpisodeName(title, series) {
  let t = String(title ?? '').trim();
  const s = String(series ?? '').trim().replace(/\s*\(\d{4}\)$/, '');
  if (s) t = t.replace(new RegExp('^' + esc(s) + '(\\s*\\(\\d{4}\\))?' + SEP, 'i'), '');
  t = t.replace(new RegExp('^(S\\d{1,3}\\s*E\\d{1,4}|\\d{1,3}x\\d{1,4}|E\\d{1,4}|Season\\s*\\d+\\s*Episode\\s*\\d+|Episode\\s*\\d+)' + SEP, 'i'), '');
  return t.trim();
}
function episodeTitle(ep, series) {
  const row = ep && typeof ep === 'object' ? ep : {};
  let number = String(row.episode ?? '').trim();
  let title = String(row.name ?? '').trim().replace(/^E\s*\d+\s*[.:-]\s*/i, '');
  const placeholder = title.match(/^episode\s*\.?\s*(\d*)$/i);
  if (placeholder) {
    if (!number && placeholder[1]) number = placeholder[1];
    title = '';
  }
  title = cleanEpisodeName(title, series);
  if (!number && !title) title = 'Episode';
  return { number, title };
}
module.exports = { episodeTitle, cleanEpisodeName };
