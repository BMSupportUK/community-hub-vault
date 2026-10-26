const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('bmTv', {
  scan: () => ipcRenderer.invoke('bm:scan'),
  check: address => ipcRenderer.invoke('bm:check', address),
  installHelper: address => ipcRenderer.invoke('bm:install-helper', address),
  installControl: address => ipcRenderer.invoke('bm:install-control', address),
  activate: address => ipcRenderer.invoke('bm:activate', address),
  openCodeApp: address => ipcRenderer.invoke('bm:open-code-app', address),
  confirmCode: (checks, device) => ipcRenderer.invoke('bm:confirm-code', checks, device),
  progress: callback => {
    const listener = (_, text) => callback(text);
    ipcRenderer.on('bm:progress', listener);
    return () => ipcRenderer.removeListener('bm:progress', listener);
  },
});
