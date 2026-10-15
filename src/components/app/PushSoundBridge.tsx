import { useEffect } from "react";
import { playSound } from "@/lib/sound";
import { getSound } from "@/lib/notification-sounds";
import { phoneToneForKind } from "@/lib/phone-alert-sounds";
import { shakeScreen } from "@/lib/screen-shake";
import { loadSoundOverrides } from "@/lib/sound-overrides";

/**
 * Plays the uploaded voice clips when a web push arrives, so staff hear the
 * recorded message rather than the generic OS notification chime.
 */
export function PushSoundBridge() {
  useEffect(() => { void loadSoundOverrides(); }, []);
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const onMessage = async (event: MessageEvent) => {
      let played = false;
      try {
        const data = event.data as { type?: string; sound?: string; kind?: string; event?: string } | null;
        if (!data || data.type !== "bm-play-sound") return;
        // Shift start/end warnings already play their clip from the in-app
        // toast (ShiftStartEndAlert). The push arrives a few seconds later,
        // so playing it here stacked a second, quieter copy of the same
        // recording on top — the low muffled echo underneath the toast.
        if (IN_APP_OWNED_KINDS.has(data.kind ?? "")) {
          event.ports?.[0]?.postMessage({ played: true });
          return;
        }
        shakeScreen();
        // Same recording the phone app plays for this alert type.
        const tone = phoneToneForKind(data.kind, data.event);
        const def = getSound(data.sound);
        const src = tone ?? def?.src;
        played = src ? await playSound(src, { label: `push-${data.kind ?? def?.key}`, gain: 1.2 }) : false;
      } catch (err) {
        console.warn("[sound] push bridge failed:", err);
      } finally {
        try {
          event.ports?.[0]?.postMessage({ played });
        } catch { /* noop */ }
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);
  return null;
}
