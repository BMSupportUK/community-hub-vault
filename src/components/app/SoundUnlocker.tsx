import { useEffect } from "react";
import { ensureSoundUnlocked } from "@/lib/sound";
import { NOTIFICATION_SOUND_SRCS } from "@/lib/notification-sounds";

export function SoundUnlocker() {
  useEffect(() => {
    try {
      ensureSoundUnlocked([...NOTIFICATION_SOUND_SRCS]);
    } catch (err) {
      console.warn("[sound] unlock setup failed:", err);
    }
  }, []);

  return null;
}
