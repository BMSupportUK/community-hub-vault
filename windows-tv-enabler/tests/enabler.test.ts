import { describe, expect, test } from 'bun:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { enable, checkExisting, installHelper, installControl, activate, extractControl, SERVICE, CONTROL, privateAddress, accessibilityList } = require('../core.cjs');
const { parseDescription, safeLocation } = require('../discovery.cjs');

/** Builds a minimal zip holding one stored (uncompressed) entry. */
function storedZip(name: string, data: Buffer): Buffer {
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(0, 8); local.writeUInt16LE(0, 10);
  local.writeUInt32LE(0, 12); local.writeUInt32LE(0, 14); local.writeUInt32LE(0, 18);
  local.writeUInt32LE(data.length, 22); local.writeUInt32LE(data.length, 26);
  local.writeUInt16LE(name.length, 28); local.writeUInt16LE(0, 30 - 2);
  const nameBuf = Buffer.from(name, 'utf8');
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(0, 10); central.writeUInt32LE(0, 12); central.writeUInt32LE(0, 16);
  central.writeUInt32LE(0, 20); central.writeUInt32LE(data.length, 24); central.writeUInt32LE(data.length, 28 - 4);
  central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28); central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32);
  central.writeUInt32LE(0, 42);
  const body = Buffer.concat([local, nameBuf, data]);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(46 + name.length, 12);
  eocd.writeUInt32LE(body.length, 16);
  return Buffer.concat([body, central, nameBuf, eocd]);
}

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
  test('extracts the bundled remote-control app from the Helper package', () => {
    const fs = require('node:fs');
    const dir = '/tmp/bm-zip-' + Date.now();
    fs.mkdirSync(dir, { recursive: true });
    const apk = dir + '/helper.apk';
    const payload = Buffer.alloc(150000, 7);
    fs.writeFileSync(apk, storedZip('assets/control.apk', payload));
    const out = extractControl(apk, dir + '/control.apk');
    expect(fs.readFileSync(out).length).toBe(150000);
    expect(() => extractControl(apk, dir + '/missing.apk')).not.toThrow();
    fs.writeFileSync(apk, storedZip('assets/other.apk', payload));
    expect(() => extractControl(apk, dir + '/none.apk')).toThrow(/does not contain/);
  });
  test('checkExisting reads real TV state without changing anything', async () => {
    const calls: string[][] = []; const serial = '192.168.1.25:5555';
    const adb = async (args: string[]) => {
      calls.push(args);
      if (args[0] === 'devices') return `${serial}\tdevice\n`;
      const command = args[3] || '';
      if (command === 'pm path uk.bmsupport.remote') return 'package:/data/app/helper.apk';
      if (command === `pm path ${CONTROL}`) return '';
      if (command === 'settings get secure enabled_accessibility_services') return 'com.example/com.example.Reader';
      if (command === 'settings get secure accessibility_enabled') return '1';
      return '';
    };
    const checks = await checkExisting('192.168.1.25', adb, () => {}, async () => {});
    expect(checks).toEqual({ adb: true, helper: true, control: false, accessibility: false });
    expect(calls.some(a => a[3]?.startsWith('settings put'))).toBe(false);
    expect(calls.some(a => a[3]?.startsWith('pm install'))).toBe(false);
    expect(calls.at(-1)).toEqual(['disconnect', serial]);
  });
  test('installs from a pushed control app, enables and reads confirmation', async () => {
    const calls: string[][] = []; const serial = '192.168.1.25:5555';
    const adb = async (args: string[]) => {
      calls.push(args);
      if (args[0] === 'devices') return `${serial}\tdevice\n`;
      const command = args[3] || '';
      if (command === 'pm path uk.bmsupport.remote') return 'package:/data/app/helper.apk';
      if (command.startsWith('pm install')) return 'Success';
      if (command === 'settings get secure accessibility_enabled') return '1';
      if (command === 'settings get secure enabled_accessibility_services') return calls.filter(a => a[3]?.startsWith('settings put secure enabled_accessibility_services')).length ? SERVICE : 'com.example/com.example.Reader';
      return '';
    };
    const fakeApk = async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(200000) });
    const fakeExtract = (_apk: string, dest: string) => { require('node:fs').writeFileSync(dest, Buffer.alloc(150000)); return dest; };
    expect(await enable('192.168.1.25', adb, () => {}, async () => {}, fakeApk as never, '/tmp/bm-test-' + Date.now(), fakeExtract)).toMatchObject({ success: true, checks: { adb: true, helper: true, accessibility: true } });
    expect(calls.some(a => a[2] === 'push' && a[4] === '/data/local/tmp/bm-control.apk')).toBe(true);
    expect(calls.some(a => a[3] === 'pm install -r -d /data/local/tmp/bm-control.apk')).toBe(true);
    expect(calls.some(a => a[3]?.startsWith('cp '))).toBe(false);
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
      if (command.startsWith('pm install')) return 'Success';
      if (command === 'settings get secure accessibility_enabled') return '1';
      if (command === 'settings get secure enabled_accessibility_services') return SERVICE;
      return '';
    };
    const fakeApk = async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(200000) });
    const fakeExtract = (_apk: string, dest: string) => { require('node:fs').writeFileSync(dest, Buffer.alloc(150000)); return dest; };
    const checks = await installHelper('192.168.1.25', adb, () => {}, async () => {}, fakeApk as never, '/tmp/bm-test-' + Date.now());
    expect(checks.helper).toBe(true);
    expect(calls.some(a => a[2] === 'push' && a[4] === '/data/local/tmp/bm-helper.apk')).toBe(true);
    expect(calls.some(a => a[3] === 'pm install -r -d /data/local/tmp/bm-helper.apk')).toBe(true);
    expect(calls.some(a => a[3]?.startsWith('monkey -p uk.bmsupport.remote'))).toBe(true);
    expect(await enable('192.168.1.25', adb, () => {}, async () => {}, fakeApk as never, '/tmp/bm-test-' + Date.now(), fakeExtract)).toMatchObject({ success: true });
  });
  test('installControl skips the install when remote control is already present', async () => {
    const calls: string[][] = []; const serial = '192.168.1.25:5555';
    const adb = async (args: string[]) => {
      calls.push(args);
      if (args[0] === 'devices') return `${serial}\tdevice\n`;
      const command = args[3] || '';
      if (command.startsWith('pm path')) return 'package:/installed';
      if (command === 'settings get secure accessibility_enabled') return '1';
      if (command === 'settings get secure enabled_accessibility_services') return SERVICE;
      return '';
    };
    const checks = await installControl('192.168.1.25', adb, () => {}, async () => {});
    expect(checks.control).toBe(true);
    expect(calls.some(a => a[3]?.startsWith('pm install'))).toBe(false);
  });
  test('never succeeds when the Helper download fails or the TV skips final confirmation', async () => {
    const adb = async (a: string[]) => a[0] === 'devices' ? '192.168.1.25:5555\tdevice' : '';
    const failedDownload = async () => ({ ok: false, status: 502, arrayBuffer: async () => new ArrayBuffer(0) });
    await expect(enable('192.168.1.25', adb, () => {}, async () => {}, failedDownload as never, '/tmp/bm-test-' + Date.now())).rejects.toThrow("Could not download BM Remote Helper");
    const notOn = async (a: string[]) => {
      if (a[0] === 'devices') return '192.168.1.25:5555\tdevice';
      if (a[3]?.startsWith('pm path')) return 'package:/installed';
      if (a[3] === 'settings get secure enabled_accessibility_services') return SERVICE;
      return '0';
    };
    await expect(activate('192.168.1.25', notOn, () => {}, async () => {})).rejects.toThrow('did not confirm');
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
