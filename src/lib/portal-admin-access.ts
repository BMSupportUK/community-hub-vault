type SwitchAudit = { customer_id: string; returned_at: string | null; expires_at: string };

/** Only a live audited switch bound to this customer and a current admin qualifies. */
export function portalAdminPinBypass(audit: SwitchAudit | null, userId: string, roles: readonly string[], now = Date.now()) {
  return !!audit && audit.customer_id === userId && audit.returned_at === null
    && Date.parse(audit.expires_at) > now && roles.includes("admin");
}