const {contextBridge,ipcRenderer}=require('electron');
const methods=['state','link','refresh','catalog','epg','series','sports','play','stop','control','surface','settings','favourite','report','reminder','continue','exit','speed','openLink'];
const bridge=Object.fromEntries(methods.map(name=>[name,(value)=>ipcRenderer.invoke('player:'+name,value)]));
bridge.subscribe=fn=>{ const listener=(_event,data)=>fn(data); ipcRenderer.on('player:event',listener); return ()=>ipcRenderer.removeListener('player:event',listener); };
contextBridge.exposeInMainWorld('bm',bridge);