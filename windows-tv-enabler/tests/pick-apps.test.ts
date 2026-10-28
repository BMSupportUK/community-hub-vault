import { expect, test } from 'bun:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { pickApps } = require('../core.cjs');

const apps = [
  { name: 'A', path: '/api/public/tv-install-apk/a', packageName: 'uk.a' },
  { name: 'B', path: '/api/public/tv-install-apk/b', packageName: 'uk.b' },
  { name: 'C', path: '/api/public/tv-install-apk/c', packageName: 'uk.c' },
];

test('no choice installs every app', () => {
  expect(pickApps(apps, null, new Set()).map((a: any) => a.name)).toEqual(['A', 'B', 'C']);
});

test('unticked apps are left out; already-installed apps still reported', () => {
  expect(pickApps(apps, ['/api/public/tv-install-apk/a'], new Set(['uk.c'])).map((a: any) => a.name)).toEqual(['A', 'C']);
});

test('nothing ticked leaves nothing to install', () => {
  expect(pickApps(apps, [], new Set())).toEqual([]);
});
