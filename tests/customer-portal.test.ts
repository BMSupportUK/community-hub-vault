import { test, expect } from 'bun:test';
import { portalSessionExpired, canResetPortal, canCopyPortal, PORTAL_LINK_HOURS } from '../src/lib/customer-portal';
import { readFileSync } from 'node:fs';
const sql = readFileSync(new URL('../drizzle/migrations/0185_customer_portal.sql', import.meta.url), 'utf8');
test('login links last 24 hours', () => {
  expect(PORTAL_LINK_HOURS).toBe(24);
  expect(sql).toContain("now() + interval '24 hours'");
  const issued = Date.parse('2026-10-21T10:00:00Z');
  const expires = new Date(issued + 24 * 3600_000).toISOString();
  expect(portalSessionExpired(expires, issued + 23 * 3600_000)).toBe(false);
  expect(portalSessionExpired(expires, issued + 24 * 3600_000)).toBe(true);
});
test('only admin and management can reset; staff can copy', () => {
  expect(canResetPortal(['staff'])).toBe(false);
  expect(canResetPortal(['management'])).toBe(true);
  expect(canCopyPortal(['staff'])).toBe(true);
  expect(canCopyPortal(['user'])).toBe(false);
});
