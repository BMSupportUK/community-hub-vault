const {test,expect}=require('bun:test');
const {createAccountGate}=require('../account-gate.cjs');
test('every new app process requires the account number again',async()=>{
 const first=createAccountGate();expect(()=>first.require()).toThrow();
 await first.unlock('582649',async()=>({ok:true}));expect(()=>first.require()).not.toThrow();
 expect(()=>createAccountGate().require()).toThrow();
});
test('wrong account number keeps the player locked and retry succeeds',async()=>{
 const gate=createAccountGate();await expect(gate.unlock('582649',async()=>{throw new Error('Wrong number');})).rejects.toThrow();
 expect(gate.unlocked).toBe(false);
 await gate.unlock('582649',async body=>{expect(body).toEqual({action:'unlock',account_number:'582649'});return{ok:true};});
 expect(gate.unlocked).toBe(true);gate.lock();expect(()=>gate.require()).toThrow();
});
test('only exactly six digits and confirmed success unlock',async()=>{
 const gate=createAccountGate();let called=false;
 await expect(gate.unlock('12345',async()=>{called=true;return{ok:true};})).rejects.toThrow();expect(called).toBe(false);
 await expect(gate.unlock('582649',async()=>({}))).rejects.toThrow();expect(gate.unlocked).toBe(false);
});