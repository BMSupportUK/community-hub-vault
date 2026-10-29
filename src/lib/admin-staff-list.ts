export const ADMIN_STAFF_GROUPS = [
  { role: 'admin', label: 'Admin' },
  { role: 'management', label: 'Management' },
  { role: 'staff', label: 'Staff' },
  { role: 'moderator', label: 'Moderators' },
] as const;

export function adminStaffRole(roles: string[]) {
  return ADMIN_STAFF_GROUPS.find((group) => roles.includes(group.role))?.role;
}

export function orderedAdminStaff<T extends { roles: string[]; username: string | null; display_name: string | null }>(rows: T[]) {
  return rows.filter((row) => adminStaffRole(row.roles)).sort((a, b) => {
    const rank = (row: T) => ADMIN_STAFF_GROUPS.findIndex((group) => group.role === adminStaffRole(row.roles));
    return rank(a) - rank(b) || (a.username || a.display_name || '').localeCompare(b.username || b.display_name || '', 'en', { sensitivity: 'base' });
  });
}