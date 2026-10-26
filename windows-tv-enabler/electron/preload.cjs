const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('bmTv', {
  scan: type => ipcRenderer.invoke('bm:scan', type === 'android' ? 'android' : 'amazon'),
  showCode: (address, code) => ipcRenderer.invoke('bm:show-code', address, code),
  linkReport: (code, checks, device, address) => ipcRenderer.invoke('bm:link-report', code, checks, device, address),
  pair: (ip, pairPort, code) => ipcRenderer.invoke('bm:pair', ip, pairPort, code),
  check: address => ipcRenderer.invoke('bm:check', address),
  installHelper: address => ipcRenderer.invoke('bm:install-helper', address),
  installControl: address => ipcRenderer.invoke('bm:install-control', address),
  installApps: address => ipcRenderer.invoke('bm:install-apps', address),
  activate: address => ipcRenderer.invoke('bm:activate', address),
  openCodeApp: address => ipcRenderer.invoke('bm:open-code-app', address),
  confirmCode: (checks, device, address) => ipcRenderer.invoke('bm:confirm-code', checks, device, address),
  progress: callback => {
    const listener = (_, text) => callback(text);
    ipcRenderer.on('bm:progress', listener);
    return () => ipcRenderer.removeListener('bm:progress', listener);
  },
});
