const {test,expect}=require('bun:test');
const {measure,run,kbps,median}=require('../network-test.cjs');
test('actual transferred bytes and elapsed time produce Mbps, not traffic counters',()=>{expect(kbps(12500000,1000)).toBe(100000);expect(median([20,1,10])).toBe(10);});
test('fast small samples grow to sustained transfers and use repeated median',async()=>{
 const seen=[];const rate=await measure('download',async(_,bytes)=>{seen.push(bytes);return{bytes,ms:bytes/12500};});
 expect(rate).toBe(100000);expect(seen).toEqual([1000000,1000000,1000000,5000000,5000000,5000000,20000000,20000000,20000000]);
});
test('HTTP error pages and incomplete downloads fail instead of reporting speed',async()=>{
 await expect(run({fetchFn:async()=>({ok:false})})).rejects.toThrow('unavailable');
 await expect(measure('download',async()=>({bytes:20,ms:100}))).rejects.toThrow('Incomplete');
});
test('complete broadband test returns measured speeds and warmed median latency',async()=>{
 let clock=0;
 const result=await run({now:()=>clock,fetchFn:async(url,options)=>{
   const bytes=options.method==='POST'?options.body.byteLength:Number(new URL(url).searchParams.get('bytes'));
   clock+=bytes?bytes/12500:20;
   return{ok:true,arrayBuffer:async()=>new ArrayBuffer(options.method==='POST'?0:bytes)};
 }});
 expect(result.down).toBe(100000);expect(result.up).toBe(100000);expect(result.ping).toBe(20);
 expect(result.method).toBe('cloudflare-adaptive-v1');expect(result.measured_at).toBeGreaterThan(0);
});