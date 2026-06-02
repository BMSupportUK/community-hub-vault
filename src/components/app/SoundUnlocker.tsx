import { useEffect } from "react";
import { ensureSoundUnlocked } from "@/lib/sound";
import mentionAudio from "@/assets/mention-notify.mp3";
import ticketAudio from "@/assets/ticket-notify.mp3";
import shiftStartAudio from "@/assets/shift-start.mp3";
import shiftEndAudio from "@/assets/shift-end.mp3";
import endBreakAudio from "@/assets/end-break.mp3";
import endLunchAudio from "@/assets/end-lunch.mp3";
import outageAudio from "@/assets/outage-notify.mp3";
import outageResolvedAudio from "@/assets/outage-resolved.mp3";
import orderAudio from "@/assets/order-notify.mp3";
import newSignupAudio from "@/assets/new-signup-notify.mp3";
import broadcastAudio from "@/assets/broadcast-notify.mp3";
import staffMentionAudio from "@/assets/staff-mention.mp3";

const NOTIFICATION_SOUNDS = [
  mentionAudio,
  staffMentionAudio,
  broadcastAudio,
  orderAudio,
  ticketAudio,
  newSignupAudio,
  shiftStartAudio,
  shiftEndAudio,
  endBreakAudio,
  endLunchAudio,
  outageAudio,
  outageResolvedAudio,
];

export function SoundUnlocker() {
  useEffect(() => {
    ensureSoundUnlocked(NOTIFICATION_SOUNDS);
  }, []);

  return null;
}