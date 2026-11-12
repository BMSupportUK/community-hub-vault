const {contextBridge,ipcRenderer}=require('electron');
const methods=['signinChat','signinCode','totpStart','totpResetRequest','totpConfirm','usePinInstead','state','link','unlock','refresh','catalog','epg','epgCategory','catchup','series','sports','play','stop','control','surface','settings','favourite','ratings','vote','report','reminder','continue','exit','speed','openLink','videoStatus','voice','micAccess','closeAnnouncement','majorSeen','details','swap','swapped','pinCheck','pinCreate','rooms','welcomeVoice'];
const bridge=Object.fromEntries(methods.map(name=>[name,(value)=>ipcRenderer.invoke('player:'+name,value)]));
bridge.subscribe=fn=>{ const listener=(_event,data)=>fn(data); ipcRenderer.on('player:event',listener); return ()=>ipcRenderer.removeListener('player:event',listener); };
bridge.platform=process.platform==='darwin'?'mac':'windows';
contextBridge.exposeInMainWorld('bm',bridge);