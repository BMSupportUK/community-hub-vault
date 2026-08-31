import { useEffect } from "react";
import { playSound } from "@/lib/sound";
import ticketReplyAudio from "@/assets/ticket-reply-notify.mp3";
import ticketAudio from "@/assets/ticket-notify.mp3";
import paymentReceivedAudio from "@/assets/payment-received.mp3";
import orderAudio from "@/assets/order-notify.mp3";
import mentionAudio from "@/assets/mention-notify.mp3";
import staffMentionAudio from "@/assets/staff-mention.mp3";
import outageAudio from "@/assets/outage-notify.mp3";
import outageResolvedAudio from "@/assets/outage-resolved.mp3";
import newSignupAudio from "@/assets/new-signup-notify.mp3";

const SOUNDS: Record<string, string> = {
  "ticket-reply": ticketReplyAudio,
  ticket: ticketAudio,
  "payment-received": paymentReceivedAudio,
  order: orderAudio,
  mention: mentionAudio,
  "staff-mention": staffMentionAudio,
  outage: outageAudio,
  "outage-resolved": outageResolvedAudio,
  signup: newSignupAudio,
};

/**
 * Plays the uploaded voice clips when a web push arrives, so staff hear the
 * recorded message rather than the generic OS notification chime.
 */
export function PushSoundBridge() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; sound?: string } | null;
      if (!data || data.type !== "bm-play-sound") return;
      const src = data.sound ? SOUNDS[data.sound] : undefined;
      if (!src) return;
      playSound(src, { label: `push-${data.sound}`, gain: 2.0 });
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);
  return null;
}
