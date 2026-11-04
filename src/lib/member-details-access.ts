import { adminStaffRole } from "./admin-staff-list";

export function canEditMemberDetails(callerRoles: string[], targetRoles: string[]) {
  if (callerRoles.includes("admin")) return true;
  return callerRoles.includes("management") && !adminStaffRole(targetRoles);
}

export async function assertMemberDetailsAccess(
  callerRoles: string[],
  readTargetRoles: () => Promise<string[]>,
) {
  if (!callerRoles.some((role) => role === "admin" || role === "management")) {
    throw new Error("Forbidden: admin or management only");
  }
  const targetRoles = await readTargetRoles();
  if (!canEditMemberDetails(callerRoles, targetRoles)) {
    throw new Error("Only an admin can edit staff details.");
  }
}