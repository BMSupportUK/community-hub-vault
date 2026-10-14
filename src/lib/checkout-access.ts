export function canViewStaffCheckout(roles: readonly string[]): boolean {
  return roles.some((role) => ["admin", "management", "staff"].includes(role));
}

export function canCompleteCheckoutSteps(roles: readonly string[]): boolean {
  return roles.some((role) => ["admin", "management"].includes(role));
}
