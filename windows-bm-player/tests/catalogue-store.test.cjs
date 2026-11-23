const {test,expect}=require('bun:test');const assert={equal:(a,b)=>expect(a).toBe(b)};const fs=require('fs');const os=require('os');const path=require('path');
const cs=require('../catalogue-store.cjs');const enc=s=>Buffer.from(s),dec=b=>b.toString();
test('saved lists come back only for the same login and are removed on drop',()=>{const f=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'cs')),'c.bin');const k=cs.keyFor('dns','u1');
 cs.save(fs,f,k,{live:{categories:[],items:[{id:'1'}]}},enc);
 assert.equal(cs.load(fs,f,k,dec).live.items[0].id,'1');
 assert.equal(cs.load(fs,f,cs.keyFor('dns','u2'),dec),null);
 cs.drop(fs,f);assert.equal(cs.load(fs,f,k,dec),null);});
