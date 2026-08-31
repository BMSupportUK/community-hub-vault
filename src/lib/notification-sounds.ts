// Single source of truth for notification audio.
//
// Every component that plays or preloads a sound imports from here, so an
// asset rename or a typo'd key can never silently break playback in one
// place while working in another.

import mentionAudio from "@/assets/mention-notify.mp3";
import staffMentionAudio from "@/assets/staff-mention.mp3";
import broadcastAudio from "@/assets/broadcast-notify.mp3";
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

export type SoundKey =
  | "mention"
  | "staff-mention"
  | "broadcast"
  | "order"
  | "ticket"
  | "ticket-reply"
  | "payment-received"
  | "signup"
  | "shift-start"
  | "shift-end"
  | "end-break"
  | "end-lunch"
  | "outage"
  | "outage-resolved";

export interface SoundDef {
  key: SoundKey;
  label: string;
  src: string;
  gain: number;
}

export const NOTIFICATION_SOUNDS: readonly SoundDef[] = [
  { key: "mention", label: "Mention", src: mentionAudio, gain: 1.5 },
  { key: "staff-mention", label: "Staff mention", src: staffMentionAudio, gain: 1.5 },
  { key: "broadcast", label: "Broadcast", src: broadcastAudio, gain: 1.5 },
  { key: "order", label: "Sale / Order", src: orderAudio, gain: 1.8 },
  { key: "ticket", label: "Ticket", src: ticketAudio, gain: 2.0 },
  { key: "ticket-reply", label: "Ticket reply", src: ticketReplyAudio, gain: 2.0 },
  { key: "payment-received", label: "Payment confirmed", src: paymentReceivedAudio, gain: 2.0 },
  { key: "signup", label: "New signup", src: newSignupAudio, gain: 1.8 },
  { key: "shift-start", label: "Shift start", src: shiftStartAudio, gain: 2.2 },
  { key: "shift-end", label: "Shift end", src: shiftEndAudio, gain: 2.2 },
  { key: "end-break", label: "Break ending", src: endBreakAudio, gain: 2.2 },
  { key: "end-lunch", label: "Lunch ending", src: endLunchAudio, gain: 2.2 },
  { key: "outage", label: "Outage", src: outageAudio, gain: 2.2 },
  { key: "outage-resolved", label: "Outage resolved", src: outageResolvedAudio, gain: 1.8 },
];

const BY_KEY = new Map<string, SoundDef>(NOTIFICATION_SOUNDS.map((s) => [s.key, s]));

/** All asset URLs — safe for preloading. */
export const NOTIFICATION_SOUND_SRCS: readonly string[] = NOTIFICATION_SOUNDS.map((s) => s.src);

/** Lookup that never throws; returns undefined for unknown keys. */
export function getSound(key: string | null | undefined): SoundDef | undefined {
  if (!key) return undefined;
  return BY_KEY.get(key);
}
