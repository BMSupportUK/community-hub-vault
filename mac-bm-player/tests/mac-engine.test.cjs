const { test, expect } = require('bun:test');
const eng = require('../electron/mac-engine.cjs');

test('provider URLs become private proxy addresses and resolve back', () => {
  const p = eng.toProxy('http://dns.example:8080/live/u/p/123.ts?x=1');
  expect(p.startsWith('bmstream://')).toBe(true);
  expect(p).not.toContain('dns.example');
  expect(eng.fromProxy(p)).toBe('http://dns.example:8080/live/u/p/123.ts?x=1');
  expect(eng.fromProxy('bmstream://unknowntoken/a.ts')).toBe(null);
});

test('HLS playlists are rewritten so every segment and key goes through the proxy', () => {
  const out = eng.rewritePlaylist('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\nseg1.ts\nhttps://cdn.example/seg2.ts', 'http://edge.example/hls/index.m3u8');
  expect(out).not.toMatch(/https?:\/\//);
  const lines = out.split('\n');
  expect(eng.fromProxy(lines[2])).toBe('http://edge.example/hls/seg1.ts');
  expect(eng.fromProxy(lines[3])).toBe('https://cdn.example/seg2.ts');
  expect(eng.fromProxy(lines[1].match(/URI="([^"]+)"/)[1])).toBe('http://edge.example/hls/key.bin');
});

test('stream kinds pick the right player', () => {
  expect(eng.streamKind('http://a/live/u/p/1.m3u8')).toBe('hls');
  expect(eng.streamKind('http://a/live/u/p/1.ts')).toBe('ts');
  expect(eng.streamKind('http://a/live/u/p/1')).toBe('ts');
  expect(eng.streamKind('http://a/movie/u/p/1.mp4')).toBe('file');
});

test('engine sends only proxy addresses to the window and reports status', () => {
  const sent = [];
  const win = { isDestroyed: () => false, webContents: { send: (_c, d) => sent.push(d) } };
  const e = new eng.MacEngine(win, () => 'UA');
  e.play(0, 'http://dns.example/movie/u/p/9.mp4', { resume: 30 });
  expect(sent[0].src).not.toContain('dns.example');
  expect(sent[0].resume).toBe(30);
  e.report({ index: 0, position: 12, duration: 100, state: 3, seekable: true });
  expect(e.status(0)).toEqual({ position: 12, duration: 100, state: 3, seekable: true });
  e.stop(0);
  expect(e.status(0)).toBe(null);
  expect(sent.at(-1).action).toBe('stop');
});
