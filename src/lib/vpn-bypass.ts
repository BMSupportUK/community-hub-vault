/**
 * Accounts allowed to use the site while a VPN/proxy is connected.
 * Everyone else must disconnect their VPN to sign up / join.
 */
export const VPN_BYPASS_EMAILS = [
  "bmsupport2022@protonmail.com", // admin (danej)
  "bmsupport2022@pm.me", // admin (backupadmin)
  "normanbyred77@protonmail.com", // normanbyred77
  "grahamjackson77@ymail.com", // GJ Test Account
  "grahamjackson1977@gmail.com", // GJ account
];

export function isVpnBypassEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return VPN_BYPASS_EMAILS.includes(email.trim().toLowerCase());
}
