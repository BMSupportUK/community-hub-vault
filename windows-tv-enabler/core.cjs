const CONTROL = 'uk.bmsupport.remote.control';
const HELPER = 'uk.bmsupport.remote';
const SERVICE = `${CONTROL}/${CONTROL}.ControlService`;
const HELPER_APK_URL = 'https://bmsupport.uk/api/public/remote-helper-apk';

/** Downloads the latest BM Remote Helper APK so the customer never installs it by hand. */
async function downloadHelper(destDir, fetchImpl = globalThis.fetch) {
  const fs = require('node:fs');
  const path = require('node:path');
  const res = await fetchImpl(HELPER_APK_URL);
  if (!res.ok) throw new Error(`Couldn't download BM Remote Helper (error ${res.status}). Check the internet connection and try again.`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100000) throw new Error('Couldn't download BM Remote Helper. Check the internet connection and try again.');
  fs.mkdirSync(destDir, { recursive: true });
  const file = path.join(destDir, 'bm-helper.apk');
  fs.writeFileSync(file, buf);
  return file;
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

async function enable(host, adb, progress, delay = ms => new Promise(r => setTimeout(r, ms)), fetchImpl = globalThis.fetch, tempDir = require('node:os').tmpdir()) {
  if (!privateAddress(host)) throw new Error('Enter the local TV address shown in BM Remote Helper, for example 192.168.1.25.');
  const serial = `${host}:5555`;
  const shell = cmd => adb(['-s', serial, 'shell', cmd]);
  progress('Connecting… Look at the TV, tick Always allow from this computer, then press Allow.');
  try {
    await adb(['connect', serial]);
    let connected = false;
    for (let i = 0; i < 60; i++) {
      const devices = await adb(['devices']);
      const line = devices.split(/\r?\n/).find(l => l.startsWith(serial + '\t'));
      if (line?.trim().endsWith('\tdevice')) { connected = true; break; }
      if (i === 10 || i === 30) await adb(['connect', serial]);
      await delay(1000);
    }
    if (!connected) throw new Error('The TV did not approve this computer. Check debugging is ON on the TV (ADB debugging on Fire TV, Network debugging on Android / Google TV), then try again and press Allow on the TV.');
    let helper = (await shell(`pm path ${HELPER}`)).includes('package:');
    if (!helper) {
      progress('Installing BM Remote Helper on the TV…');
      const apk = await downloadHelper(tempDir, fetchImpl);
      try {
        await adb(['-s', serial, 'push', apk, '/data/local/tmp/bm-helper.apk']);
        const result = await shell('pm install -r -d /data/local/tmp/bm-helper.apk');
        if (!result.includes('Success')) throw new Error(`The TV could not install BM Remote Helper: ${result.trim().slice(0, 400)}`);
      } finally {
        await shell('rm -f /data/local/tmp/bm-helper.apk').catch(() => {});
        require('node:fs').rmSync(apk, { force: true });
      }
      helper = (await shell(`pm path ${HELPER}`)).includes('package:');
      if (!helper) throw new Error('BM Remote Helper did not install on the TV. Try again.');
    }
    progress('Opening BM Remote Helper on the TV…');
    await shell(`monkey -p ${HELPER} -c android.intent.category.LAUNCHER 1`).catch(() => {});
    if (!(await shell(`pm path ${CONTROL}`)).includes('package:')) {
      progress('Installing BM Remote Control on the TV…');
      const temp = '/data/local/tmp/bm-control.apk';
      const source = `/sdcard/Android/data/${HELPER}/files/control.apk`;
      let copied = '';
      for (let i = 0; i < 15 && !copied.includes('BM_COPY_OK'); i++) {
        copied = await shell(`cp ${source} ${temp} && chmod 644 ${temp} && echo BM_COPY_OK`);
        if (!copied.includes('BM_COPY_OK')) await delay(2000);
      }
      if (!copied.includes('BM_COPY_OK')) throw new Error('Could not find the remote-control installer. Open BM Remote Helper on the TV once, then try again.');
      try {
        const result = await shell(`pm install -r -d ${temp}`);
        if (!result.includes('Success')) throw new Error(`The TV could not install BM Remote Control: ${result.trim().slice(0, 400)}`);
      } finally { await shell(`rm -f ${temp}`).catch(() => {}); }
    }
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
    await shell(`monkey -p ${HELPER} -c android.intent.category.LAUNCHER 1`).catch(() => {});
    progress('Remote control is enabled. BM Remote Helper is open on the TV — type its six-digit code on your support ticket.');
    // Real TV state, reported to bmsupport.uk against the customer's ticket setup code.
    const checks = { adb: true, helper: true, control: (await shell(`pm path ${CONTROL}`)).includes('package:'), accessibility: true };
    return { success: true, checks };
  } finally { await adb(['disconnect', serial]).catch(() => {}); }
}

async function report(code, checks, device, post = globalThis.fetch) {
  if (!/^\d{8}$/.test(code)) throw new Error('Type the 8-digit setup code shown on your support ticket\'s Remote setup tab.');
  if (device !== 'amazon' && device !== 'android') throw new Error('Choose which TV you are setting up first: Amazon Fire TV or Android / Google TV.');
  const res = await post('https://bmsupport.uk/api/public/remote-setup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, app: 'windows-tv-enabler-1.2', device, checks }) });
  if (res.status === 404) throw new Error('Remote control is on, but that setup code isn\'t valid. Check the code on your support ticket\'s Remote setup tab and press Turn on again.');
  if (res.status === 409) throw new Error('Remote control is on, but your ticket is set up for the other TV type. Press Change device on the ticket\'s Remote setup tab, or pick the other TV type in this app.');
  if (res.status === 429) throw new Error('Too many tries. Wait 15 minutes, then try again.');
  if (!res.ok) throw new Error(`Remote control is on, but BM Support couldn't be told (error ${res.status}). Try again.`);
}

module.exports = { report, downloadHelper, CONTROL, HELPER, SERVICE, privateAddress, accessibilityList, enable };