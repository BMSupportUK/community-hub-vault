import { useEffect } from "react";
import { playSound } from "@/lib/sound";
import { getSound } from "@/lib/notification-sounds";

/**
 * Plays the uploaded voice clips when a web push arrives, so staff hear the
 * recorded message rather than the generic OS notification chime.
 */
export function PushSoundBridge() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const onMessage = async (event: MessageEvent) => {
      let played = false;
      try {
        const data = event.data as { type?: string; sound?: string } | null;
        if (!data || data.type !== "bm-play-sound") return;
        const def = getSound(data.sound);
        played = def ? await playSound(def.src, { label: `push-${def.key}`, gain: 2.0 }) : false;
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
