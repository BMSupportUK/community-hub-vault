import { expect, test } from 'bun:test';
import { playbackReliability } from '../src/lib/player-customer-stats';
const now = Date.parse('2026-11-15T13:00:00Z');
const device = { id: 'box', watching_title: 'TNT', watching_preview: false, watching_since: new Date(now - 300000).toISOString(), last_seen_at: new Date(now).toISOString() };
const event = (stall_ms: number, reconnected = false) => ({ device_id: 'box', content_name: 'TNT', stall_ms, reconnected, occurred_at: new Date(now - 10000).toISOString() });
test('no reported interruptions gives stable playback regardless of channel bitrate', () => expect(playbackReliability(device, [], now).bars).toBe(4));
test('short interruptions, 3 percent stalled and 10 percent stalled give distinct bands', () => {
 expect(playbackReliability(device, [event(1000)], now).bars).toBe(3);
 expect(playbackReliability(device, [event(9000)], now).bars).toBe(2);
 expect(playbackReliability(device, [event(30000)], now).bars).toBe(1);
});
test('two and three reported reconnects reduce reliability', () => {
 expect(playbackReliability(device, [event(0,true),event(0,true)], now).bars).toBe(2);
 expect(playbackReliability(device, [event(0,true),event(0,true),event(0,true)], now).bars).toBe(1);
});
test('other devices, channels and previous sessions do not affect current rating', () => {
 const events = [{...event(300000),device_id:'other'}, {...event(300000),content_name:'Other'}, {...event(300000),occurred_at:new Date(now-300001).toISOString()}];
 expect(playbackReliability(device, events, now).bars).toBe(4);
});
test('offline, preview, newly started or unavailable reports never look healthy', () => {
 for (const d of [{...device,last_seen_at:new Date(now-180001).toISOString()}, {...device,watching_preview:true}, {...device,watching_since:new Date(now-59999).toISOString()}]) expect(playbackReliability(d, [], now).bars).toBe(0);
 expect(playbackReliability(device, null, now).bars).toBe(0);
});