const {test,expect}=require('bun:test');const {forScreen,PLAYBACK}=require('../safe-error.cjs');
test('hides web address',()=>expect(forScreen("Can't play this file http://dns.example.com:8080/live/u/p/1.ts")).toBe(PLAYBACK));
test('hides host and port',()=>expect(forScreen('line.example.net:25461 refused')).toBe(PLAYBACK));
test('hides IP',()=>expect(forScreen('connect 51.89.12.4 failed')).toBe(PLAYBACK));
test('hides login path',()=>expect(forScreen('/live/bob/secret/1.ts')).toBe(PLAYBACK));
test('strips IPC prefix, keeps plain text',()=>expect(forScreen("Error invoking remote method 'player:play': Error: Channel unavailable.")).toBe('Channel unavailable.'));
