const {test,expect}=require('bun:test');
const {wipeStore,requireActive,revokedResponse,relink}=require('../device-lock.cjs');
test('unlink wipes favourites, history, saved orders, login and progress',()=>{
 const store={token:'device',dns:'private-provider',user:'viewer',pass:'password',favourites:[{id:'1'}],recent:[{id:'2'}],orders:[{id:'3'}],progress:{film:30},settings:{category_order_film:['1']},reminders:[{id:'4'}]};
 wipeStore(store);
 expect(store).toEqual({unlinked:true});
});
test('unlink stays locked after a restart and blocks registration',()=>{
 const reopened=JSON.parse(JSON.stringify(wipeStore({token:'device'})));
 expect(()=>requireActive(reopened)).toThrow('This device has been unlinked');
 expect(()=>requireActive({})).not.toThrow();
});
test('late account writes cannot survive another locked save',()=>{
 const store=wipeStore({});Object.assign(store,{favourites:[{id:'late'}],orders:[{id:'late'}],user:'late-login'});
 wipeStore(store);expect(store).toEqual({unlinked:true});
});
test('only a revoked device locks, never a wrong code or temporary failure',()=>{
 expect(revokedResponse(401,{error:'Unknown device'})).toBe(true);
 expect(revokedResponse(401,{error:"That account number isn't right."})).toBe(false);
 expect(revokedResponse(401,{error:"That code isn't right."})).toBe(false);
 expect(revokedResponse(500,{error:'Unknown device'})).toBe(false);
});test('Link this device again clears the lock and old token so a new code is issued',()=>{
 const store=wipeStore({token:'old-device',user:'viewer'});
 relink(store);
 expect(store).toEqual({});
 expect(()=>requireActive(store)).not.toThrow();
});
