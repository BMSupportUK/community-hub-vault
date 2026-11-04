import { isStaffPortalUser } from "@/lib/portal-home";

/**
 * Header caption for the account number pill, shown above the number: staff
 * see "Your staff account", everyone else sees "Your account". The number
 * itself is the same permanent 6-digit BM account number the BM Player asks
 * for on every open.
 */
export function accountNumberPillLabel(roles: readonly string[]) {
  return isStaffPortalUser(roles) ? "Your staff account" : "Your account";
}
