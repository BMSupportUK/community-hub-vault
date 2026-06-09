import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { recordMyGpsLocation } from "@/lib/gps-capture.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MapPin } from "lucide-react";

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

  const requestLocation = () => {
    if (!user?.id) return;
    const key = `gps-recorded:${user.id}`;
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
  };

  useEffect(() => {
    if (loading || isPending || !user?.id) return;
    if (typeof window === "undefined" || !("geolocation" in navigator)) return;

    const key = `gps-recorded:${user.id}`;
    if (sessionStorage.getItem(key)) return;

    // Show our explainer first; the browser prompt fires when the user
    // clicks Continue (a user gesture, which some browsers require).
    setExplainOpen(true);
  }, [user?.id, loading, isPending]);

  const dismiss = () => {
    if (user?.id) {
      // Persist dismissal so the dialog doesn't reappear on every page
      // navigation/reload during this session.
      sessionStorage.setItem(`gps-recorded:${user.id}`, "1");
    }
    setExplainOpen(false);
  };

  return (
    <Dialog open={explainOpen} onOpenChange={(o) => (o ? setExplainOpen(true) : dismiss())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="size-5 text-primary" /> Confirm your location
          </DialogTitle>
          <DialogDescription>
            We need to check your approximate location to keep this community safe.
            It helps us block users who aren't allowed access — including VPN/proxy
            abuse and accounts from restricted regions. Your browser will now ask
            for permission. We only record the coordinates, never track you in the
            background.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <button
            type="button"
            onClick={dismiss}
            className="px-4 py-2 rounded-md border border-border hover:bg-muted text-sm font-medium"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={() => {
              setExplainOpen(false);
              requestLocation();
            }}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium"
          >
            Continue
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
