// @ts-nocheck — bun:test is only used by the test runner.
import { expect, test } from 'bun:test';
import { providerGuideFallback, retiredCategoryRefresh } from './provider-epg-policy';
test('channel guide tells existing apps to use their own provider, never website listings', () => {
  expect(providerGuideFallback()).toEqual({ epg_listings: null, source: 'none' });
});
test('category entry can never queue a country update', () => {
  expect(retiredCategoryRefresh()).toEqual({ queued: 0, disabled: true });
});