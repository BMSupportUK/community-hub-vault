const CONTROL = 'uk.bmsupport.remote.control';
const HELPER = 'uk.bmsupport.remote';
const SERVICE = `${CONTROL}/${CONTROL}.ControlService`;
const HELPER_APK_URL = 'https://bmsupport.uk/api/public/remote-helper-apk';

/** Downloads the latest BM Remote Helper APK so the customer never installs it by hand. */
async function downloadHelper(destDir, fetchImpl = globalThis.fetch) {
  const fs = require('node:fs');
  const path = require('node:path');
  const res = await fetchImpl(HELPER_APK_URL);
  if (!res.ok) throw new Error(`Could not download BM Remote Helper (error ${res.status}). Check the internet connection and try again.`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100000) throw new Error('Could not download BM Remote Helper. Check the internet connection and try again.');
  fs.mkdirSync(destDir, { recursive: true });
  const file = path.join(destDir, 'bm-helper.apk');
  fs.writeFileSync(file, buf);
  return file;
}

/** Reuses a previously downloaded Helper APK when it is still on disk. */
async function ensureHelperApk(destDir, fetchImpl = globalThis.fetch) {
  const fs = require('node:fs');
  const path = require('node:path');
  const file = path.join(destDir, 'bm-helper.apk');
  try { if (fs.statSync(file).size >= 100000) return file; } catch {}
  return downloadHelper(destDir, fetchImpl);
}

/** Extracts assets/control.apk from the Helper APK without extra tools (stored or deflated entry). */
function extractControl(apkPath, destPath) {
  const fs = require('node:fs');
  const zlib = require('node:zlib');
  const buf = fs.readFileSync(apkPath);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65536); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('The downloaded Helper file is not a valid package. Check the internet connection and try again.');
  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buf.readUInt16LE(offset + 10);
    const compressed = buf.readUInt32LE(offset + 20);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.toString('utf8', offset + 46, offset + 46 + nameLen);
    if (name === 'assets/control.apk') {
      const lhNameLen = buf.readUInt16LE(localOffset + 26);
      const lhExtraLen = buf.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + lhNameLen + lhExtraLen;
      const data = buf.subarray(dataStart, dataStart + compressed);
      const out = method === 0 ? Buffer.from(data) : zlib.inflateRawSync(data);
      fs.writeFileSync(destPath, out);
      return destPath;
    }
    offset += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error('The downloaded Helper does not contain the remote-control installer. Try again.');
}

function privateAddress(value) {
  if (typeof value !== 'string' || !/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return false;
  const p = value.split('.').map(Number);
  if (p.some(n => n > 255)) return false;
  return p[0] === 10 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168);
}

function accessibilityList(current) {
  const entries = current.trim().split(':').map(s => s.trim()).filter(s => s && s !== 'null' && !s.startsWith(`${CONTROL}/`));
  if (entries.some(s => !/^[a-zA-Z0-9_.$]+\/[a-zA-Z0-9_.$]+$/.test(s))) throw new Error('The TV returned an unexpected Accessibility setting. No settings were changed.');
  return [...new Set(entries), SERVICE].join(':');
}

/** "ip" uses the classic port 5555; "ip:port" is the Wireless debugging port shown on Android / Google TV. */
function splitAddress(address) {
  const [ip, port, extra] = String(address).split(':');
  if (extra !== undefined) return { ip, port: null };
  const n = port === undefined ? 5555 : Number(port);
  return { ip, port: Number.isInteger(n) && n > 0 && n < 65536 ? n : null };
}

const PAIR_FAILED = 'Code didn\'t work — open the pairing screen on the TV again for a new code.';
/** Wireless debugging pairing: the TV shows a 6-digit code and pairing port; pairing replaces the Allow box. */
async function pair(ip, pairPort, code, adb, progress) {
  if (!privateAddress(ip)) throw new Error('Enter the TV address shown on the TV, for example 192.168.1.25.');
  const p = Number(pairPort);
  if (!/^\d{6}$/.test(String(code)) || !Number.isInteger(p) || p < 1 || p > 65535) throw new Error('Type the 6-digit code and the pairing port shown on the TV.');
  progress('Pairing with your TV…');
  let out;
  try { out = await adb(['pair', `${ip}:${p}`, String(code)]); } catch { throw new Error(PAIR_FAILED); }
  if (!/Successfully paired/i.test(out)) throw new Error(PAIR_FAILED);
  progress('✓ Paired with your TV.');
}

