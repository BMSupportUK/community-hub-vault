// @ts-nocheck — bun:test is only used by the test runner.
import { expect, test } from 'bun:test';
import { countryEpgEnabled, providerGuideFallback, retiredCategoryRefresh } from './provider-epg-policy';
test('country imports are disabled before any database or download work', () => {
  expect(countryEpgEnabled()).toBe(false);
});
test('unmatched channel guide tells existing apps to use their own provider', () => {
  expect(providerGuideFallback()).toEqual({ epg_listings: null, source: 'none' });
});
test('category entry can never queue a country update', () => {
  expect(retiredCategoryRefresh()).toEqual({ queued: 0, disabled: true });
});