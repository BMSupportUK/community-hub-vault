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
    expect(await enable('192.168.1.25', adb, () => {}, async () => {})).toEqual({ success: true });
    expect(calls.some(a => a[3] === 'pm install -r -d /data/local/tmp/bm-control.apk')).toBe(true);
    expect(calls.some(a => a[3] === `settings put secure enabled_accessibility_services com.example/com.example.Reader:${SERVICE}`)).toBe(true);
    expect(calls.at(-1)).toEqual(['disconnect', serial]);
  });
  test('never succeeds without the Helper or final TV confirmation', async () => {
    const noHelper = async (a: string[]) => a[0] === 'devices' ? '192.168.1.25:5555\tdevice' : '';
    await expect(enable('192.168.1.25', noHelper, () => {}, async () => {})).rejects.toThrow('Install and open BM Remote Helper');
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