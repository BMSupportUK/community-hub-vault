export const STAFF_ROLES = ["admin", "management", "staff", "moderator"] as const;
export const STAFF_ROLE_LABELS: Record<string, string> = { admin: "Owners", management: "Management", staff: "Staff", moderator: "Moderators" };
export type StaffRecord = {
  user_id: string;
  join_date: string | null;
  leave_date: string | null;
  roles: string[];
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  equipped_nameplate_id: string | null;
};
export function staffEmploymentGroup(roles: readonly string[], record?: Pick<StaffRecord, "leave_date" | "roles">): string | null {
  if (record?.leave_date) return "former";
  return STAFF_ROLES.find((role) => roles.includes(role)) ?? null;
}
export function validateStaffDates(join: string, leave: string, today: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(join) || Number.isNaN(Date.parse(join))) return "Enter the date joined";
  if (leave && (!/^\d{4}-\d{2}-\d{2}$/.test(leave) || Number.isNaN(Date.parse(leave)))) return "Enter a valid date left";
  if (leave && leave < join) return "Date left cannot be before date joined";
  if (leave && leave > today) return "Date left cannot be in the future";
  return null;
}
export function employmentDate(value?: string | null): string {
  return value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("en-GB") : "Not recorded";
}