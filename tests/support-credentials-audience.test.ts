import { expect, test } from 'bun:test';
import { hasSupportAccountRoles } from '../src/lib/fan-zone-nav';

test('Boro Fan Zone members and moderators without BM Support access are excluded from credentials', () => {
  expect(hasSupportAccountRoles(['boro_fan_zone_member'])).toBe(false);
  expect(hasSupportAccountRoles(['boro_fan_zone_moderator'])).toBe(false);
  expect(hasSupportAccountRoles(['boro_fan_zone_member', 'boro_fan_zone_moderator'])).toBe(false);
});
test('BM Support customers and staff remain eligible', () => {
  for (const role of ['admin', 'management', 'staff', 'moderator', 'subscriber', 'nonsubscriber', 'member']) {
    expect(hasSupportAccountRoles([role])).toBe(true);
  }
});
test('dual BM Support and Fan Zone accounts remain BM Support accounts', () => {
  expect(hasSupportAccountRoles(['subscriber', 'boro_fan_zone_member'])).toBe(true);
});
test('missing roles and pending-only accounts cannot appear as BM Support accounts', () => {
  expect(hasSupportAccountRoles([])).toBe(false);
  expect(hasSupportAccountRoles(['pending'])).toBe(false);
});