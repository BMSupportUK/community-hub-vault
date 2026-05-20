import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { recordMyGpsLocation } from "@/lib/gps-capture.functions";

/**
 * Once per session, ask the browser for the user's precise GPS location and
 * record it as a "gps" event in their location history. If permission is
 * denied or unavailable, silently skip — IP-based geolocation still works.
 */
export function GpsCapture() {
  const { user, loading, isPending } = useAuth();
  const record = useServerFn(recordMyGpsLocation);

  useEffect(() => {
    if (loading || isPending || !user?.id) return;
    if (typeof window === "undefined" || !("geolocation" in navigator)) return;

    const key = `gps-recorded:${user.id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        record({
          data: {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          },
        }).catch(() => {
          sessionStorage.removeItem(key);
        });
      },
      () => {
        // permission denied or unavailable; do nothing
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  }, [user?.id, loading, isPending, record]);

  return null;
}
