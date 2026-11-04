import { isStaffPortalUser } from "@/lib/portal-home";

/**
 * Header label for the account number pill: staff see "Staff", everyone else
 * sees "Customer Account". The number itself is the same permanent 6-digit BM
 * account number the BM Player asks for on every open.
 */
export function accountNumberPillLabel(roles: readonly string[]) {
  return isStaffPortalUser(roles) ? "Staff" : "Customer Account";
}
