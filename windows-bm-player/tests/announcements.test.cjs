const {test,expect}=require('bun:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

// Run the actual main-process polling function without booting Electron or using a device token.
const source=fs.readFileSync(path.join(__dirname,'../electron/main.cjs'),'utf8');
const start=source.indexOf('let announcement=null,annBusy=false;');
const end=source.indexOf('\nasync function poll()',start);
if(start<0||end<0)throw new Error('Announcement polling function not found');
async function pollAnnouncement(age,elapsed,clockOffset=0){
 let now=100000+clockOffset;
 const context=vm.createContext({
  Date:{now:()=>now},Number,String,JSON,
  store:{token:'local-test-only'},
  site:async()=>({announcement:{id:'test-announcement',message:'Test',age_ms:age}}),
  send:()=>{},publicState:()=>({}),
 });
 vm.runInContext(source.slice(start,end),context);
 now+=elapsed;
 await vm.runInContext('fetchAnnouncement()',context);
 return vm.runInContext('announcement',context);
}
test('announcement sent before launch is suppressed',async()=>{
 expect(await pollAnnouncement(20000,15000)).toBeNull();
});
test('announcement sent while player was open is displayed',async()=>{
 expect((await pollAnnouncement(5000,15000)).id).toBe('test-announcement');
});
test('server age cancels a constant device clock offset',async()=>{
 expect(await pollAnnouncement(20000,15000,86400000)).toBeNull();
 expect((await pollAnnouncement(5000,15000,-86400000)).id).toBe('test-announcement');
});