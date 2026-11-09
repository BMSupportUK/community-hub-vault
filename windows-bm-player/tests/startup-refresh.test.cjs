const {test,expect}=require('bun:test');
const {createStartupRefresh}=require('../startup-refresh.cjs');
test('startup refresh waits for sign-in and PIN, then runs once',()=>{
 const startup=createStartupRefresh();let calls=0;
 const state={token:'box',user:'login',unlocked:true,pinPassed:false};
 expect(startup.run(state,()=>calls++)).toBe(false);
 state.pinPassed=true;expect(startup.run(state,()=>calls++)).toBe(true);
 expect(startup.run(state,()=>calls++)).toBe(false);expect(calls).toBe(1);
 expect(createStartupRefresh().run(state,()=>calls++)).toBe(true);expect(calls).toBe(2);
});
test('unlinked and locked devices cannot start playlist refresh',()=>{
 for(const state of [{token:'',user:'login',unlocked:true,pinPassed:true},{token:'box',user:'',unlocked:true,pinPassed:true},{token:'box',user:'login',unlocked:false,pinPassed:true}]){
  let called=false;expect(createStartupRefresh().run(state,()=>called=true)).toBe(false);expect(called).toBe(false);
 }
});