import { test, expect } from 'bun:test';
import { changedProviderFee, nextFeeOffset } from '../src/lib/provider-fee-refresh';
test('updates known fees when the provider increases them', () => { expect(changedProviderFee(125, 150)).toBe(150); });
test('updates known fees when the provider reduces them', () => { expect(changedProviderFee(150, 100)).toBe(100); });
test('accepts confirmed zero fees', () => { expect(changedProviderFee(150, 0)).toBe(0); });
test('preserves recorded fees when unavailable', () => { expect(changedProviderFee(150, null)).toBeNull(); });
test('avoids unchanged writes', () => { expect(changedProviderFee(150, 150)).toBeNull(); });
test('checks older payments and cycles back', () => { expect(nextFeeOffset(25, 25)).toBe(50); expect(nextFeeOffset(50, 3)).toBe(0); });
