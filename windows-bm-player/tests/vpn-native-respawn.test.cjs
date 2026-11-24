const {test,expect}=require('bun:test');
const {EventEmitter}=require('node:events');
const {createNative}=require('../vpn-native.cjs');
test('a stopped connection helper is started again on the next playlist read',async()=>{
 let launches=0;const procs=[];
 const launch=()=>{launches++;const p=new EventEmitter();p.stdout=new EventEmitter();p.stdin={writable:true,write:line=>{const m=JSON.parse(line);setTimeout(()=>p.stdout.emit('data',JSON.stringify({id:m.id,ok:true,base:'http://127.0.0.1:5'+launches})+'\n'),0);},end(){}};p.kill=()=>{};procs.push(p);return p;};
 const n=createNative({binary:__filename,launch});
 expect(await n.init()).toBe('http://127.0.0.1:51');
 procs[0].stdin.writable=false;procs[0].emit('exit');
 expect(await n.init()).toBe('http://127.0.0.1:52');
 expect(launches).toBe(2);
});
