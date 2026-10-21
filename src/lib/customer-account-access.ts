export function canSwitchCustomerAccount(roles: readonly string[]) {
  return roles.includes("admin");
}

export function canSelectOrderSiteUser(roles: readonly string[]) {
  return roles.some((role) => role === "admin" || role === "management");
}

export function isSwitchableCustomer(roles: readonly string[]) {
  return roles.some((role) => ["member", "subscriber", "nonsubscriber"].includes(role))
    && !roles.some((role) => ["admin", "management", "staff", "moderator", "banned", "rejected", "pending"].includes(role));
}