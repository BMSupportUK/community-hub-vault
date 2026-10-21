import { expect, test } from 'bun:test';
import { canSeeUserEmail } from '../src/lib/user-email-access';

test('owner and management may see a customer email address', () => {
  expect(canSeeUserEmail(['admin'])).toBe(true);
  expect(canSeeUserEmail(['management'])).toBe(true);
});
test('staff, moderators and customers never see an email address', () => {
  for (const role of ['staff', 'moderator', 'subscriber', 'nonsubscriber', 'member', 'pending']) {
    expect(canSeeUserEmail([role])).toBe(false);
  }
});
test('Fan Zone roles never see an email address', () => {
  expect(canSeeUserEmail(['boro_fan_zone_member'])).toBe(false);
  expect(canSeeUserEmail(['boro_fan_zone_moderator'])).toBe(false);
});
test('a customer with no roles at all cannot see an email address', () => {
  expect(canSeeUserEmail([])).toBe(false);
});
