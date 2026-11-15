import { expect, test } from 'bun:test';
import { connectionSession, connectionDayRange, CONNECTION_HISTORY_PAGE_SIZE } from '../src/lib/player-connection-session';
const device = { id: 'box', user_id: 'owner', iptv_username: 'login' };
const presence = { watching_title: 'TNT FHD', watching_kind: 'live', watching_since: '2026-11-15T14:04:00Z', watching_preview: false };
test('each new full-screen start is recorded even before speed and ping arrive', () => {
  expect(connectionSession(device, presence, {})).toEqual({ _device: 'box', _user: 'owner', _title: 'TNT FHD', _kind: 'live', _started: '2026-11-15T14:04:00Z', _login: 'login', _ping: null, _speed: 0 });
  expect(connectionSession(device, { ...presence, watching_since: '2026-11-15T14:05:00Z' }, {})?._started).toBe('2026-11-15T14:05:00Z');
});
test('preview and stopped playback are not full-screen connections', () => {
  expect(connectionSession(device, { ...presence, watching_preview: true }, { ping_ms: 24 })).toBeNull();
  expect(connectionSession(device, { ...presence, watching_title: null, watching_since: null }, {})).toBeNull();
});
test('readings belong to the current reported channel', () => {
  expect(connectionSession(device, { ...presence, watching_title: 'DAZN' }, { ping_ms: 24, speed_kbps: 8200 })?._title).toBe('DAZN');
});
test('Details shows the most recent five per page', () => { expect(CONNECTION_HISTORY_PAGE_SIZE).toBe(5); });
test('Details day ranges follow UK DST rather than UTC dates', () => {
  expect(connectionDayRange('2026-03-29')).toEqual({ from: '2026-03-29T00:00:00.000Z', to: '2026-03-29T23:00:00.000Z' });
  expect(connectionDayRange('2026-10-25')).toEqual({ from: '2026-10-24T23:00:00.000Z', to: '2026-10-26T00:00:00.000Z' });
});