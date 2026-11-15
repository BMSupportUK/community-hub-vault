import { expect, test } from 'bun:test';
import { customerStatsDays, customerStatsSegments, latestConnectionReading } from '../src/lib/player-customer-stats';

test('customer stats contain exactly seven UK calendar days including today', () => {
 expect(customerStatsDays(Date.parse('2026-11-14T19:20:00Z'))).toEqual(['2026-11-14','2026-11-13','2026-11-12','2026-11-11','2026-11-10','2026-11-09','2026-11-08']);
});
test('UK day tabs include the UK date when it differs from UTC and survive clock changes', () => {
 expect(customerStatsDays(Date.parse('2026-07-14T23:30:00Z'))[0]).toBe('2026-07-15');
 expect(customerStatsDays(Date.parse('2026-10-26T00:10:00Z'))).toEqual(['2026-10-26','2026-10-25','2026-10-24','2026-10-23','2026-10-22','2026-10-21','2026-10-20']);
});
test('daily chart percentages use the watched channel totals across devices', () => {
 const rows = customerStatsSegments([{ title:'E4',kind:'live',seconds:120 },{ title:'E4',kind:'live',seconds:60 },{ title:'BBC One',kind:'live',seconds:60 }]);
 expect(rows).toEqual([{title:'E4',kind:'live',seconds:180,percent:75},{title:'BBC One',kind:'live',seconds:60,percent:25}]);
 expect(customerStatsSegments([])).toEqual([]);
});
const now = Date.parse('2026-11-15T12:50:00Z');
const reading = { speed_latest_kbps: 8300, speed_latest_at: '2026-11-15T12:49:50Z', title: 'Sky Sports News', device_id: 'box', login: 'login' };
const device = { id: 'box', watching_title: 'Sky Sports News', watching_preview: false, last_seen_at: '2026-11-15T12:49:50Z', iptv_username: 'login' };
test('live connection takes the latest report rather than a daily average', () => {
 const daily = { ...reading, speed_kbps_sum: 100000, speed_samples: 2 };
 expect(latestConnectionReading(daily, device, now)).toBe(8300);
 expect(latestConnectionReading({ ...reading, speed_latest_kbps: 2400 }, device, now)).toBe(2400);
});
test('stale reports and offline devices are never shown as live', () => {
 expect(latestConnectionReading({ ...reading, speed_latest_at: '2026-11-15T12:46:59Z' }, device, now)).toBeNull();
 expect(latestConnectionReading(reading, { ...device, last_seen_at: '2026-11-15T12:46:59Z' }, now)).toBeNull();
});
test('previews, different channels and different logins cannot reuse a live reading', () => {
 expect(latestConnectionReading(reading, { ...device, watching_preview: true }, now)).toBeNull();
 expect(latestConnectionReading(reading, { ...device, watching_title: 'TNT Sport' }, now)).toBeNull();
 expect(latestConnectionReading(reading, { ...device, iptv_username: 'other' }, now)).toBeNull();
});