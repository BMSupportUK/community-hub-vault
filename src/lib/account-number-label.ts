/**
 * Caption shown above the account number in the header pill. Reads exactly
 * "Your Account Number" for everyone — staff and customers alike.
 */
export function accountNumberPillLabel(_roles: readonly string[]) {
  void _roles;
  return "Your Account Number";
}
