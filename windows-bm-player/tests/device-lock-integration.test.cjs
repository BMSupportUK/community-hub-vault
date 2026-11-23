const {test,expect}=require('bun:test');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {createRequire}=require('node:module');
const main=path.resolve(__dirname,'../electron/main.cjs');
function player(fetcher){
 const requireMain=createRequire(main),events=[],writes=[],calls=[],stopped=[];
 const native={close(){calls.push('vpn-close');},off:async()=>{},disconnect:async()=>{}};
 const electron={app:{requestSingleInstanceLock:()=>false,quit(){},getVersion:()=> 'test'},safeStorage:{isEncryptionAvailable:()=>true,encryptString:x=>x},powerSaveBlocker:{stop:x=>calls.push('sleep-'+x)}};
 const context={require:name=>name==='electron'?electron:name==='node:fs'?{writeFileSync:(_,value)=>writes.push(JSON.parse(value))}:name==='../vpn-native.cjs'?{createNative:()=>native}:name==='./mac-engine.cjs'?{registerScheme(){},setTransport(){}}:requireMain(name),process,Buffer,URL,Headers,AbortSignal,setTimeout,setInterval:()=>0,setImmediate,clearTimeout,console,__dirname:path.dirname(main),fetch:fetcher};
 vm.createContext(context);
 vm.runInContext(fs.readFileSync(main,'utf8')+`
 win={isDestroyed:()=>false,webContents:{send:(_,event)=>events.push(event),session:{clearStorageData:async()=>calls.push('clear-storage')}}};
 file='test-store';store={token:'old-token',dns:'https://provider.invalid',user:'viewer',pass:'secret',favourites:[{id:'f'}],recent:[{id:'h'}],orders:[{id:'o'}],progress:{film:20}};
 gate.restore();pinPassed=true;linkVerified=true;engine={status:()=>({position:30,duration:100}),stop:index=>stopped.push(index)};
 sessions=[{index:0,item:{kind:'film',id:'f'},duration:100}];
 globalThis.api={site,getCode,unlinked,publicState,store:()=>store};`,Object.assign(context,{events,writes,calls,stopped}));
 return {...context.api,events,writes,calls,stopped};
}
const reply=(status,data)=>({ok:status===200,status,headers:new Headers(),json:async()=>data});
test('website unlink stops playing, wipes persisted data and never registers a replacement',async()=>{
 const actions=[];
 const app=player(async(_,options)=>{actions.push(JSON.parse(options.body).action);return reply(401,{error:'Unknown device'});});
 await expect(app.site({action:'poll'})).rejects.toThrow();
 expect(app.store()).toEqual({unlinked:true});expect(app.stopped).toEqual([0]);
 expect(app.writes.every(row=>JSON.stringify(row)==='{"unlinked":true}')).toBe(true);
 expect(app.publicState().playing).toEqual([]);expect(app.publicState().signedIn).toBe(false);
 expect(app.calls).toContain('clear-storage');expect(app.calls).toContain('vpn-close');
 await expect(app.getCode()).rejects.toThrow('This device has been unlinked');
 expect(actions).toEqual(['poll']); // No registration or shared favourites/progress deletion.
});
test('credentials received after unlink cannot restore the account',async()=>{
 let deliver;
 const app=player(()=>new Promise(resolve=>{deliver=resolve;}));
 const pending=app.site({action:'poll'});
 await app.unlinked();deliver(reply(200,{linked:true,credentials:{username:'late',password:'late'}}));
 await expect(pending).rejects.toThrow('This device has been unlinked');
 expect(app.store()).toEqual({unlinked:true});expect(app.publicState().signedIn).toBe(false);
});
test('wrong verification codes leave the existing account intact',async()=>{
 const app=player(async()=>reply(401,{error:"That code isn't right."}));
 await expect(app.site({action:'unlock'})).rejects.toThrow();
 expect(app.store().user).toBe('viewer');expect(app.store().unlinked).toBeUndefined();expect(app.stopped).toEqual([]);
});