const crypto = require('node:crypto');
const IDLE_MS = 3 * 60 * 60_000;
const RESPONSE_MS = 60_000;
const adult = value => /adult|xxx|18\+|porn|erotic/i.test(String(value || ''));
function progress(position, duration) { return duration > 0 ? Math.min(100, Math.max(0, Math.round(position / duration * 100))) : 0; }
function resume(position, duration) { return duration > 0 && position > 0 && position < duration * .95; }
function sortItems(items, mode = 'added') {
  return [...items].sort((a,b) => mode === 'az' ? a.name.localeCompare(b.name) : mode === 'za' ? b.name.localeCompare(a.name) : mode === 'rating' ? b.rating - a.rating : b.added - a.added);
}
function watchKey(dns, user, kind, id) { return crypto.createHash('sha256').update(`${dns}|${user}`).digest('hex').slice(0,24) + `:${kind}:${id}`; }
function streamUrls(dns, user, pass, item, format = 'auto') {
  const root = dns.replace(/\/+$/,''), u = encodeURIComponent(user), p = encodeURIComponent(pass), id = encodeURIComponent(String(item.id));
  if (item.kind === 'catchup') return [catchupUrl(dns, user, pass, item.id, item.start, item.end)];
  if (item.kind === 'live') {
    const base = `${root}/live/${u}/${p}/${id}`;
    return format === 'hls' ? [base+'.m3u8'] : format === 'ts' ? [base+'.ts'] : [base+'.ts',base+'.m3u8',`${root}/${u}/${p}/${id}`];
  }
  const ext = /^[a-z0-9]{1,8}$/i.test(item.ext || '') ? item.ext : 'mp4';
  return [`${root}/${item.kind === 'film' ? 'movie' : 'series'}/${u}/${p}/${id}.${ext}`];
}
// Xtream timeshift: /timeshift/user/pass/minutes/YYYY-MM-DD:HH-MM/id.ts, start in UK time like the Android app.
function catchupUrl(dns, user, pass, id, start, end, timeZone = 'Europe/London') {
  const root = dns.replace(/\/+$/,''), u = encodeURIComponent(user), p = encodeURIComponent(pass);
  const mins = Math.max(1, Math.ceil(((end > start ? end : start + 3600000) - start) / 60000));
  const f = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(new Date(start)).map(x => [x.type, x.value]));
  return `${root}/timeshift/${u}/${p}/${mins}/${f.year}-${f.month}-${f.day}:${f.hour}-${f.minute}/${encodeURIComponent(String(id))}.ts`;
}
// Past programmes the provider still holds for a catch-up channel, newest first.
function catchupProgrammes(rows, days, now = Date.now()) {
  const from = now - Math.max(1, days) * 86400000;
  return programmes((rows || []).filter(r => !('has_archive' in r) || Number(r.has_archive) === 1)).filter(p => p.start >= from && p.end <= now).sort((a,b) => b.start - a.start);
}
function decode(value) { try { const text=Buffer.from(value || '', 'base64').toString('utf8'); return text.includes('\uFFFD') ? value : text; } catch { return value || ''; } }
function programmes(rows) {
  return (rows || []).map(p => ({ id:String(p.id || p.start_timestamp), title:decode(p.title), desc:decode(p.description || ''), start:Number(p.start_timestamp)*1000, end:Number(p.stop_timestamp || p.end_timestamp)*1000 }))
    .filter(p=>Number.isFinite(p.start) && Number.isFinite(p.end) && p.end > p.start);
}
function itemFromProvider(kind, p) {
  return { kind, id:String(p.stream_id ?? p.series_id ?? p.id), name:String(p.name || p.title || 'Untitled'), category:String(p.category_id || ''), poster:String(p.stream_icon || p.cover || ''), ext:p.container_extension || 'mp4', added:Number(p.added || p.last_modified || 0), rating:Number(p.rating || p.rating_5based || 0), archive: kind === 'live' && Number(p.tv_archive) === 1 ? Math.max(1, Number(p.tv_archive_duration) || 1) : 0 };
}
function inactive(lastInput, promptedAt, now) { return promptedAt ? now - promptedAt >= RESPONSE_MS ? 'exit' : 'prompt' : now - lastInput >= IDLE_MS ? 'prompt' : 'active'; }
module.exports = { adult, progress, resume, sortItems, watchKey, streamUrls, catchupUrl, catchupProgrammes, programmes, itemFromProvider, inactive, IDLE_MS, RESPONSE_MS };