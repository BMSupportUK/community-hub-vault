// Website playback of the exact same recordings the Android app uses, so an
// alert sounds identical in the browser and on the phone.
import { PHONE_ALERTS, phoneAlertFor } from "@/lib/phone-alerts";
import mentionAudio from "@/assets/mention-notify.mp3";
import staffMentionAudio from "@/assets/staff-mention.mp3";
import orderAudio from "@/assets/order-notify.mp3";
import ticketAudio from "@/assets/ticket-notify.mp3";
import ticketReplyAudio from "@/assets/ticket-reply-notify.mp3";
import paymentReceivedAudio from "@/assets/payment-received.mp3";
import newSignupAudio from "@/assets/new-signup-notify.mp3";
import shiftStartAudio from "@/assets/shift-start.mp3";
import shiftEndAudio from "@/assets/shift-end.mp3";
import endBreakAudio from "@/assets/end-break.mp3";
import endLunchAudio from "@/assets/end-lunch.mp3";
import outageAudio from "@/assets/outage-notify.mp3";
import outageResolvedAudio from "@/assets/outage-resolved.mp3";

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

/** Legacy website clips -> the phone alert that replaces them. */
const LEGACY: Array<[string, string]> = [
  [mentionAudio, "mention"],
  [staffMentionAudio, "mention"],
  [orderAudio, "order"],
  [ticketAudio, "ticket"],
  [ticketReplyAudio, "ticket_reply"],
  [paymentReceivedAudio, "payment"],
  [newSignupAudio, "signup"],
  [shiftStartAudio, "shift_start"],
  [shiftEndAudio, "shift_end"],
  [endBreakAudio, "break_ending"],
  [endLunchAudio, "main_break_ending"],
  [outageAudio, "outage"],
  [outageResolvedAudio, "outage_resolved"],
];
const LEGACY_MAP = new Map<string, string>();
for (const [src, key] of LEGACY) {
  const tone = phoneToneSrc(key);
  if (tone) LEGACY_MAP.set(src, tone);
}

/** Swap an old website clip for its phone recording (unknown srcs pass through). */
export function toPhoneTone(src: string): string {
  return LEGACY_MAP.get(src) ?? src;
}
