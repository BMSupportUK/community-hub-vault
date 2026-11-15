const {test,expect}=require('bun:test');const ab=require('../auto-backup.cjs');const assert={equal:(a,b)=>expect(a).toBe(b)};
test('three reconnects inside two minutes switch to backup',()=>{const t=[];assert.equal(ab.wantsBackup(t,0),false);assert.equal(ab.wantsBackup(t,30000),false);assert.equal(ab.wantsBackup(t,60000),true);});
test('spread out reconnects do not switch',()=>{const t=[];ab.wantsBackup(t,0);ab.wantsBackup(t,100000);assert.equal(ab.wantsBackup(t,230000),false);});
test('picks first working backup, never a Not working one',()=>{assert.equal(ab.pick([{id:1,down:true},{id:2}]).id,2);assert.equal(ab.pick([{id:1,down:true}]),null);});
test('returns to the original after ten minutes',()=>{assert.equal(ab.RETURN_MS,600000);});
