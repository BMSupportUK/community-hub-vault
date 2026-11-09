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
test('approval QR shows only for bmsupport.uk links and clears once unlocked',async()=>{
 const gate=createAccountGate();let changes=0;
 await gate.remote(async()=>({unlocked:false,qr_url:'https://evil.example/x',qr_svg:'<svg/>'}),()=>changes++);expect(gate.qr).toBe('');
 await gate.remote(async()=>({unlocked:false,qr_url:'https://bmsupport.uk/player-approve/ab',qr_svg:'<svg/>'}),()=>changes++);expect(gate.qr).toBe('<svg/>');expect(changes).toBe(1);
 await gate.remote(async()=>({unlocked:true}),()=>changes++);expect(gate.unlocked).toBe(true);expect(gate.qr).toBe('');
});

test('a remembered approval reopens without asking again',()=>{
 const gate=createAccountGate();gate.restore();expect(gate.unlocked).toBe(true);expect(()=>gate.require()).not.toThrow();
 gate.lock();expect(gate.unlocked).toBe(false);
});
