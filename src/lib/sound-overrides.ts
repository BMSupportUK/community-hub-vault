// Admin-uploaded replacement sounds. Overrides are keyed by SoundKey and
// resolved by original asset URL, so every caller of playSound() — including
// components that import MP3s directly — plays the replacement automatically.
import { supabase } from "@/integrations/supabase/client";
import { NOTIFICATION_SOUNDS } from "@/lib/notification-sounds";
import { PHONE_ALERTS } from "@/lib/phone-alerts";
import { phoneToneSrc } from "@/lib/phone-alert-sounds";

export const SOUND_BUCKET = "notification-sounds";

const srcToKey = new Map<string, string>(NOTIFICATION_SOUNDS.map((s) => [s.src, s.key]));
for (const a of PHONE_ALERTS) {
  const src = phoneToneSrc(a.key);
  if (src) srcToKey.set(src, `phone-${a.key}`);
}
let overrides = new Map<string, string>(); // key -> playable URL
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function resolveSoundSrc(src: string): string {
  const key = srcToKey.get(src);
  return (key && overrides.get(key)) || src;
}

export function getOverrideUrl(key: string): string | undefined {
  return overrides.get(key);
}

export function onOverridesChange(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function loadSoundOverrides(force = false): Promise<void> {
  if (loading && !force) return loading;
  loading = (async () => {
    const { data } = await supabase.from("notification_sound_overrides").select("sound_key, url");
    const next = new Map<string, string>();
    for (const row of data ?? []) {
      const { data: signed } = await supabase.storage
        .from(SOUND_BUCKET)
        .createSignedUrl(row.url, 60 * 60 * 24);
      if (signed?.signedUrl) next.set(row.sound_key, signed.signedUrl);
    }
    overrides = next;
    listeners.forEach((l) => l());
  })().catch(() => { loading = null; });
  return loading;
}
