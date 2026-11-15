import { expect, test } from 'bun:test';
import { connectionStrength, connectionDiagnosis } from '../src/lib/player-customer-stats';
test('stream throughput never establishes broadband strength', () => {
 for (const rate of [2400, 8300, 10000, 25000, 500000]) {
  expect(connectionStrength(rate).level).toBe('none');
  expect(connectionStrength(rate).bars).toBe(0);
 }
});
test('stream bitrate does not establish broadband strength', () => expect(connectionStrength(12000, 4000).level).toBe('none'));
test('no speed reading', () => expect(connectionStrength(null).label).toBe('No reading'));
test('low stream throughput with buffering never blames broadband', () => expect(connectionDiagnosis(connectionStrength(3000), 2)).toBeNull());
test('high throughput with buffering cannot diagnose the provider', () => expect(connectionDiagnosis(connectionStrength(30000), 2)).toBeNull());
test('no buffering gives no diagnosis', () => expect(connectionDiagnosis(connectionStrength(3000), 0)).toBeNull());
