// Website playback of the exact same recordings the Android app uses, so an
// alert sounds identical in the browser and on the phone.
import { PHONE_ALERTS, phoneAlertFor } from "@/lib/phone-alerts";

const files = import.meta.glob("/src/assets/phone-tones/*.mp3", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const TONE_SRC = new Map<string, string>();
for (const [path, url] of Object.entries(files)) {
  const name = path.split("/").pop()!.replace(/\.mp3$/, "");
  TONE_SRC.set(name, url);
}

/** Phone alert key -> playable URL of its recording. */
export function phoneToneSrc(alertKey: string): string | undefined {
  const a = PHONE_ALERTS.find((x) => x.key === alertKey);
  return a ? TONE_SRC.get(a.tone) : undefined;
}

/** Push/notification kind -> playable URL of the matching phone recording. */
export function phoneToneForKind(kind?: string | null, event?: string): string | undefined {
  const a = phoneAlertFor(kind ?? undefined, event);
  return a ? TONE_SRC.get(a.tone) : undefined;
}

export const PHONE_TONE_SRCS: ReadonlySet<string> = new Set(TONE_SRC.values());
