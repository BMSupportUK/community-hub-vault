/** Recipient filtering is applied after the shared cache, using verified device ownership. */
export function announcementMatchesUser(
  targetUserId: string | null,
  device: { user_id: string | null; offsite_customer_id: string | null },
) {
  if (targetUserId === null) return true;
  return device.offsite_customer_id === null && device.user_id === targetUserId;
}