/** Connects to the TV and waits for the customer to approve the Allow box. Returns the serial. */
async function connect(host, adb, progress, delay = ms => new Promise(r => setTimeout(r, ms))) {
  const { ip, port } = splitAddress(host);
  if (!privateAddress(ip) || !port) throw new Error('Enter the local TV address shown in BM Remote Helper, for example 192.168.1.25.');
  const serial = `${ip}:${port}`;
  progress('Connecting… Look at the TV, tick Always allow from this computer, then press Allow.');
  await adb(['connect', serial]);
  for (let i = 0; i < 60; i++) {
    const devices = await adb(['devices']);
    const line = devices.split(/\r?\n/).find(l => l.startsWith(serial + '\t'));
    if (line?.trim().endsWith('\tdevice')) return serial;
    if (i === 10 || i === 30) await adb(['connect', serial]);
    await delay(1000);
  }
  throw new Error('The TV did not approve this computer. Check debugging is ON on the TV (ADB debugging on Fire TV, Network or Wireless debugging on Android / Google TV), then try again and press Allow on the TV.');
}

/** Reads the real TV state: Helper installed, Control installed, Accessibility on. */
async function readChecks(shell) {
  return {
    adb: true,
    helper: (await shell(`pm path ${HELPER}`)).includes('package:'),
    control: (await shell(`pm path ${CONTROL}`)).includes('package:'),
    accessibility: (await shell('settings get secure enabled_accessibility_services')).includes(SERVICE)
      && (await shell('settings get secure accessibility_enabled')).trim() === '1',
  };
}

/** Wizard step: check whether the TV is already set up, changing nothing. */
async function checkExisting(host, adb, progress, delay) {
  const serial = await connect(host, adb, progress, delay);
  const shell = cmd => adb(['-s', serial, 'shell', cmd]);
  try {
    progress('Checking what is already set up on the TV…');
    return await readChecks(shell);
  } finally { await adb(['disconnect', serial]).catch(() => {}); }
}

/** Wizard step: install BM Remote Helper on the TV and open it. */
async function installHelper(host, adb, progress, delay, fetchImpl = globalThis.fetch, tempDir = require('node:os').tmpdir()) {
  const serial = await connect(host, adb, progress, delay);
  const shell = cmd => adb(['-s', serial, 'shell', cmd]);
  try {
    if (!(await shell(`pm path ${HELPER}`)).includes('package:')) {
      progress('Downloading BM Remote Helper…');
      const apk = await ensureHelperApk(tempDir, fetchImpl);
      progress('Sending BM Remote Helper to the TV and installing it…');
      await adb(['-s', serial, 'push', apk, '/data/local/tmp/bm-helper.apk']);
      try {
        const result = await shell('pm install -r -d /data/local/tmp/bm-helper.apk');
        if (!result.includes('Success')) throw new Error(`The TV could not install BM Remote Helper: ${result.trim().slice(0, 400)}`);
      } finally { await shell('rm -f /data/local/tmp/bm-helper.apk').catch(() => {}); }
      if (!(await shell(`pm path ${HELPER}`)).includes('package:')) throw new Error('BM Remote Helper did not install on the TV. Try again.');
    }
    progress('Opening BM Remote Helper on the TV…');
    await shell(`monkey -p ${HELPER} -c android.intent.category.LAUNCHER 1`).catch(() => {});
    const result = await readChecks(shell);
    return result;
  } finally { await adb(['disconnect', serial]).catch(() => {}); }
}

