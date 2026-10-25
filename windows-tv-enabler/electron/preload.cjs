const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('bmTv', {
  scan: () => ipcRenderer.invoke('bm:scan'),
  enable: address => ipcRenderer.invoke('bm:enable', address),
  progress: callback => {
    const listener = (_, text) => callback(text);
    ipcRenderer.on('bm:progress', listener);
    return () => ipcRenderer.removeListener('bm:progress', listener);
  },
});