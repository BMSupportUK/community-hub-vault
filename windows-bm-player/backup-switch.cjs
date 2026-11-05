'use strict';
/**
 * Routes each screen to the main player or the BM backup engine (ffmpeg conversion
 * into the in-window <video>). Windows: main = libVLC, backup = MacEngine.
 * Mac: both are the same MacEngine, which switches that screen to conversion.
 * Once a screen moves to the backup it stays there until it is stopped.
 */
class BackupSwitch {
  constructor(primary, backup) { this.p = primary || null; this.b = backup || null; this.on = new Set(); this.fills = new Map(); }
  /** Films and episodes fill the screen (zoom) in both players; live TV and catch up keep their shape. */
  setFill(i, on) { this.fills.set(i, !!on); }
  usingBackup(i) { return this.on.has(i) || (!this.p && !!this.b); }
  eng(i) { return this.usingBackup(i) ? this.b : this.p; }
  canBackup() { return !!this.b && this.b.backupReady?.() !== false; }
  play(i, url, o = {}) {
    o = { ...o, fill: !!this.fills.get(i) };
    if (this.usingBackup(i)) { if (!this.canBackup()) throw new Error('No player available.'); return this.b.playBackup(i, url, o); }
    return this.p.play(i, url, o);
  }
  useBackup(i, url, o = {}) {
    o = { ...o, fill: !!this.fills.get(i) };
    if (!this.canBackup() || this.on.has(i)) return false;
    if (this.p && this.p !== this.b) { try { this.p.stop(i); } catch {} }
    this.on.add(i);
    this.b.playBackup(i, url, o);
    return true;
  }
  /** Black-bar check runs on the main player only; the backup <video> checks itself in the window. */
  checkBars(i, decode) { if (!this.usingBackup(i)) this.p?.checkBars?.(i, decode); }
  status(i) { return this.eng(i)?.status(i) || null; }
  pause(i, v) { this.eng(i)?.pause(i, v); }
  seek(i, v) { this.eng(i)?.seek(i, v); }
  volume(i, v) { this.eng(i)?.volume(i, v); }
  subtitleTracks(i) { return this.eng(i)?.subtitleTracks?.(i) || 0; }
  setSubtitles(i, on) { this.eng(i)?.setSubtitles?.(i, on); }
  report(v) { this.b?.report?.(v); if (this.p && this.p !== this.b) this.p.report?.(v); }
  layout(rows) { this.p?.layout?.(rows); }
  stop(i) {
    if (this.p && this.p !== this.b) { try { this.p.stop(i); } catch {} }
    this.b?.stop(i);
    this.on.delete(i);
    this.fills.delete(i);
  }
  close() { try { this.p?.close?.(); } catch {} if (this.b !== this.p) this.b?.close?.(); this.on.clear(); }
}
module.exports = { BackupSwitch };
