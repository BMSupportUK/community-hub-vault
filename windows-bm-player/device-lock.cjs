// A revoked installation cannot register again or keep any account-local data.
function wipeStore(store){for(const key of Object.keys(store))delete store[key];store.unlinked=true;return store;}
function requireActive(store){if(store.unlinked===true)throw new Error('This device has been unlinked');}
// Relinking is an explicit user choice: clear the lock (data is already wiped) so a brand-new device token and code are issued.
function relink(store){for(const key of Object.keys(store))delete store[key];return store;}
function revokedResponse(status,data){return status===401&&data?.error==='Unknown device';}
module.exports={wipeStore,requireActive,revokedResponse,relink};