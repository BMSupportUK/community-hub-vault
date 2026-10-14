// Single source of truth for notification audio.
//
// Every component that plays or preloads a sound imports from here, so an
// asset rename or a typo'd key can never silently break playback in one
// place while working in another.

// The old built-in website clips were removed; every alert plays the same
// recording the phone app uses (admin uploads still override per key).
import { phoneToneSrc } from "@/lib/phone-alert-sounds";
import broadcastAudio from "@/assets/broadcast-notify.mp3";
import fanZoneAppealAsset from "@/assets/fan-zone-appeal-alert.mp3.asset.json";
import fanZoneAppealMsgAsset from "@/assets/fan-zone-appeal-message.mp3.asset.json";
import fanZoneAppealStaffAsset from "@/assets/fan-zone-appeal-staff-reply.mp3.asset.json";
import contentReportedAsset from "@/assets/content-reported.mp3.asset.json";
import fanZoneMentionAsset from "@/assets/fan-zone-mention.mp3.asset.json";
import daneBmSupportAsset from "@/assets/dane-bm-support-needed.mp3.asset.json";

export type SoundKey =
  | "mention"
  | "fan-zone-mention"
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
  | "outage-resolved"
  | "fan-zone-appeal"
  | "fan-zone-appeal-message"
  | "fan-zone-appeal-staff-reply"
  | "content-reported"
  | "dane-bm-support";

export interface SoundDef {
  key: SoundKey;
  label: string;
  src: string;
  gain: number;
}

export const NOTIFICATION_SOUNDS: readonly SoundDef[] = [
  { key: "mention", label: "Mention", src: phoneToneSrc("mention")!, gain: 1.5 },
  { key: "fan-zone-mention", label: "Fan Zone mention", src: fanZoneMentionAsset.url, gain: 2.0 },
  { key: "staff-mention", label: "Staff mention", src: phoneToneSrc("mention")!, gain: 1.5 },
  { key: "broadcast", label: "Broadcast", src: broadcastAudio, gain: 1.5 },
  { key: "order", label: "Sale / Order", src: phoneToneSrc("order")!, gain: 1.8 },
  { key: "ticket", label: "Ticket", src: phoneToneSrc("ticket")!, gain: 2.0 },
  { key: "ticket-reply", label: "Ticket reply", src: phoneToneSrc("ticket_reply")!, gain: 2.0 },
  { key: "payment-received", label: "Payment confirmed", src: phoneToneSrc("payment")!, gain: 2.0 },
  { key: "signup", label: "New signup", src: phoneToneSrc("signup")!, gain: 1.8 },
  { key: "shift-start", label: "Shift start", src: phoneToneSrc("shift_start")!, gain: 2.2 },
  { key: "shift-end", label: "Shift end", src: phoneToneSrc("shift_end")!, gain: 2.2 },
  { key: "end-break", label: "Break ending", src: phoneToneSrc("break_ending")!, gain: 2.2 },
  { key: "end-lunch", label: "Main break ending", src: phoneToneSrc("main_break_ending")!, gain: 2.2 },
  { key: "outage", label: "Outage", src: phoneToneSrc("outage")!, gain: 2.2 },
  { key: "outage-resolved", label: "Outage resolved", src: phoneToneSrc("outage_resolved")!, gain: 1.8 },
  { key: "fan-zone-appeal", label: "Fan Zone ban appeal", src: fanZoneAppealAsset.url, gain: 2.0 },
  { key: "fan-zone-appeal-message", label: "Fan Zone appeal message", src: fanZoneAppealMsgAsset.url, gain: 2.0 },
  { key: "fan-zone-appeal-staff-reply", label: "Fan Zone appeal reply", src: fanZoneAppealStaffAsset.url, gain: 2.0 },
  { key: "content-reported", label: "Content reported", src: contentReportedAsset.url, gain: 2.0 },
  { key: "dane-bm-support", label: "Needed in BM Support", src: daneBmSupportAsset.url, gain: 2.0 },
];

const BY_KEY = new Map<string, SoundDef>(NOTIFICATION_SOUNDS.map((s) => [s.key, s]));

/** All asset URLs — safe for preloading. */
export const NOTIFICATION_SOUND_SRCS: readonly string[] = NOTIFICATION_SOUNDS.map((s) => s.src);

/** Lookup that never throws; returns undefined for unknown keys. */
export function getSound(key: string | null | undefined): SoundDef | undefined {
  if (!key) return undefined;
  return BY_KEY.get(key);
}
