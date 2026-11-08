const { test } = require('node:test'); const assert = require('node:assert');
const src = require('fs').readFileSync(require('path').join(__dirname, '../electron/main.cjs'), 'utf8');
test('desktop never switches or shares ts/m3u8 because of buffering', () => {
  assert.ok(!/format_set/.test(src)); assert.ok(!/preferFormat\(/.test(src)); assert.ok(!/syncFormats\(\)\.catch/.test(src));
});
