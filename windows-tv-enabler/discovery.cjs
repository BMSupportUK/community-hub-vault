const dgram = require('node:dgram');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const { privateAddress } = require('./core.cjs');

const paths = [':8008/ssdp/device-desc.xml', ':8008/dd.xml', ':50000/rootdesc.xml', ':50000/description.xml'];
function bases() {
  return [...new Set(Object.values(os.networkInterfaces()).flat().filter(i => i && !i.internal && i.family === 'IPv4' && privateAddress(i.address)).map(i => i.address.substring(0, i.address.lastIndexOf('.') + 1)))];
}
function safeLocation(host, location) {
  try { const u = new URL(location); return u.protocol === 'http:' && u.hostname === host && !u.username && !u.password && [8008, 50000].includes(Number(u.port)); } catch { return false; }
}
function parseDescription(xml) {
  if (xml.length > 65536 || /<!DOCTYPE|<!ENTITY/i.test(xml)) return null;
  const field = tag => (xml.match(new RegExp(`<(?:[\\w-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tag}>`, 'i'))?.[1] || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/[\x00-\x1f]/g, ' ').trim().slice(0, 100);
  const maker = field('manufacturer');
  const model = `${field('modelName')} ${field('modelDescription')}`;
  if (!/amazon/i.test(maker) || !/fire\s?tv|\baft[a-z0-9]+\b/i.test(model)) return null;
  return { name: field('friendlyName') || 'Amazon Fire TV — name unavailable' };
}
/** Any device description: name plus whether it is an Amazon device (for filtering Android lists). */
function parseInfo(xml) {
  if (xml.length > 65536 || /<!DOCTYPE|<!ENTITY/i.test(xml) || !/<(?:[\w-]+:)?device\b/i.test(xml)) return null;
  const amazon = parseDescription(xml);
  if (amazon) return { name: amazon.name, amazon: true };
  const name = (xml.match(/<(?:[\w-]+:)?friendlyName\b[^>]*>([\s\S]*?)<\//i)?.[1] || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/[\x00-\x1f]/g, ' ').trim().slice(0, 100);
  return { name: name || null, amazon: /<(?:[\w-]+:)?manufacturer\b[^>]*>[^<]*amazon/i.test(xml) };
}
function readDescription(host, url) {
  if (!safeLocation(host, url)) return Promise.resolve(null);
  return new Promise(resolve => {
    const req = http.get(url, { timeout: 1400 }, res => {
      if (res.statusCode !== 200) { res.resume(); resolve(null); return; }
      let xml = ''; res.setEncoding('utf8');
      res.on('data', s => { xml += s; if (xml.length > 65536) req.destroy(); });
      res.on('end', () => { const info = parseInfo(xml); resolve(info ? { ...info, cast: new URL(url).port === '8008' } : null); });
      res.on('error', () => resolve(null));
    });
    req.on('timeout', () => req.destroy()); req.on('error', () => resolve(null));
  });
}
/** 0 = no answer, 1 = device there but debugging closed (refused), 2 = debugging open. TCP only. */
function probe(host) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host, port: 5555 });
    const done = result => { socket.destroy(); resolve(result); };
    socket.setTimeout(500); socket.once('connect', () => done(2)); socket.once('timeout', () => done(0)); socket.once('error', e => done(e && e.code === 'ECONNREFUSED' ? 1 : 0));
  });
}
function reachable(host) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host, port: 5555 });
    const done = result => { socket.destroy(); resolve(result); };
    socket.setTimeout(600); socket.once('connect', () => done(true)); socket.once('timeout', () => done(false)); socket.once('error', () => done(false));
  });
}
async function advertised(networks) {
  const found = new Map();
  await Promise.all(networks.map(base => new Promise(resolve => {
    const socket = dgram.createSocket('udp4');
    let timer;
    const done = () => { clearTimeout(timer); try { socket.close(); } catch {} resolve(); };
    socket.on('error', done);
    socket.on('message', (data, info) => {
      if (!privateAddress(info.address) || !info.address.startsWith(base)) return;
      const text = data.toString('utf8');
      const location = text.match(/^location:\s*(.+)$/im)?.[1]?.trim();
      found.set(info.address, { location: location && safeLocation(info.address, location) ? location : null, hinted: /amazon|\baft[a-z0-9]+\b/i.test(text), dial: /dial-multiscreen|google|android/i.test(text) });
    });
    socket.bind(0, () => {
      timer = setTimeout(done, 4200);
      const address = Object.values(os.networkInterfaces()).flat().find(i => i?.family === 'IPv4' && i.address.startsWith(base))?.address;
      if (address) { try { socket.setMulticastInterface(address); } catch {} }
      for (const st of ['ssdp:all', 'urn:dial-multiscreen-org:service:dial:1']) {
        const request = Buffer.from(`M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: ${st}\r\n\r\n`);
        socket.send(request, 1900, '239.255.255.250', () => {});
      }
    });
  })));
  return found;
}
/** type 'amazon' lists only Fire TVs; type 'android' lists TV-like devices that are not Amazon
 * (Cast/DIAL TVs, or anything with network debugging open), so customers only see their kind. */
