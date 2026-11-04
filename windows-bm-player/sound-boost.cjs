'use strict';
// Sound booster levels shared by Windows (libVLC volume) and Mac (Web Audio gain).
const LEVELS = [
  { id: 'off', label: 'Off', factor: 1 },
  { id: 'low', label: 'Low (+50%)', factor: 1.5 },
  { id: 'medium', label: 'Medium (+100%)', factor: 2 },
  { id: 'high', label: 'High (+150%)', factor: 2.5 },
];
const HIGH_NOTE = 'Very loud — may distort on small speakers.';
function level(id) { return LEVELS.find(l => l.id === id) || LEVELS[0]; }
// base is the customer's 0-100 slider; result is the engine volume (100 = normal, up to 250).
function boostedVolume(base, id) {
  const b = Math.max(0, Math.min(100, Number.isFinite(base) ? base : 100));
  return Math.round(b * level(id).factor);
}
function next(id) { const i = LEVELS.findIndex(l => l.id === id); return LEVELS[(i + 1) % LEVELS.length].id; }
module.exports = { LEVELS, HIGH_NOTE, level, boostedVolume, next };
