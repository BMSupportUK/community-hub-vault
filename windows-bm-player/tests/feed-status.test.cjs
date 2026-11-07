const { test } = require('node:test');
const assert = require('node:assert');
const { feedStatus, LABELS } = require('../feed-status.cjs');

const liveSession = (over = {}) => ({ item: { kind: 'live', name: 'Sky Sports' }, since: Date.now() - 30000, ready: true, backup: false, ...over });

test('healthy live feed shows no pill', () => {
  assert.strictEqual(feedStatus(liveSession(), { state: 3, w: 1920 }), null);
});

test('playing with no picture 10s after opening is black', () => {
  assert.strictEqual(feedStatus(liveSession(), { state: 3, w: 0 }), 'black');
});

test('black needs the 10s grace after opening', () => {
  assert.strictEqual(feedStatus(liveSession({ since: Date.now() - 5000 }), { state: 3, w: 0 }), null);
});

test('buffering after the feed was ready shows Buffering', () => {
  assert.strictEqual(feedStatus(liveSession(), { state: 2 }), 'buffering');
});

test('initial load buffering stays hidden until first ready', () => {
  assert.strictEqual(feedStatus(liveSession({ ready: false }), { state: 2 }), null);
});

test('films and episodes never show the pill', () => {
  assert.strictEqual(feedStatus(liveSession({ item: { kind: 'film', name: 'Film' } }), { state: 2 }), null);
});

test('labels match the Android pill wording', () => {
  assert.strictEqual(LABELS.black, 'No picture');
  assert.strictEqual(LABELS.buffering, 'Buffering…');
});
