/** Episode card label: the episode number and that episode's title kept apart, so a card can put them on separate lines instead of truncating one long line. */
function episodeTitle(ep) {
  const row = ep && typeof ep === 'object' ? ep : {};
  let number = String(row.episode ?? '').trim();
  let title = String(row.name ?? '').trim().replace(/^E\s*\d+\s*[.:-]\s*/i, '');
  const placeholder = title.match(/^episode\s*\.?\s*(\d*)$/i);
  if (placeholder) {
    if (!number && placeholder[1]) number = placeholder[1];
    title = '';
  }
  if (!number && !title) title = 'Episode';
  return { number, title };
}
module.exports = { episodeTitle };
