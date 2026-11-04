import { isStaffPortalUser } from "@/lib/portal-home";

/**
 * Caption shown above the account number in the header pill. Reads exactly
 * "Your Account Number" for everyone — staff and customers alike.
 */
export function accountNumberPillLabel(roles: readonly string[]) {
  void isStaffPortalUser(roles);
  return "Your Account Number";
}
