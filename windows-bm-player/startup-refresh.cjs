/** One startup refresh per linked login, only after the account and PIN gates. */
function createStartupRefresh(){
 let started='';
 return {
  run({token,user,unlocked,pinPassed},refresh){
   if(!token||!user||!unlocked||!pinPassed)return false;
   const identity=JSON.stringify([token,user]);
   if(identity===started)return false;
   started=identity;refresh();return true;
  }
 };
}
module.exports={createStartupRefresh};