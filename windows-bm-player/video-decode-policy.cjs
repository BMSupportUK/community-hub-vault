'use strict';
// Hardware auto lets capable GPUs handle demanding live pictures. Keep the
// existing software workaround for damaged MonoMax feeds and recordings.
function decodeOptions({kind='',name=''}={}){
 const damaged=String(name).toLowerCase().replace(/[^a-z0-9]/g,'').includes('monomax');
 const demanding=/\b(?:fhd|uhd|4k|8k|1080p?|2160p?|(?:50|60)\s*fps)\b/i.test(String(name));
 return [':avcodec-hw='+(kind==='live'&&demanding&&!damaged?'any':'none')];
}
module.exports={decodeOptions};