'use strict';
/** Finds black bars baked into a film/episode picture (top and bottom) so players can zoom past them. Mirrors Android LetterboxCrop. */
const DARK = 28;
function darkRow(px, w, y, ch, order) {
  let sum = 0, max = 0;
  for (let x = 0; x < w; x++) {
    const o = (y * w + x) * ch, r = px[o + order[0]], g = px[o + order[1]], b = px[o + order[2]];
    const l = (r * 3 + g * 6 + b) / 10; sum += l; if (l > max) max = l;
  }
  return sum / w < DARK && max < DARK * 3;
}
/** Share of frame height that holds picture (1 = no bars). px: 4-byte pixels; order = indexes of r,g,b ([0,1,2] RGBA, [2,1,0] BGRA). */
function contentShare(px, w, h, order = [0, 1, 2]) {
  let top = 0; while (top < h / 2 && darkRow(px, w, top, 4, order)) top++;
  let bottom = 0; while (bottom < h / 2 && darkRow(px, w, h - 1 - bottom, 4, order)) bottom++;
  if (top >= h / 2 || bottom >= h / 2) return 1;
  if (Math.abs(top - bottom) > Math.max(2, h / 30)) return 1;
  const share = (h - top - bottom) / h;
  return share > 0.94 ? 1 : Math.max(0.5, share);
}
/** Only zoom further in after the same reading three times running, so dark scenes never make it jump. */
class BarTracker {
  constructor() { this.share = 1; this.seen = 1; this.same = 0; }
  push(v) {
    if (Math.abs(v - this.seen) < 0.03) this.same++; else { this.same = 0; this.seen = v; }
    if (this.same >= 2 && v < this.share - 0.02) { this.share = v; return true; }
    return false;
  }
}
module.exports = { contentShare, BarTracker };
