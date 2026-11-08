const { test } = require('node:test'); const assert = require('node:assert');
const src = require('fs').readFileSync(require('path').join(__dirname, '../../mac-bm-player/renderer/mac-video.jsx'), 'utf8');

test('live m3u8 keeps the provider hold-back instead of a fixed seconds offset', () => {
  assert.ok(!/liveSyncDuration:/.test(src), 'a fixed liveSyncDuration parks short playlists at the oldest segment');
  assert.ok(/liveSyncDurationCount: 2/.test(src));
  assert.ok(/liveMaxLatencyDurationCount: 6/.test(src));
});
test('a low buffer eases slower instead of freezing, and never above the chosen speed', () => {
  assert.ok(/const EASE = 0\.97/.test(src));
  assert.ok(/addEventListener\('stalled'/.test(src));
  assert.ok(/base \* EASE/.test(src));
  assert.ok(!/playbackRate\s*=\s*1\.0?\s*;/.test(src), 'playback must never race the live edge');
});
test('the chosen speed is remembered so easing returns to it', () => {
  assert.ok(/userRates\.set\(index, data\.rate\)/.test(src));
  assert.ok(/video\.playbackRate = userRates\.get\(index\) \|\| 1/.test(src));
});
