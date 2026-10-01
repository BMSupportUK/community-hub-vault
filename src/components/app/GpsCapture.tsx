import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { useServerFn } from "@tanstack/react-start";
import { MapPin, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { recordMyGpsLocation } from "@/lib/gps-capture.functions";
import { Button } from "@/components/ui/button";

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

const DISMISS_DAYS = 30;
const dismissKey = (uid: string) => `gps-ask-dismissed:${uid}`;

/**
 * Once per session, record GPS when location permission has been granted.
 * If the member has never been asked, show a small, clearly-worded opt-in card.
 * Declining hides it for 30 days; a browser "Block" hides it permanently.
 */
export function GpsCapture() {
  const { user, loading, isPending } = useAuth();
  const record = useServerFn(recordMyGpsLocation);
  const [showAsk, setShowAsk] = useState(false);
  const [busy, setBusy] = useState(false);

  const savePosition = async (coords: LocationCoords) => {
    await record({
      data: { latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy },
    });
  };

  const getPermissionState = async (): Promise<"granted" | "prompt" | "denied" | "unsupported"> => {
    if (isNativeLocationApp()) {
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
      return p.state as "granted" | "prompt" | "denied";
    } catch {
      return "prompt";
    }
  };

  const captureNow = async () => {
    if (isNativeLocationApp()) {
      try {
        const pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: false,
          timeout: 10_000,
          maximumAge: 10 * 60_000,
          enableLocationFallback: true,
        });
        await savePosition(pos.coords);
      } catch (err) {
        console.warn("[gps-capture] skipped native GPS capture", err);
      }
      return;
    }
    await new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          savePosition(pos.coords)
            .catch((err) => console.warn("[gps-capture] skipped browser GPS save", err))
            .finally(resolve);
        },
        (err) => {
          console.warn("[gps-capture] skipped browser GPS capture", err);
          resolve();
        },
        { enableHighAccuracy: false, timeout: 10_000, maximumAge: 10 * 60_000 },
      );
    });
  };

  useEffect(() => {
    if (loading || isPending || !user?.id) return;
    if (typeof window === "undefined") return;
    const uid = user.id;
    const key = `gps-recorded:${uid}`;
    if (sessionStorage.getItem(key)) return;

    void (async () => {
      const state = await getPermissionState();
      if (state === "granted") {
        sessionStorage.setItem(key, "1");
        await captureNow();
        return;
      }
      if (state === "prompt") {
        const until = Number(localStorage.getItem(dismissKey(uid)) || 0);
        if (Date.now() > until) setShowAsk(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, loading, isPending]);

  if (!showAsk || !user?.id) return null;

  const dismiss = () => {
    localStorage.setItem(dismissKey(user.id), String(Date.now() + DISMISS_DAYS * 86_400_000));
    setShowAsk(false);
  };

  const allow = async () => {
    setBusy(true);
    if (isNativeLocationApp()) {
      try {
        await Geolocation.requestPermissions();
      } catch {
        /* ignore */
      }
    }
    await captureNow();
    sessionStorage.setItem(`gps-recorded:${user.id}`, "1");
    setBusy(false);
    setShowAsk(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Allow location for account security"
      className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md rounded-xl border border-border bg-card p-4 text-card-foreground shadow-lg sm:left-auto"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Close"
        className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex gap-3">
        <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="space-y-2">
          <p className="font-semibold">Allow location for account security</p>
          <p className="text-sm text-muted-foreground">
            We use your location to help protect your account and spot suspicious logins. It's only visible
            to our security staff and never shared. You can turn it off anytime in your browser settings.
          </p>
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={allow} disabled={busy}>
              {busy ? "Checking…" : "Allow location"}
            </Button>
            <Button size="sm" variant="ghost" onClick={dismiss} disabled={busy}>
              Not now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
