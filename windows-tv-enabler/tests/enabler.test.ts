import { describe, expect, test } from 'bun:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { enable, SERVICE, CONTROL, privateAddress, accessibilityList } = require('../core.cjs');
const { parseDescription, safeLocation } = require('../discovery.cjs');

describe('Windows TV Enabler safety and setup', () => {
  test('accepts only local private IPv4 targets, rejects command injection/public addresses', () => {
    expect(privateAddress('192.168.1.25')).toBe(true);
    expect(privateAddress('10.1.2.3')).toBe(true);
    for (const host of ['8.8.8.8', '127.0.0.1', '192.168.1.25 & calc', '192.168.1.999', '-s']) expect(privateAddress(host)).toBe(false);
  });
  test('preserves existing Accessibility services and adds the BM service once', () => {
    expect(accessibilityList(`com.example/com.example.Reader:${SERVICE}`)).toBe(`com.example/com.example.Reader:${SERVICE}`);
    expect(accessibilityList('null')).toBe(SERVICE);
    expect(() => accessibilityList('x;reboot')).toThrow();
  });
  test('lists Amazon Fire TVs only, named even without debugging', () => {
    expect(parseDescription('<device><manufacturer>Amazon</manufacturer><modelName>Fire TV Cube</modelName><friendlyName>Living room</friendlyName></device>')).toEqual({ name: 'Living room' });
    expect(parseDescription('<device><manufacturer>Google</manufacturer><modelName>Chromecast</modelName></device>')).toBeNull();
    expect(parseDescription('<!DOCTYPE x><device><manufacturer>Amazon</manufacturer><modelName>Fire TV</modelName></device>')).toBeNull();
  });
  test('discovery description requests cannot follow remote or arbitrary addresses', () => {
    expect(safeLocation('192.168.1.25', 'http://192.168.1.25:50000/rootdesc.xml')).toBe(true);
    expect(safeLocation('192.168.1.25', 'http://example.com:8008/dd.xml')).toBe(false);
    expect(safeLocation('192.168.1.25', 'http://192.168.1.25:80/admin')).toBe(false);
  });
  test('installs from Helper via local temp path, enables and reads confirmation', async () => {
    const calls: string[][] = []; const serial = '192.168.1.25:5555';
    const adb = async (args: string[]) => {
      calls.push(args);
      if (args[0] === 'devices') return `${serial}\tdevice\n`;
      const command = args[3] || '';
      if (command === 'pm path uk.bmsupport.remote') return 'package:/data/app/helper.apk';
      if (command.startsWith('cp ')) return 'BM_COPY_OK';
      if (command.startsWith('pm install')) return 'Success';
      if (command === 'settings get secure accessibility_enabled') return '1';
      if (command === 'settings get secure enabled_accessibility_services') return calls.filter(a => a[3]?.startsWith('settings put secure enabled_accessibility_services')).length ? SERVICE : 'com.example/com.example.Reader';
      return '';
    };
    expect(await enable('192.168.1.25', adb, () => {}, async () => {})).toMatchObject({ success: true, checks: { adb: true, helper: true, accessibility: true } });
    expect(calls.some(a => a[3] === 'pm install -r -d /data/local/tmp/bm-control.apk')).toBe(true);
    expect(calls.some(a => a[3] === `settings put secure enabled_accessibility_services com.example/com.example.Reader:${SERVICE}`)).toBe(true);
    expect(calls.at(-1)).toEqual(['disconnect', serial]);
  });
  test('installs BM Remote Helper itself when the TV does not have it', async () => {
    const calls: string[][] = []; const serial = '192.168.1.25:5555';
    let helperInstalled = false;
    const adb = async (args: string[]) => {
      calls.push(args);
      if (args[0] === 'devices') return `${serial}\tdevice\n`;
      if (args[2] === 'push') { helperInstalled = true; return ''; }
      const command = args[3] || '';
      if (command === 'pm path uk.bmsupport.remote') return helperInstalled ? 'package:/data/app/helper.apk' : '';
      if (command.startsWith('cp ')) return 'BM_COPY_OK';
      if (command.startsWith('pm install')) return 'Success';
      if (command === 'settings get secure accessibility_enabled') return '1';
      if (command === 'settings get secure enabled_accessibility_services') return SERVICE;
      return '';
    };
    const fakeApk = async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(200000) });
    expect(await enable('192.168.1.25', adb, () => {}, async () => {}, fakeApk as never, '/tmp/bm-test-' + Date.now())).toMatchObject({ success: true });
    expect(calls.some(a => a[2] === 'push' && a[4] === '/data/local/tmp/bm-helper.apk')).toBe(true);
    expect(calls.some(a => a[3] === 'pm install -r -d /data/local/tmp/bm-helper.apk')).toBe(true);
    expect(calls.some(a => a[3]?.startsWith('monkey -p uk.bmsupport.remote'))).toBe(true);
  });
  test('never succeeds when the Helper download fails or the TV skips final confirmation', async () => {
    const adb = async (a: string[]) => a[0] === 'devices' ? '192.168.1.25:5555\tdevice' : '';
    const failedDownload = async () => ({ ok: false, status: 502, arrayBuffer: async () => new ArrayBuffer(0) });
    await expect(enable('192.168.1.25', adb, () => {}, async () => {}, failedDownload as never, '/tmp/bm-test-' + Date.now())).rejects.toThrow("Couldn't download BM Remote Helper");
    const notOn = async (a: string[]) => {
      if (a[0] === 'devices') return '192.168.1.25:5555\tdevice';
      if (a[3]?.startsWith('pm path')) return 'package:/installed';
      if (a[3] === 'settings get secure enabled_accessibility_services') return SERVICE;
      return '0';
    };
    await expect(enable('192.168.1.25', notOn, () => {}, async () => {})).rejects.toThrow('did not confirm');
  });
  test('does not enable a TV that has not approved debugging', async () => {
    const calls: string[][] = [];
    await expect(enable('192.168.1.25', async (args: string[]) => { calls.push(args); return args[0] === 'devices' ? '192.168.1.25:5555\tunauthorized' : ''; }, () => {}, async () => {})).rejects.toThrow('did not approve');
    expect(calls.some(a => a.includes('shell'))).toBe(false);
  });
});
test('Windows app reports checks and device against the ticket setup code', async () => {
  const { report } = require('../core.cjs');
  const sent: { url: string; body: string }[] = [];
  const post = async (url: string, o: { body: string }) => { sent.push({ url, body: o.body }); return { ok: true, status: 200 }; };
  await report('12345678', { adb: true, helper: true, control: true, accessibility: true }, 'amazon', post);
  expect(sent[0]!.url).toBe('https://bmsupport.uk/api/public/remote-setup');
  expect(JSON.parse(sent[0]!.body).code).toBe('12345678');
  expect(JSON.parse(sent[0]!.body).device).toBe('amazon');
  await expect(report('123', {}, 'amazon', post)).rejects.toThrow();
  await expect(report('12345678', {}, undefined, post)).rejects.toThrow(/Choose which TV/);
  await expect(report('12345678', {}, 'android', async () => ({ ok: false, status: 404 }))).rejects.toThrow(/isn't valid/);
  await expect(report('12345678', {}, 'android', async () => ({ ok: false, status: 409 }))).rejects.toThrow(/other TV type/);
});
