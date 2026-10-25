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
function readDescription(host, url) {
  if (!safeLocation(host, url)) return Promise.resolve(null);
  return new Promise(resolve => {
    const req = http.get(url, { timeout: 1400 }, res => {
      if (res.statusCode !== 200) { res.resume(); resolve(null); return; }
      let xml = ''; res.setEncoding('utf8');
      res.on('data', s => { xml += s; if (xml.length > 65536) req.destroy(); });
      res.on('end', () => resolve(parseDescription(xml)));
      res.on('error', () => resolve(null));
    });
    req.on('timeout', () => req.destroy()); req.on('error', () => resolve(null));
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
      found.set(info.address, { location: location && safeLocation(info.address, location) ? location : null, hinted: /amazon|\baft[a-z0-9]+\b/i.test(text) });
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
async function scan() {
  const networks = bases();
  if (!networks.length) throw new Error('Connect your computer to the same home network as the Fire TV, or enter the TV address manually.');
  const hints = await advertised(networks);
  const hosts = networks.flatMap(b => Array.from({ length: 254 }, (_, i) => b + (i + 1)));
  const devices = []; let next = 0;
  await Promise.all(Array.from({ length: 48 }, async () => {
    while (next < hosts.length) {
      const host = hosts[next++]; const hint = hints.get(host);
      let desc = hint?.location ? await readDescription(host, hint.location) : null;
      for (const p of paths) { if (desc) break; desc = await readDescription(host, `http://${host}${p}`); }
      if (!desc && !hint?.hinted) continue;
      devices.push({ address: host, name: desc?.name || 'Amazon Fire TV — name unavailable', debugging: await reachable(host) });
    }
  }));
  return devices.sort((a, b) => a.name.localeCompare(b.name) || a.address.localeCompare(b.address, undefined, { numeric: true }));
}
module.exports = { scan, safeLocation, parseDescription };