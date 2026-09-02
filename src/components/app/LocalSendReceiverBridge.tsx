import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { PluginListenerHandle } from "@capacitor/core";
import {
  LocalSend,
  isLocalSendAvailable,
  type LocalSendReceiveEvent,
} from "@/lib/localsend";

/**
 * Keeps the built-in LocalSend receiver running on native Android (phones,
 * Android boxes and Fire Sticks) so an APK sent over Wi-Fi lands here and
 * Android's installer opens automatically.
 */
export function LocalSendReceiverBridge() {
  const toastId = useRef<string | number | null>(null);

  useEffect(() => {
    if (!isLocalSendAvailable()) return;

    let handle: PluginListenerHandle | null = null;
    let cancelled = false;

    const onEvent = (e: LocalSendReceiveEvent) => {
      const name = e.fileName || "file";
      if (e.phase === "incoming") {
        toastId.current = toast.loading(`Incoming over Wi-Fi: ${name}`);
      } else if (e.phase === "receiving") {
        if (toastId.current == null) {
          toastId.current = toast.loading(`Receiving ${name}…`);
        } else {
          toast.loading(`Receiving ${name} — ${e.percent}%`, { id: toastId.current });
        }
      } else if (e.phase === "received" || e.phase === "installing") {
        const message =
          e.phase === "installing"
            ? `${name} received — opening the installer`
            : `${name} received`;
        if (toastId.current != null) {
          toast.success(message, { id: toastId.current });
          toastId.current = null;
        } else {
          toast.success(message);
        }
      } else if (e.phase === "error") {
        const message = e.error || "Wi-Fi transfer failed";
        if (toastId.current != null) {
          toast.error(message, { id: toastId.current });
          toastId.current = null;
        } else {
          toast.error(message);
        }
      } else if (e.phase === "cancelled" && toastId.current != null) {
        toast.dismiss(toastId.current);
        toastId.current = null;
      }
    };

    void (async () => {
      try {
        handle = await LocalSend.addListener("localSendReceive", onEvent);
        if (cancelled) {
          await handle.remove();
          handle = null;
          return;
        }
        await LocalSend.startReceiver();
      } catch {
        // Older builds without the native receiver simply stay send-only.
      }
    })();

    return () => {
      cancelled = true;
      void handle?.remove();
    };
  }, []);

  return null;
}
