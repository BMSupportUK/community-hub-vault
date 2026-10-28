const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('bmTv', {
  login: pin => ipcRenderer.invoke('bm:login', pin),
  setToken: token => ipcRenderer.invoke('bm:set-token', token),
  refresh: (address, token) => ipcRenderer.invoke('bm:refresh', address, token),
  scan: type => ipcRenderer.invoke('bm:scan', type === 'android' || type === 'all' ? type : 'amazon'),
  showCode: (address, code) => ipcRenderer.invoke('bm:show-code', address, code),
  linkReport: (code, checks, device, address) => ipcRenderer.invoke('bm:link-report', code, checks, device, address),
  pair: (ip, pairPort, code) => ipcRenderer.invoke('bm:pair', ip, pairPort, code),
  check: address => ipcRenderer.invoke('bm:check', address),
  installHelper: address => ipcRenderer.invoke('bm:install-helper', address),
  installControl: address => ipcRenderer.invoke('bm:install-control', address),
  listApps: address => ipcRenderer.invoke('bm:list-apps', address),
  installApps: (address, only) => ipcRenderer.invoke('bm:install-apps', address, only),
  activate: address => ipcRenderer.invoke('bm:activate', address),
  openCodeApp: address => ipcRenderer.invoke('bm:open-code-app', address),
  confirmCode: (checks, device, address, kind) => ipcRenderer.invoke('bm:confirm-code', checks, device, address, kind),
  progress: callback => {
    const listener = (_, text) => callback(text);
    ipcRenderer.on('bm:progress', listener);
    return () => ipcRenderer.removeListener('bm:progress', listener);
  },
});
