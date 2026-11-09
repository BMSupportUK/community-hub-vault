const {test,expect}=require('bun:test');
const {channelLabel,eventProgramme}=require('../event-channel.cjs');
test('numbered event keeps its feed number rather than list position',()=>expect(channelLabel('08 | 09:30 FIA WEC ',2)).toBe('08'));
test('ordinary channel keeps its existing label',()=>expect(channelLabel('Sky Sports F1',2)).toBe('3  Sky Sports F1'));
test('leading time becomes today’s event start, not part of its title',()=>{const p=eventProgramme('08 | 09:30 FIA WEC ',Date.parse('2026-11-09T08:00:00Z'));expect(p.title).toBe('FIA WEC');expect(p.start).toBe(Date.parse('2026-11-09T09:30:00Z'));});
test('trailing time preserves title numbers',()=>{const p=eventProgramme('18 | OKTAGON 97: Severino vs. Holzer 17:00',Date.parse('2026-11-09T08:00:00Z'));expect(p.title).toBe('OKTAGON 97: Severino vs. Holzer');expect(p.start).toBe(Date.parse('2026-11-09T17:00:00Z'));});
test('UK summer start converts to UTC',()=>expect(eventProgramme('01 | 12:00 Trackside Live!',Date.parse('2026-07-01T08:00:00Z')).start).toBe(Date.parse('2026-07-01T11:00:00Z')));
test('empty or untimed channels never invent programme times',()=>{expect(eventProgramme('21 | ')).toBeNull();expect(eventProgramme('07 | Live Cycling')).toBeNull();});