// Bounded, user-requested tests to Cloudflare; never infer capacity from video traffic.
const SIZES=[1000000,5000000,20000000,50000000];
function kbps(bytes,ms){if(bytes<=0||ms<=0)throw new Error('Invalid speed sample');return Math.round(bytes*8/ms);}
function median(values){if(!values.length)throw new Error('No valid samples');const a=[...values].sort((a,b)=>a-b);const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;}
async function measure(direction,request){let samples=[];for(const bytes of SIZES){samples=[];for(let i=0;i<3;i++){const r=await request(direction,bytes);if(r.bytes!==bytes)throw new Error('Incomplete speed test');samples.push(kbps(r.bytes,r.ms));}if(bytes===SIZES[SIZES.length-1]||median(samples.map(v=>bytes*8/v))>=1000)break;}return Math.round(median(samples));}
async function run({fetchFn=fetch,now=()=>performance.now(),signal}={}){
 const request=async(direction,bytes)=>{const t=now();const r=await fetchFn('https://speed.cloudflare.com/'+(direction==='upload'?'__up':'__down?bytes='+bytes+'&r='+Date.now()+Math.random()),{method:direction==='upload'?'POST':'GET',...(direction==='upload'?{body:new Uint8Array(bytes),headers:{'Content-Type':'application/octet-stream'}}:{}),cache:'no-store',signal:signal||AbortSignal.timeout(20000)});if(!r.ok)throw new Error('Speed test service unavailable');const data=await r.arrayBuffer();return{bytes:direction==='upload'?bytes:data.byteLength,ms:now()-t};};
 await request('download',0);const latency=[];for(let i=0;i<5;i++)latency.push((await request('download',0)).ms);
 const down=await measure('download',request),up=await measure('upload',request);
 return{down,up,ping:Math.round(median(latency)),measured_at:Date.now(),method:'cloudflare-adaptive-v1'};
}
module.exports={run,measure,kbps,median};