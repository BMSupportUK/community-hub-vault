// Groups a customer's linked BM Player devices by the kind of device it is, so the
// Link Device list reads Box / Amazon / PC & Mac / Phone instead of newest-first.
// Browser-safe: no server imports.

export type DeviceGroupKey = "box" | "amazon" | "computer" | "phone" | "other";

export type DeviceGroup = { key: DeviceGroupKey; label: string };

// Display order of the groups on the Link Device page.
export const DEVICE_GROUPS: DeviceGroup[] = [
  { key: "box", label: "Box" },
  { key: "amazon", label: "Amazon" },
  { key: "computer", label: "PC / Mac" },
  { key: "phone", label: "Phone" },
  { key: "other", label: "Other" },
];

const GROUP_OF_PLATFORM: Record<string, DeviceGroupKey> = {
  android: "box",
  firetv: "amazon",
  amazon: "amazon",
  windows: "computer",
  mac: "computer",
  pc: "computer",
  phone: "phone",
  web: "phone",
  iphone: "phone",
  ipad: "phone",
};

export function deviceGroupKey(platform: string | null | undefined): DeviceGroupKey {
  return GROUP_OF_PLATFORM[(platform ?? "").trim().toLowerCase()] ?? "other";
}

export function deviceGroupLabel(platform: string | null | undefined): string {
  const key = deviceGroupKey(platform);
  return DEVICE_GROUPS.find((g) => g.key === key)?.label ?? "Other";
}

// Split devices into the groups above, in DEVICE_GROUPS order, keeping the
// incoming order inside each group. Empty groups are left out.
export function groupDevicesByType<T extends { platform: string | null | undefined }>(
  devices: T[],
): (DeviceGroup & { devices: T[] })[] {
  const buckets = new Map<DeviceGroupKey, T[]>();
  for (const device of devices) {
    const key = deviceGroupKey(device.platform);
    const list = buckets.get(key);
    if (list) list.push(device);
    else buckets.set(key, [device]);
  }
  return DEVICE_GROUPS
    .filter((group) => (buckets.get(group.key)?.length ?? 0) > 0)
    .map((group) => ({ ...group, devices: buckets.get(group.key)! }));
}
