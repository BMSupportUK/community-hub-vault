import { expect, test } from 'bun:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { installScreenCommand, installOurApps } = require('../core.cjs');

const base = 'am start -n uk.bmsupport.installscreen/.MainActivity -f 0x20000000 --es state ';

test('install screen commands match the phone app for each state', () => {
  expect(installScreenCommand('installing', 'Purple Player', 2, 4)).toBe(base + "installing --es app 'Purple Player' --ei index 2 --ei total 4");
  expect(installScreenCommand('skipped', 'IPTV Smarters', 1, 3)).toBe(base + "skipped --es app 'IPTV Smarters' --ei index 1 --ei total 3");
  expect(installScreenCommand('complete', null, 3, 3, ['A', 'B'])).toBe(base + "complete --ei index 3 --ei total 3 --es apps 'A|B'");
  expect(installScreenCommand('error', null, 0, 0)).toBe(base + 'error --ei index 0 --ei total 0');
  expect(installScreenCommand('reboot', null, 0, 0)).toContain('--es state error');
  expect(installScreenCommand('installing', "x'; reboot; '", 1, 1)).not.toContain(';');
});

test('TV with the screen app gets skipped, installing and complete updates', async () => {
  const shells: string[] = [];
  const fetchApps = async (url: string) => {
    if (url.endsWith('/tv-install-list')) return new Response(JSON.stringify({ apps: [
      { name: 'Already there', packageName: 'uk.bmsupport.player', path: '/api/public/tv-install-apk/old' },
      { name: 'New app', packageName: 'uk.bmsupport.newplayer', path: '/api/public/tv-install-apk/new' },
    ] }));
    return new Response(new Uint8Array(10));
  };
  const adb = async (args: string[]) => {
    if (args[0] === 'devices') return '192.168.1.25:5555\tdevice';
    if (args[2] === 'shell') shells.push(args[3]);
    if (args.includes('pm list packages -d --user current')) return '';
    if (args.includes('pm list packages --user current')) return 'package:uk.bmsupport.player\npackage:uk.bmsupport.installscreen';
    return 'Success';
  };
  await installOurApps('192.168.1.25', adb, () => {}, async () => {}, fetchApps, '/tmp/bm-screen-' + Date.now());
  const screen = shells.filter(s => s.startsWith('am start -n uk.bmsupport.installscreen'));
  expect(screen).toEqual([
    installScreenCommand('skipped', 'Already there', 1, 2),
    installScreenCommand('installing', 'New app', 2, 2),
    installScreenCommand('complete', null, 2, 2, ['Already there', 'New app']),
  ]);
});
