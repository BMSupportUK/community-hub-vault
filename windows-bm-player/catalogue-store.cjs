// Saved Live TV / Films / Series lists on the computer, so the app opens with them at once (like the box) while startup still refreshes.
const crypto=require('crypto');
function keyFor(dns,user){return dns&&user?crypto.createHash('sha256').update(String(dns)+'\n'+String(user)).digest('hex'):'';}
function load(fs,file,key,decrypt){if(!key)return null;try{if(!fs.existsSync(file))return null;const d=JSON.parse(decrypt(fs.readFileSync(file)));return d&&d.key===key&&d.kinds?d.kinds:null;}catch{return null;}}
function save(fs,file,key,kinds,encrypt){if(!key)return;try{fs.writeFileSync(file,encrypt(JSON.stringify({key,kinds})));}catch{}}
function drop(fs,file){try{fs.rmSync(file,{force:true});}catch{}}
module.exports={keyFor,load,save,drop};
