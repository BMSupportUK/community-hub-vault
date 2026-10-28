import { describe, expect, test } from 'bun:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { discoverHost, parseInfo } = require('../discovery.cjs');
const host = '192.168.1.25';
const fireTv = (name = '') => `<device><manufacturer>Amazon</manufacturer><modelName>Fire TV Cube</modelName><friendlyName>${name}</friendlyName></device>`;

describe('Windows TV names match phone discovery', () => {
  test('finds the named TV with no SSDP reply and no debugging response', async () => {
    const result = await discoverHost(host, null, async (_host: string, url: string) => url.endsWith('/rootdesc.xml') ? parseInfo(fireTv('Living room TV')) : null, async () => 0);
    expect(result).toEqual({ address: host, name: 'Living room TV', amazon: true, debugging: false });
  });
  test('continues past nameless Fire TV metadata to find the real name', async () => {
    expect(parseInfo(fireTv()).name).toBeNull();
    const urls: string[] = [];
    const result = await discoverHost(host, { location: `http://${host}:49152/device.xml` }, async (_host: string, url: string) => {
      urls.push(url);
      return parseInfo(fireTv(url.endsWith('/dd.xml') ? 'Bedroom Fire TV' : ''));
    }, async () => 2);
    expect(result.name).toBe('Bedroom Fire TV');
    expect(result.address).toBe(host);
    expect(urls).toContain(`http://${host}:8008/dd.xml`);
  });
  test('uses a name from the advertised device port', async () => {
    const location = `http://${host}:49152/device.xml`;
    const result = await discoverHost(host, { location }, async (_host: string, url: string) => url === location ? parseInfo('<device><friendlyName>Google TV — Lounge</friendlyName><manufacturer>Google</manufacturer></device>') : null, async () => 2);
    expect(result).toEqual({ address: host, name: 'Google TV — Lounge', amazon: false, debugging: true });
  });
  test('never invents a name for a TV that does not publish one', async () => {
    const result = await discoverHost(host, null, async () => parseInfo(fireTv()), async () => 2);
    expect(result.name).toBe('Amazon device — name unavailable');
  });
  test('excludes silent addresses after attempting description discovery', async () => {
    let reads = 0;
    expect(await discoverHost(host, null, async () => { reads++; return null; }, async () => 0)).toBeNull();
    expect(reads).toBe(4);
  });
});