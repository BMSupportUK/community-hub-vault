const {test,expect}=require('bun:test');const core=require('../core.cjs');
test('still-watching question closes the app 2 minutes after it opens',()=>{const p=1_000_000;expect(core.inactive(0,p,p+119_000)).toBe('prompt');expect(core.inactive(0,p,p+120_000)).toBe('exit');});
