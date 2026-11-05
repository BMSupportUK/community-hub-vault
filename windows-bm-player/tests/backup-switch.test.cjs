const {test,expect}=require('bun:test');
const {BackupSwitch}=require('../backup-switch.cjs');
const {backupArgs,parseDuration}=require('../../mac-bm-player/electron/mac-engine.cjs');

function fake(name,log){return{play:(i,u)=>log.push(name+':play:'+i+':'+u),playBackup:(i,u,o)=>log.push(name+':backup:'+i+':'+u+':'+(o.resume||0)),stop:i=>log.push(name+':stop:'+i),status:()=>({name}),backupReady:()=>true,pause(){},seek(){},volume(){}};}

test('Windows: main player plays first, then the backup takes over and stays',()=>{
 const log=[],s=new BackupSwitch(fake('vlc',log),fake('bk',log));
 s.play(0,'a');expect(s.usingBackup(0)).toBe(false);
 expect(s.useBackup(0,'a',{resume:90})).toBe(true);
 expect(log).toEqual(['vlc:play:0:a','vlc:stop:0','bk:backup:0:a:90']);
 s.play(0,'b');expect(log.at(-1)).toBe('bk:backup:0:b:0');
 expect(s.useBackup(0,'b')).toBe(false);
 s.stop(0);expect(s.usingBackup(0)).toBe(false);
});
test('Windows without a working libVLC goes straight to the backup',()=>{
 const log=[],s=new BackupSwitch(null,fake('bk',log));s.play(1,'x');expect(log).toEqual(['bk:backup:1:x:0']);
});
test('no backup when the converter is missing',()=>{
 const b=fake('bk',[]);b.backupReady=()=>false;expect(new BackupSwitch(fake('vlc',[]),b).useBackup(0,'a')).toBe(false);
});
test('backup converts to H.264/AAC and starts films at their place',()=>{
 const a=backupArgs('http://x/movie/1.mkv',{ss:125.7});
 expect(a.slice(a.indexOf('-ss'),a.indexOf('-ss')+2)).toEqual(['-ss','125']);
 expect(a).toContain('libx264');expect(a).toContain('aac');expect(a.at(-1)).toBe('pipe:1');
 expect(backupArgs('http://x/live/1.ts')).not.toContain('-ss');
 expect(parseDuration('  Duration: 01:02:03.50, start')).toBe(3723.5);
});

test('films and episodes ask both players to fill the screen', () => {
  const { BackupSwitch } = require('../backup-switch.cjs');
  const seen = [];
  const p = { play: (i, u, o) => seen.push(['main', o.fill]), stop() {} };
  const b = { playBackup: (i, u, o) => seen.push(['backup', o.fill]), stop() {}, backupReady: () => true };
  const s = new BackupSwitch(p, b);
  s.setFill(0, true); s.play(0, 'x'); s.useBackup(0, 'x');
  s.stop(0); s.play(0, 'x');
  expect(seen).toEqual([['main', true], ['backup', true], ['main', false]]);
});
