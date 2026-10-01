import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";

export type LocationCoords = { latitude: number; longitude: number; accuracy?: number | null };
export type LocationPermission = "granted" | "prompt" | "denied" | "unsupported";

const isNative = () => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

export async function getLocationPermission(): Promise<LocationPermission> {
  if (typeof window === "undefined") return "unsupported";
  if (isNative()) {
    try {
      const p = await Geolocation.checkPermissions();
      if (p.location === "granted" || p.coarseLocation === "granted") return "granted";
      if (p.location === "denied") return "denied";
      return "prompt";
    } catch {
      return "unsupported";
    }
  }
  if (!("geolocation" in navigator)) return "unsupported";
  if (!("permissions" in navigator)) return "prompt";
  try {
    const p = await navigator.permissions.query({ name: "geolocation" });
    return p.state as LocationPermission;
  } catch {
    return "prompt";
  }
}

/** Reads the position (triggers the system prompt if not yet decided). */
export async function readPosition(): Promise<
  { ok: true; coords: LocationCoords } | { ok: false; denied: boolean }
> {
  if (isNative()) {
    try {
      const req = await Geolocation.requestPermissions();
      if (req.location === "denied" && req.coarseLocation !== "granted") return { ok: false, denied: true };
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: false,
        timeout: 15_000,
        maximumAge: 10 * 60_000,
        enableLocationFallback: true,
      });
      return { ok: true, coords: pos.coords };
    } catch {
      return { ok: false, denied: false };
    }
  }
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return { ok: false, denied: false };
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ ok: true, coords: pos.coords }),
      (err) => resolve({ ok: false, denied: err.code === err.PERMISSION_DENIED }),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 10 * 60_000 },
    );
  });
}
