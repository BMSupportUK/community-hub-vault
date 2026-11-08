// @ts-nocheck — bun:test is used only by the test runner.
import { describe, expect, test } from 'bun:test';
import { boxIsOn, requestIsFresh } from './send-to-box';

const now = Date.parse('2026-11-08T20:30:00Z');
describe('send to box', () => {
  test('box checked in within 3 minutes is on', () => {
    expect(boxIsOn('2026-11-08T20:27:30Z', now)).toBe(true);
  });
  test('box silent for over 3 minutes is not on', () => {
    expect(boxIsOn('2026-11-08T20:26:59Z', now)).toBe(false);
    expect(boxIsOn(null, now)).toBe(false);
  });
  test('request older than 2 minutes is dropped', () => {
    expect(requestIsFresh('2026-11-08T20:28:30Z', now)).toBe(true);
    expect(requestIsFresh('2026-11-08T20:27:59Z', now)).toBe(false);
  });
});
