import { test, expect } from 'bun:test';
import { changedProviderFee, nextFeeOffset } from '../src/lib/provider-fee-refresh';
test('preserves sale-time fee when provider fees increase', () => { expect(changedProviderFee(125, 150)).toBeNull(); });
test('preserves sale-time fee when provider fees decrease', () => { expect(changedProviderFee(150, 100)).toBeNull(); });
test('records a confirmed zero fee for a sale missing its fee', () => { expect(changedProviderFee(null, 0)).toBe(0); });
test('new sales capture changed actual charges independently of old sales', () => { expect(changedProviderFee(null, 150)).toBe(150); expect(changedProviderFee(125, 150)).toBeNull(); });
test('preserves recorded fees when unavailable', () => { expect(changedProviderFee(150, null)).toBeNull(); });
test('avoids unchanged writes', () => { expect(changedProviderFee(150, 150)).toBeNull(); });
test('checks older payments and cycles back', () => { expect(nextFeeOffset(25, 25)).toBe(50); expect(nextFeeOffset(50, 3)).toBe(0); });
