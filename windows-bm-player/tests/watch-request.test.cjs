const { test } = require('node:test'); const assert = require('node:assert');
const { find, normalize } = require('../watch-request.cjs');

const items = [
  { kind: 'film', id: '8812', name: 'The Matrix (1999)' },
  { kind: 'film', id: '4421', name: 'Inception' },
  { kind: 'series', id: '991', name: 'Breaking Bad' },
];

test('the provider id wins over any name match', () => {
  assert.equal(find(items, '4421', 'The Matrix').id, '4421');
});
test('an exact name finds the title, ignoring the year and spacing', () => {
  assert.equal(find(items, null, '  the   matrix (1999) ').id, '8812');
  assert.equal(find(items, undefined, 'Breaking Bad').id, '991');
});
test('a name that is not on the playlist finds nothing', () => {
  assert.equal(find(items, 'not-a-real-id', 'Some Film Nobody Lists'), null);
  assert.equal(find(items, null, ''), null);
});
test('year suffixes are only stripped at the end of the name', () => {
  assert.equal(normalize('2001: A Space Odyssey'), '2001: a space odyssey');
});
