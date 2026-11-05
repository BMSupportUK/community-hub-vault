'use strict';
/**
 * Film/episode/series positions follow the account across devices through the device-token
 * `progress`/`progress_set` actions. Local keys are core.watchKey ("<hash>:<kind>:<id>", seconds);
 * the website uses "<kind>:<id>" in milliseconds. Newest update wins per title.
 */
const PORTABLE = /^(film|episode|series):[A-Za-z0-9._-]{1,80}$/;
function portable(localKey) { const rest = String(localKey || '').split(':').slice(1).join(':'); return PORTABLE.test(rest) ? rest : null; }
function toRemote(localKey, entry) {
  const key = portable(localKey);
  if (!key || !entry) return null;
  return { key, position_ms: Math.max(0, Math.round((entry.position || 0) * 1000)), duration_ms: Math.max(0, Math.round((entry.duration || 0) * 1000)), updated_at: Math.round(entry.at || 1) };
}
/** Merge pulled rows into local progress; returns the number of titles that changed. */
function mergeRemote(progress, prefix, items) {
  let changed = 0;
  for (const r of items || []) {
    if (!r || !PORTABLE.test(r.key)) continue;
    const k = prefix + ':' + r.key, local = progress[k];
    if (local && (local.at || 0) >= r.updated_at) continue;
    progress[k] = { position: r.position_ms / 1000, duration: r.duration_ms / 1000, at: r.updated_at };
    changed++;
  }
  return changed;
}
module.exports = { portable, toRemote, mergeRemote };
