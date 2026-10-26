const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { execFile } = require('node:child_process');
const { pair, report, readHelperCode, showTvCode, checkExisting, installHelper, installControl, activate, openCodeApp, requestConfirmCode } = require('../core.cjs');
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

const say = text => { if (window && !window.isDestroyed()) window.webContents.send('bm:progress', text); };
const tempDir = () => path.join(app.getPath('temp'), 'bm-tv-enabler');

/** One guarded task at a time, only from our own window. */
function task(handler) {
  return async (event, ...args) => {
    if (!trusted(event) || busy) throw new Error('Another task is already running.');
    busy = true;
    try { return await handler(...args); }
    finally { busy = false; }
  };
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.whenReady().then(() => {
    window = new BrowserWindow({ width: 860, height: 880, minWidth: 620, minHeight: 640, backgroundColor: '#10101a', title: 'BM TV Enabler', autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    ipcMain.handle('bm:scan', task(type => scan(type === 'android' ? 'android' : 'amazon')));
    ipcMain.handle('bm:show-code', task((address, code) => showTvCode(address, code, adb, say)));
    ipcMain.handle('bm:link-report', task(async (code, checks, device, address) => report(code, checks, device, undefined, await readHelperCode(address, adb, say))));
    ipcMain.handle('bm:pair', task((ip, pairPort, code) => pair(ip, pairPort, code, adb, say)));
    ipcMain.handle('bm:check', task(address => checkExisting(address, adb, say)));
    ipcMain.handle('bm:install-helper', task(address => installHelper(address, adb, say, undefined, undefined, tempDir())));
    ipcMain.handle('bm:install-control', task(address => installControl(address, adb, say, undefined, undefined, tempDir())));
    ipcMain.handle('bm:activate', task(address => activate(address, adb, say)));
    ipcMain.handle('bm:open-code-app', task(address => openCodeApp(address, adb, say)));
    ipcMain.handle('bm:confirm-code', task(async (checks, device, address) => requestConfirmCode(checks, device, undefined, address ? await readHelperCode(address, adb, say) : null)));
    window.loadFile(page);
  });
  app.on('window-all-closed', () => {
    execFile(path.join(__dirname, '..', 'tools', 'adb.exe'), ['-P', '5038', 'kill-server'], { windowsHide: true, timeout: 5000 }, () => app.quit());
  });
}
