const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { execFile } = require('node:child_process');
const { enable, report } = require('../core.cjs');
const { scan } = require('../discovery.cjs');
let window; let busy = false;
const page = path.join(__dirname, '..', 'dist', 'index.html');
const trusted = event => event.sender === window?.webContents && event.senderFrame?.url === pathToFileURL(page).href;

function adb(args) {
  const keys = path.join(app.getPath('userData'), 'adb'); fs.mkdirSync(keys, { recursive: true });
  const executable = path.join(__dirname, '..', 'tools', 'adb.exe');
  return new Promise((resolve, reject) => execFile(executable, ['-P', '5038', ...args], {
    windowsHide: true, timeout: 25000, maxBuffer: 1024 * 1024,
    env: { ...process.env, ANDROID_USER_HOME: keys, ADB_VENDOR_KEYS: path.join(keys, 'adbkey') },
  }, (error, stdout, stderr) => {
    if (error) reject(new Error(`Could not communicate with the TV. Check its address and ADB debugging switch. ${stderr?.trim().slice(0, 200) || ''}`));
    else resolve(stdout);
  }));
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.whenReady().then(() => {
    window = new BrowserWindow({ width: 860, height: 880, minWidth: 620, minHeight: 640, backgroundColor: '#10101a', title: 'BM TV Enabler', autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    ipcMain.handle('bm:scan', async event => {
      if (!trusted(event) || busy) throw new Error('Another task is already running.');
      busy = true; try { return await scan(); } finally { busy = false; }
    });
    ipcMain.handle('bm:enable', async (event, address, code) => {
      if (!trusted(event) || busy) throw new Error('Another task is already running.');
      busy = true;
      const say = text => { if (!window.isDestroyed()) window.webContents.send('bm:progress', text); };
      try {
        const clean = String(code ?? '').replace(/\D/g, '');
        if (clean.length !== 8) throw new Error('Type the 8-digit setup code shown on your support ticket\'s Remote setup tab.');
        const result = await enable(address, adb, say);
        say('Telling BM Support your TV is ready…');
        await report(clean, result.checks);
        say('Remote control is on and BM Support has been told. Now open BM Remote Helper on the TV and type its code on your ticket.');
        return result;
      }
      finally { busy = false; }
    });
    window.loadFile(page);
  });
  app.on('window-all-closed', () => {
    execFile(path.join(__dirname, '..', 'tools', 'adb.exe'), ['-P', '5038', 'kill-server'], { windowsHide: true, timeout: 5000 }, () => app.quit());
  });
}