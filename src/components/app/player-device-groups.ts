/** Boxes count as On when they checked in within the last 3 minutes. */
export const DEVICE_ON_WINDOW_MS = 3 * 60_000;

export function isDeviceOn(lastSeenAt: string | null | undefined, now = Date.now()) {
  if (!lastSeenAt) return false;
  return now - Date.parse(lastSeenAt) <= DEVICE_ON_WINDOW_MS;
}

/** Groups boxes by the place in their name ("Mum's house - living room" → "Mum's house"). */
export function groupDevicesByPlace<T extends { nickname: string | null }>(devices: T[]) {
  const groups = new Map<string, T[]>();
  for (const d of devices) {
    const place = d.nickname?.split(" - ")[0]?.trim() || "Unnamed boxes";
    groups.set(place, [...(groups.get(place) ?? []), d]);
  }
  return [...groups].map(([place, list]) => ({ place, devices: list }));
}
