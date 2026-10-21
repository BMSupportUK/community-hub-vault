import { test, expect } from 'bun:test';
import { portalSessionExpired, portalAccessValid, isPortalPath, canResetPortal, canCopyPortal, PORTAL_LINK_HOURS, portalLoginCodeSchema, portalSecondsRemaining, portalCountdown } from '../src/lib/customer-portal';
import { readFileSync } from 'node:fs';
const sql = readFileSync(new URL('../drizzle/migrations/0185_customer_portal.sql', import.meta.url), 'utf8');
test('login codes last 24 hours', () => {
  expect(PORTAL_LINK_HOURS).toBe(24);
  expect(sql).toContain("now() + interval '24 hours'");
  const issued = Date.parse('2026-10-21T10:00:00Z');
  const expires = new Date(issued + 24 * 3600_000).toISOString();
  expect(portalSessionExpired(expires, issued + 23 * 3600_000)).toBe(false);
  expect(portalSessionExpired(expires, issued + 24 * 3600_000)).toBe(true);
});
test('email login requires an eight-digit code, never a bearer link', () => {
  expect(portalLoginCodeSchema.safeParse('12345678').success).toBe(true);
  expect(portalLoginCodeSchema.safeParse('1234567').success).toBe(false);
  expect(portalLoginCodeSchema.safeParse('https://bmsupport.uk/portal/a?t=b').success).toBe(false);
});
test('access countdown ticks each second and stops at zero', () => {
  const start = Date.parse('2026-10-21T10:00:00Z');
  const expiry = '2026-10-21T11:00:00Z';
  expect(portalCountdown(portalSecondsRemaining(expiry, start))).toBe('01:00:00');
  expect(portalCountdown(portalSecondsRemaining(expiry, start + 1000))).toBe('00:59:59');
  expect(portalSecondsRemaining(expiry, start + 3600_000)).toBe(0);
  expect(portalSecondsRemaining(null, start)).toBe(0);
});
test('only admin and management can reset; staff can copy', () => {
  expect(canResetPortal(['staff'])).toBe(false);
  expect(canResetPortal(['management'])).toBe(true);
  expect(canCopyPortal(['staff'])).toBe(true);
  expect(canCopyPortal(['user'])).toBe(false);
});
test('portal locks one hour after opening, never past the 24-hour link', async () => {
  const { portalLockAt } = await import('../src/lib/customer-portal');
  const now = Date.parse('2026-10-21T10:00:00Z');
  expect(portalLockAt('2026-10-22T09:00:00Z', now)).toBe('2026-10-21T11:00:00.000Z');
  expect(portalLockAt('2026-10-21T10:20:00Z', now)).toBe('2026-10-21T10:20:00.000Z');
});
test('portal address changes every 24 hours', () => {
  const m = readFileSync(new URL('../drizzle/migrations/0187_customer_portal_daily_code_reusable_links.sql', import.meta.url), 'utf8');
  expect(m).toContain("code_set_at <= now() - interval '24 hours'");
});
test('first entry and malformed expiry stay locked', () => {
  expect(portalAccessValid(null, 'customer-a', 'customer-a')).toBe(false);
  expect(portalAccessValid('invalid', 'customer-a', 'customer-a')).toBe(false);
});
test('an unlock belongs only to the customer who opened the link', () => {
  const now = Date.parse('2026-10-21T10:00:00Z');
  expect(portalAccessValid('2026-10-21T11:00:00Z', 'customer-a', 'customer-b', now)).toBe(false);
  expect(portalAccessValid('2026-10-21T11:00:00Z', 'customer-a', 'customer-a', now)).toBe(true);
  expect(portalAccessValid('2026-10-21T11:00:00Z', 'customer-a', 'customer-a', now + 3600_000)).toBe(false);
});
test('every customer portal destination is guarded, including direct ticket links', () => {
  for (const path of ['/portal', '/portal/logins', '/shop', '/tickets', '/tickets/123', '/install-guides']) expect(isPortalPath(path)).toBe(true);
  expect(isPortalPath('/home')).toBe(false);
  expect(isPortalPath('/admin-customers')).toBe(false);
});