/** Wizard step: install BM Remote Control from the copy bundled inside the Helper APK. */
async function installControl(host, adb, progress, delay, fetchImpl = globalThis.fetch, tempDir = require('node:os').tmpdir(), extractImpl = extractControl) {
  const serial = await connect(host, adb, progress, delay);
  const shell = cmd => adb(['-s', serial, 'shell', cmd]);
  try {
    if (!(await shell(`pm path ${CONTROL}`)).includes('package:')) {
      progress('Preparing the remote-control app…');
      const apk = await ensureHelperApk(tempDir, fetchImpl);
      const controlApk = extractImpl(apk, require('node:path').join(tempDir, 'bm-control.apk'));
      progress('Sending remote control to the TV and installing it…');
      const temp = '/data/local/tmp/bm-control.apk';
      await adb(['-s', serial, 'push', controlApk, temp]);
      try {
        const result = await shell(`pm install -r -d ${temp}`);
        if (!result.includes('Success')) throw new Error(`The TV could not install BM Remote Control: ${result.trim().slice(0, 400)}`);
      } finally { await shell(`rm -f ${temp}`).catch(() => {}); }
      if (!(await shell(`pm path ${CONTROL}`)).includes('package:')) throw new Error('BM Remote Control did not install on the TV. Try again.');
    }
    const result = await readChecks(shell);
    return result;
  } finally { await adb(['disconnect', serial]).catch(() => {}); }
}

/** Wizard step: switch on BM Remote Control's Accessibility permission and confirm it on the TV. */
async function activate(host, adb, progress, delay) {
  const serial = await connect(host, adb, progress, delay);
  const shell = cmd => adb(['-s', serial, 'shell', cmd]);
  try {
    progress('Switching remote control on…');
    const list = accessibilityList(await shell('settings get secure enabled_accessibility_services'));
    await shell(`settings put secure enabled_accessibility_services ${list}`);
    await shell('settings put secure accessibility_enabled 0');
    await delay(300);
    await shell('settings put secure accessibility_enabled 1');
    const actual = (await shell('settings get secure enabled_accessibility_services')).trim().split(':');
    const on = (await shell('settings get secure accessibility_enabled')).trim();
    if (!actual.includes(SERVICE) || on !== '1') throw new Error('The TV did not confirm remote control is enabled. Open BM Remote Helper and try again.');
    // Leave BM Remote Helper open on the TV so its six-digit code is on screen.
    progress('Opening BM Remote Helper on the TV…');
    await shell(`monkey -p ${HELPER} -c android.intent.category.LAUNCHER 1`).catch(() => {});
    const result = await readChecks(shell);
    return result;
  } finally { await adb(['disconnect', serial]).catch(() => {}); }
}

/** Opens BM Remote Helper (the code app) on the TV so the customer can read its six-digit code. */
/** Connects (Allow box on first use) and puts the 4-digit check code on the TV screen. */
async function showTvCode(host, code, adb, progress, delay) {
  if (!/^\d{4}$/.test(code)) throw new Error('bad code');
  const serial = await connect(host, adb, progress, delay);
  try {
    await adb(['-s', serial, 'shell', `cmd notification post -S bigtext -t 'BM TV Enabler' bm_tv_code 'Your BM TV Enabler code is ${code}'`]);
  } finally { await adb(['disconnect', serial]).catch(() => {}); }
}

async function openCodeApp(host, adb, progress, delay) {
  const serial = await connect(host, adb, progress, delay);
  const shell = cmd => adb(['-s', serial, 'shell', cmd]);
  try {
    await shell(`monkey -p ${HELPER} -c android.intent.category.LAUNCHER 1`).catch(() => {});
  } finally { await adb(['disconnect', serial]).catch(() => {}); }
}

/** One-shot flow kept for compatibility: helper, control, activation, confirmation. */
async function enable(host, adb, progress, delay = ms => new Promise(r => setTimeout(r, ms)), fetchImpl = globalThis.fetch, tempDir = require('node:os').tmpdir(), extractImpl = extractControl) {
  await installHelper(host, adb, progress, delay, fetchImpl, tempDir);
  await installControl(host, adb, progress, delay, fetchImpl, tempDir, extractImpl);
  const checks = await activate(host, adb, progress, delay);
  progress('Remote control is enabled. BM Remote Helper is open on the TV — type its six-digit code on your ticket or order.');
  return { success: true, checks };
}

