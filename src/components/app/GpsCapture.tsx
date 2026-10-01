import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { recordMyGpsLocation } from "@/lib/gps-capture.functions";
import { getLocationPermission, readPosition } from "@/lib/location-permission";

/**
 * Once per session, record GPS only when location permission has already been
 * granted. Never prompts — the opt-in ask lives on the security gate for
 * direct (non-referral) BM Support sign-ups.
 */
export function GpsCapture() {
  const { user, loading, isPending } = useAuth();
  const record = useServerFn(recordMyGpsLocation);

  useEffect(() => {
    if (loading || isPending || !user?.id) return;
    if (typeof window === "undefined") return;
    const key = `gps-recorded:${user.id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    void (async () => {
      if ((await getLocationPermission()) !== "granted") return;
      const res = await readPosition();
      if (!res.ok) return;
      await record({
        data: { latitude: res.coords.latitude, longitude: res.coords.longitude, accuracy: res.coords.accuracy },
      }).catch((err) => console.warn("[gps-capture] skipped GPS save", err));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, loading, isPending]);

  return null;
}
