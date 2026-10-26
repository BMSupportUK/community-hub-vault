import { expect, test } from 'bun:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { installOurApps } = require('../core.cjs');

const fakeFetch = (apps: unknown[]) => (async (url: string) => {
  if (url.endsWith('/api/public/tv-install-list')) return new Response(JSON.stringify({ apps }));
  if (url.includes('/api/public/tv-install-apk/bad')) return new Response('no', { status: 404 });
  return new Response(new Uint8Array(10));
}) as never;

test('installs every ticked app, skips unsafe paths, and keeps going after a failure', async () => {
  const installs: string[] = [];
  const adb = async (a: string[]) => {
    if (a[0] === 'devices') return '192.168.1.25:5555\tdevice';
    if (a[0] === 'connect') return 'connected';
    if (a.includes('pm install -r /data/local/tmp/bm-app.apk')) { installs.push('x'); return installs.length === 2 ? 'Failure [INSTALL_FAILED_VERSION_DOWNGRADE]' : 'Success'; }
    return '';
  };
  const result = await installOurApps('192.168.1.25', adb, () => {}, async () => {}, fakeFetch([
    { name: 'Player', path: '/api/public/tv-install-apk/a' },
    { name: 'Newer on TV', path: '/api/public/tv-install-apk/b' },
    { name: 'Broken', path: '/api/public/tv-install-apk/bad' },
    { name: 'Evil', path: 'https://evil.example/x.apk' },
  ]), '/tmp/bm-apps-' + Date.now());
  expect(result.installed).toEqual(['Player', 'Newer on TV']);
  expect(result.failed).toEqual(['Broken']);
});

test('nothing ticked stops with a message and never touches the TV', async () => {
  let touched = false;
  await expect(installOurApps('192.168.1.25', async () => { touched = true; return ''; }, () => {}, async () => {}, fakeFetch([]), '/tmp')).rejects.toThrow('No apps are set up');
  expect(touched).toBe(false);
});
