/** Run with bun from the project root; output is staged outside the checkout. */
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const root=__dirname,stage='/tmp/windows-player-build/app';
fs.mkdirSync(path.join(stage,'dist'),{recursive:true});fs.mkdirSync(path.join(stage,'electron'),{recursive:true});
execFileSync('lovable-assets',['get','--overwrite','--file',path.join(root,'../src/assets/player-family-intro.mp4.asset.json'),'-o',path.join(stage,'dist/player-intro.mp4')],{stdio:'inherit'});
execFileSync('bun',['build',path.join(root,'renderer/entry.jsx'),'--target=browser','--minify','--outfile='+path.join(stage,'dist/app.js')],{stdio:'inherit'});
for(const file of ['package.json','core.cjs','playback-core.cjs','account-gate.cjs','sound-boost.cjs','stream-recovery.cjs','backup-switch.cjs','progress-sync.cjs'])fs.copyFileSync(path.join(root,file),path.join(stage,file));
for(const file of ['main.cjs','preload.cjs','embedded-vlc.cjs'])fs.copyFileSync(path.join(root,'electron',file),path.join(stage,'electron',file));
fs.copyFileSync(path.join(root,'../mac-bm-player/electron/mac-engine.cjs'),path.join(stage,'electron/mac-engine.cjs'));
const vendor=path.join(stage,'vendor');fs.mkdirSync(path.join(vendor,'@koromix/koffi-win32-x64'),{recursive:true});
for(const [name,url]of [['koffi','https://registry.npmjs.org/koffi/-/koffi-3.3.6.tgz'],['@koromix/koffi-win32-x64','https://registry.npmjs.org/@koromix/koffi-win32-x64/-/koffi-win32-x64-3.3.6.tgz']]){
 const dest=path.join(vendor,name);fs.mkdirSync(dest,{recursive:true});const archive='/tmp/'+name.replaceAll('/','-')+'.tgz';
 execFileSync('curl',['-fsSL',url,'-o',archive]);execFileSync('tar',['-xzf',archive,'--strip-components=1','-C',dest]);
}
for(const [src,dest]of [['index.html','index.html'],['app.css','app.css']])fs.copyFileSync(path.join(root,'renderer',src),path.join(stage,'dist',dest));
for(const [src,dest]of [['home_background.jpg','home.jpg'],['expired_art.jpg','expired.jpg'],['bm_logo.png','logo.png'],['preview_family.jpg','preview_family.jpg']])fs.copyFileSync(path.join(root,'../tv-player/app/src/main/res/drawable-nodpi',src),path.join(stage,'dist',dest));
fs.copyFileSync(path.join(root,'../windows-tv-enabler/build.ico'),path.join(stage,'build.ico'));
console.log('Staged Windows renderer and shell. Extract checksum-verified official VLC 3.0.21 win64 to stage/tools, then package with @electron/packager 20.3.0, Electron 41.0.2, win32 x64, no-asar.');