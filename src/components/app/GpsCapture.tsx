import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { recordMyGpsLocation } from "@/lib/gps-capture.functions";

const isNativeLocationApp = () => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

type LocationCoords = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
};

/**
 * Once per session, record GPS only when location permission has already been
 * granted. Never show an app-blocking prompt — IP-based geolocation still works.
 */
export function GpsCapture() {
  const { user, loading, isPending } = useAuth();
  const record = useServerFn(recordMyGpsLocation);

  const markHandled = () => {
    if (!user?.id) return;
    const key = `gps-recorded:${user.id}`;
    sessionStorage.setItem(key, "1");
  };

  const recordGrantedLocation = async () => {
    if (!user?.id || typeof window === "undefined") return;
    const savePosition = async (coords: LocationCoords) => {
      await record({
        data: {
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
        },
      });
    };

    if (isNativeLocationApp()) {
      try {
        const currentPermission = await Geolocation.checkPermissions();
        if (currentPermission.location !== "granted" && currentPermission.coarseLocation !== "granted") return;

        const pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: false,
          timeout: 5_000,
          maximumAge: 10 * 60_000,
          enableLocationFallback: true,
        });
        await savePosition(pos.coords);
      } catch (err) {
        console.warn("[gps-capture] skipped native GPS capture", err);
      }
      return;
    }

    if (!("permissions" in navigator) || !("geolocation" in navigator)) return;

    try {
      const permission = await navigator.permissions.query({ name: "geolocation" });
      if (permission.state !== "granted") return;

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          savePosition(pos.coords).catch((err) => {
            console.warn("[gps-capture] skipped browser GPS save", err);
          });
        },
        (err) => {
          console.warn("[gps-capture] skipped browser GPS capture", err);
        },
        { enableHighAccuracy: false, timeout: 5_000, maximumAge: 10 * 60_000 },
      );
    } catch (err) {
      console.warn("[gps-capture] skipped browser GPS permission check", err);
    }
  };

  useEffect(() => {
    if (loading || isPending || !user?.id) return;
    if (typeof window === "undefined") return;

    const key = `gps-recorded:${user.id}`;
    if (sessionStorage.getItem(key)) return;

    markHandled();
    void recordGrantedLocation();
  }, [user?.id, loading, isPending]);

  return null;
}
