import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { recordMyGpsLocation } from "@/lib/gps-capture.functions";
import { MapPin, X } from "lucide-react";
import { toast } from "sonner";

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
 * Once per session, ask the browser for the user's precise GPS location and
 * record it as a "gps" event in their location history. If permission is
 * denied or unavailable, silently skip — IP-based geolocation still works.
 *
 * Before triggering the native browser prompt, we show a short explainer so
 * the user understands the location check is part of our access controls
 * (blocking VPN/proxy abuse and users from disallowed regions).
 */
export function GpsCapture() {
  const { user, loading, isPending } = useAuth();
  const record = useServerFn(recordMyGpsLocation);
  const [explainOpen, setExplainOpen] = useState(false);

  const markHandled = () => {
    if (!user?.id) return;
    const key = `gps-recorded:${user.id}`;
    sessionStorage.setItem(key, "1");
  };

  const requestLocation = async () => {
    if (!user?.id) return;
    markHandled();
    const pending = toast.loading("Requesting your location…");
    const fallback = window.setTimeout(() => {
      toast.info("You can keep using the site while location permission finishes.", {
        id: pending,
      });
    }, 12_000);

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
        const hasLocationAccess =
          currentPermission.location === "granted" || currentPermission.coarseLocation === "granted";
        const permission = hasLocationAccess
          ? currentPermission
          : await Geolocation.requestPermissions({ permissions: ["coarseLocation"] });

        if (permission.location !== "granted" && permission.coarseLocation !== "granted") {
          throw new Error("LOCATION_PERMISSION_DENIED");
        }

        const pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: false,
          timeout: 8_000,
          maximumAge: 10 * 60_000,
          enableLocationFallback: true,
        });
        await savePosition(pos.coords);
        window.clearTimeout(fallback);
        toast.success("Location confirmed.", { id: pending });
      } catch (err) {
        window.clearTimeout(fallback);
        const message = err instanceof Error ? err.message : "";
        const msg = message.includes("LOCATION_PERMISSION_DENIED")
          ? "Location permission was denied. Enable location for BM Support in Android settings and try again."
          : message.toLowerCase().includes("disabled")
            ? "Turn on device location services, then try again."
            : "Couldn't get your location. Check Android location settings and try again.";
        toast.error(msg, { id: pending });
      }
      return;
    }

    if (!("geolocation" in navigator)) {
      window.clearTimeout(fallback);
      toast.error("Your browser doesn't support location services.", { id: pending });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(fallback);
        savePosition(pos.coords)
          .then(() => toast.success("Location confirmed.", { id: pending }))
          .catch(() => {
            toast.error("Couldn't save your location. Please try again.", { id: pending });
          });
      },
      (err) => {
        window.clearTimeout(fallback);
        const msg =
          err.code === err.PERMISSION_DENIED
            ? "Location permission was blocked. Enable it in your browser settings and reload."
            : err.code === err.POSITION_UNAVAILABLE
              ? "Location is unavailable on this device."
              : err.code === err.TIMEOUT
                ? "Location request timed out. Please try again."
                : "Couldn't get your location.";
        toast.error(msg, { id: pending });
      },
      { enableHighAccuracy: false, timeout: 8_000, maximumAge: 10 * 60_000 },
    );
  };

  useEffect(() => {
    if (loading || isPending || !user?.id) return;
    if (typeof window === "undefined") return;
    if (!isNativeLocationApp() && !("geolocation" in navigator)) return;

    const key = `gps-recorded:${user.id}`;
    if (sessionStorage.getItem(key)) return;

    // Show our explainer first; the browser prompt fires when the user
    // clicks Continue (a user gesture, which some browsers require).
    setExplainOpen(true);
  }, [user?.id, loading, isPending]);

  const dismiss = () => {
    // Persist dismissal so the dialog doesn't reappear on every page
    // navigation/reload during this session.
    markHandled();
    setExplainOpen(false);
  };

  if (!explainOpen) return null;

  return (
    <div
      role="status"
      aria-labelledby="gps-capture-title"
      className="fixed inset-x-3 bottom-4 z-[101] mx-auto max-w-lg rounded-lg border border-border bg-background p-5 shadow-2xl"
    >
      <button
        type="button"
        onClick={dismiss}
        className="absolute right-3 top-3 rounded-sm p-1 text-muted-foreground hover:text-foreground"
        aria-label="Close location confirmation"
      >
        <X className="size-4" />
      </button>
      <div className="space-y-4 pr-6">
        <h2
          id="gps-capture-title"
          className="flex items-center gap-2 text-lg font-semibold leading-tight"
        >
          <MapPin className="size-5 text-primary" /> Confirm your location
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          We need to check your approximate location to keep this community safe. It helps us block
          users who aren't allowed access — including VPN/proxy abuse and accounts from restricted
          regions. Your browser will now ask for permission. We only record the coordinates, never
          track you in the background.
        </p>
      </div>
      <div className="mt-5 grid gap-2">
        <button
          type="button"
          onClick={() => {
            dismiss();
            void requestLocation();
          }}
          className="rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Continue
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-md border border-border px-4 py-3 text-sm font-medium hover:bg-muted"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
