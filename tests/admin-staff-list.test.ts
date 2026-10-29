import { expect, test } from 'bun:test';
import { adminStaffRole, orderedAdminStaff } from '../src/lib/admin-staff-list';

test('admin staff list orders Admin, Management, Staff, then Moderators', () => {
  const rows = ['moderator', 'staff', 'management', 'admin', 'member'].map((role) => ({ username: role, display_name: null, roles: [role] }));
  expect(orderedAdminStaff(rows).map((row) => row.username)).toEqual(['admin', 'management', 'staff', 'moderator']);
});
test('multiple staff roles list a person once under their highest role', () => {
  const row = { username: 'Example', display_name: null, roles: ['moderator', 'staff', 'admin'] };
  expect(adminStaffRole(row.roles)).toBe('admin');
  expect(orderedAdminStaff([row])).toEqual([row]);
});