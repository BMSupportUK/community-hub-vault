/** Recipient filtering is applied after the shared cache, using verified device ownership. */
export function announcementMatchesUser(
  targetUserId: string | null,
  device: { user_id: string | null; offsite_customer_id: string | null },
) {
  if (targetUserId === null) return true;
  return device.offsite_customer_id === null && device.user_id === targetUserId;
}

/**
 * Who sees a short announcement: only a device that was already connected when it was sent
 * (offline linked devices never get it later), and only the chosen device when one is targeted.
 */
export function announcementReachesDevice(
  a: { sent_at: number; target_user_id: string | null; target_device_id: string | null },
  device: { id: string; user_id: string | null; offsite_customer_id: string | null; connected_since: string | null },
) {
  if (!device.connected_since || Date.parse(device.connected_since) > a.sent_at) return false;
  if (a.target_device_id) return device.id === a.target_device_id;
  return announcementMatchesUser(a.target_user_id, device);
}
