/** A server-verified grant is local to this viewer and expires with the audited switch. */
export function screenLockAdminBypass(grant: { userId: string; expiresAt: string | null } | null, userId: string, now = Date.now()) {
  return !!grant && grant.userId === userId && !!grant.expiresAt && Date.parse(grant.expiresAt) > now;
}