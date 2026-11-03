// Per-process only: never persist a successful unlock or the entered number.
function createAccountGate(){
 let unlocked=false;
 return {
  get unlocked(){return unlocked;},
  lock(){unlocked=false;},
  require(){if(!unlocked)throw new Error('Enter your 6-digit account number first.');},
  async unlock(number,verify){
   if(typeof number!=='string'||!/^\d{6}$/.test(number))throw new Error('Enter your 6-digit account number.');
   const result=await verify({action:'unlock',account_number:number});
   if(result?.ok!==true)throw new Error('Could not verify your account number. Try again.');
   unlocked=true;return true;
  }
 };
}
module.exports={createAccountGate};