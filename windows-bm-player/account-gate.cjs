// Per-process only: never persist a successful unlock or the entered number.
function createAccountGate(){
 let unlocked=false,qr='';
 return {
  get unlocked(){return unlocked;},
  // QR (svg) the website sends to boxes without a website account: scan it and type the account number.
  get qr(){return unlocked?'':qr;},
  lock(){unlocked=false;},
  require(){if(!unlocked)throw new Error('Enter your 6-digit account number first.');},
  // Website subscription-box send: the server already checked ownership.
  async remote(verify,onQr){if(unlocked)return false;const r=await verify({action:'unlock_status'});const next=typeof r?.qr_svg==='string'&&r.qr_svg.startsWith('<svg')&&String(r.qr_url||'').startsWith('https://bmsupport.uk/')?r.qr_svg:'';if(next!==qr){qr=next;onQr?.();}if(r?.unlocked===true){unlocked=true;return true;}return false;},
  async unlock(number,verify){
   if(typeof number!=='string'||!/^\d{6}$/.test(number))throw new Error('Enter your 6-digit account number.');
   const result=await verify({action:'unlock',account_number:number});
   if(result?.ok!==true)throw new Error('Could not verify your account number. Try again.');
   unlocked=true;return true;
  }
 };
}
module.exports={createAccountGate};