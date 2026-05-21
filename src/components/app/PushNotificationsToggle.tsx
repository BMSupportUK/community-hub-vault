import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import {
  enablePush,
  disablePush,
  getPushStatus,
  isInIframe,
  isPreviewHost,
  pushSupported,
} from "@/lib/push-client";

export function PushNotificationsToggle() {
  const [status, setStatus] = useState<"loading" | "unsupported" | "denied" | "subscribed" | "default" | "preview" | "native">("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (Capacitor.isNativePlatform()) { setStatus("native"); return; }
      if (isInIframe() || isPreviewHost()) { setStatus("preview"); return; }
      if (!pushSupported()) { setStatus("unsupported"); return; }
      setStatus(await getPushStatus());
    })();
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      await enablePush();
      setStatus("subscribed");
      toast.success("Notifications enabled");
    } catch (e: any) {
      toast.error(e.message ?? "Could not enable notifications");
    } finally { setBusy(false); }
  };

  const disable = async () => {
    setBusy(true);
    try {
      await disablePush();
      setStatus("default");
      toast.success("Notifications disabled");
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally { setBusy(false); }
  };

  if (status === "loading") {
    return (
      <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" /> Checking notifications…
      </div>
    );
  }
  if (status === "native") {
    return (
      <div className="inline-flex items-center gap-2 text-xs text-emerald-400">
        <Smartphone className="size-4" /> Notifications are active via the BM Support app (FCM). Manage them in your device settings.
      </div>
    );
  }
  if (status === "preview") {
    return <p className="text-xs text-muted-foreground">Open this site in a real browser tab (or installed PWA) to enable push notifications.</p>;
  }
  if (status === "unsupported") {
    return <p className="text-xs text-muted-foreground">Push notifications aren't supported in this browser. On Android, use Chrome and add to home screen.</p>;
  }
  if (status === "denied") {
    return <p className="text-xs text-muted-foreground">Notifications are blocked. Enable them in your browser site settings to receive outage alerts.</p>;
  }

  if (status === "subscribed") {
    return (
      <button
        onClick={disable}
        disabled={busy}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-surface-2 text-sm hover:bg-surface-1 disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <BellOff className="size-4" />}
        Disable outage notifications
      </button>
    );
  }
  return (
    <button
      onClick={enable}
      disabled={busy}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Bell className="size-4" />}
      Enable outage notifications
    </button>
  );
}