async function report(code, checks, device, post = globalThis.fetch, helperCode = null) {
  if (!/^\d{8}$/.test(code)) throw new Error('Type the 8-digit link code shown on your ticket or order\'s Remote setup tab.');
  if (device !== 'amazon' && device !== 'android') throw new Error('Choose which TV you are setting up first: Amazon Fire TV or Android / Google TV.');
  const res = await post('https://bmsupport.uk/api/public/remote-setup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, app: 'windows-tv-enabler-1.7', device, checks, ...(/^\d{6}$/.test(helperCode || '') ? { helperCode } : {}) }) });
  if (res.status === 404) throw new Error('That setup code isn\'t valid. Check the code on your ticket or order\'s Remote setup tab and try again.');
  if (res.status === 409) throw new Error('Your ticket or order is set up for the other TV type. Press Change device on its Remote setup tab, or pick the other TV type in this app.');
  if (res.status === 429) throw new Error('Too many tries. Wait 15 minutes, then try again.');
  if (!res.ok) throw new Error(`BM Support couldn't be told (error ${res.status}). Try again.`);
}

/** Asks BM Support for a short single-use code carrying the confirmed TV checks. */
/** Finds a six-digit number in a BM Remote Helper node of a uiautomator dump. */
function helperCodeFrom(xml) {
  for (const node of String(xml || '').match(/<node [^>]*>/g) || []) {
    if (!node.includes(`package="${HELPER}"`)) continue;
    const t = node.match(/text="([0-9 \-]{6,11})"/);
    const digits = t ? t[1].replace(/[^0-9]/g, '') : '';
    if (digits.length === 6) return digits;
  }
  return null;
}

/** Reads the code BM Remote Helper shows on the TV; null when it can't be read. */
async function readHelperCode(host, adb, progress, delay = ms => new Promise(r => setTimeout(r, ms))) {
  try {
    const serial = await connect(host, adb, progress, delay);
    try {
      for (let i = 0; i < 4; i++) {
        const xml = await adb(['-s', serial, 'shell', 'uiautomator dump /data/local/tmp/bm-ui.xml >/dev/null 2>&1; cat /data/local/tmp/bm-ui.xml; rm -f /data/local/tmp/bm-ui.xml']);
        const code = helperCodeFrom(xml);
        if (code) return code;
        await delay(1500);
      }
    } finally { await adb(['disconnect', serial]).catch(() => {}); }
  } catch { /* fall back to typing the code */ }
  return null;
}

async function requestConfirmCode(checks, device, post = globalThis.fetch, helperCode = null) {
  if (device !== 'amazon' && device !== 'android') throw new Error('Choose which TV this is first: Amazon Fire TV or Android / Google TV.');
  if (!checks || !(checks.adb && checks.helper && checks.control && checks.accessibility)) throw new Error('Check the TV again first.');
  let res;
  try { res = await post('https://bmsupport.uk/api/public/enabler-confirm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ app: 'windows-tv-enabler-1.6', device, checks, ...(/^\d{6}$/.test(helperCode || '') ? { helperCode } : {}) }) }); }
  catch { throw new Error('Couldn\'t reach BM Support. Check the internet connection and try again.'); }
  if (res.status === 429) throw new Error('Too many tries. Wait 15 minutes, then try again.');
  const body = res.ok ? await res.json().catch(() => null) : null;
  if (!body || !/^[A-Z0-9]{6}$/.test(body.code || '')) throw new Error(`Couldn't get a code from BM Support (error ${res.status}). Try again.`);
  return body.code;
}

module.exports = { splitAddress, pair, helperCodeFrom, readHelperCode, showTvCode, requestConfirmCode, report, downloadHelper, ensureHelperApk, extractControl, CONTROL, HELPER, SERVICE, privateAddress, accessibilityList, connect, readChecks, checkExisting, installHelper, installControl, activate, openCodeApp, enable };