async function scan(type = 'amazon') {
  type = 'all'; // No type filter: list every device with its name, Amazon first.
  const networks = bases();
  if (!networks.length) throw new Error('Connect your computer to the same home network as the TV, or enter the TV address manually.');
  const hints = await advertised(networks);
  const hosts = networks.flatMap(b => Array.from({ length: 254 }, (_, i) => b + (i + 1)));
  const devices = []; let next = 0;
  if (type === 'all') {
    await Promise.all(Array.from({ length: 48 }, async () => {
      while (next < hosts.length) {
        const host = hosts[next++]; const hint = hints.get(host);
        const p = await probe(host);
        if (!p && !hint) continue;
        let desc = hint?.location ? await readDescription(host, hint.location) : null;
        for (const path of paths) { if (desc?.name) break; desc = (await readDescription(host, `http://${host}${path}`)) || desc; }
        const amazon = Boolean(desc?.amazon || hint?.hinted);
        devices.push({ address: host, name: desc?.name || (amazon ? 'Amazon device — name unavailable' : 'Unknown device'), debugging: p === 2, amazon });
      }
    }));
    return devices.sort((a, b) => (b.amazon - a.amazon) || (b.debugging - a.debugging) || a.address.localeCompare(b.address, undefined, { numeric: true }));
  }
  await Promise.all(Array.from({ length: 48 }, async () => {
    while (next < hosts.length) {
      const host = hosts[next++]; const hint = hints.get(host);
      let desc = hint?.location ? await readDescription(host, hint.location) : null;
      for (const p of paths) { if (desc?.amazon || desc?.cast) break; desc = (await readDescription(host, `http://${host}${p}`)) || desc; }
      const amazon = Boolean(desc?.amazon || hint?.hinted);
      if (type === 'amazon') {
        // Many Fire TVs don't answer DIAL/UPnP: list a silent device with debugging open; known non-Amazon stays out.
        if (!amazon) { if (desc || hint?.dial || !(await reachable(host))) continue; devices.push({ address: host, name: 'Amazon Fire TV — name unavailable', debugging: true }); continue; }
        devices.push({ address: host, name: desc?.name || 'Amazon Fire TV — name unavailable', debugging: await reachable(host) });
      } else {
        if (amazon) continue;
        const debugging = await reachable(host);
        if (!debugging && !desc?.cast && !hint?.dial) continue;
        devices.push({ address: host, name: desc?.name || 'Android / Google TV — name unavailable', debugging });
      }
    }
  }));
  return devices.sort((a, b) => a.name.localeCompare(b.name) || a.address.localeCompare(b.address, undefined, { numeric: true }));
}
module.exports = { scan, safeLocation, parseDescription, parseInfo };