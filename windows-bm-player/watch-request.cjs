/**
 * "Watch on my box": turn the title the website asked for into a playlist item.
 * Provider id wins (exact, never a guess); an exact name is the fallback.
 */
function normalize(title) {
  return String(title || '').normalize('NFKC').replace(/\s*\(\d{4}\)\s*$/, '').replace(/\s+/g, ' ').trim().toLowerCase();
}
function find(items, id, title) {
  const list = Array.isArray(items) ? items : [];
  if (id !== undefined && id !== null && String(id) !== '') {
    const byId = list.find((i) => i && String(i.id) === String(id));
    if (byId) return byId;
  }
  const want = normalize(title);
  if (!want) return null;
  return list.find((i) => i && normalize(i.name || i.title) === want) || null;
}
module.exports = { find, normalize };
