/** Staff receive customer media without acquiring any local device. */
export function callMicrophoneError(error: unknown): string {
  // Some browsers' DOMException is not an Error subclass, so read fields directly.
  const e = (error ?? {}) as { name?: string; message?: string };
  const name = typeof e.name === "string" ? e.name : "";
  const code = name ? ` (code: ${name})` : "";
  if (name === "NotAllowedError" || name === "SecurityError") return `Microphone access was blocked by the browser or device. The call can continue without it.${code}`;
  if (name === "NotFoundError" || name === "OverconstrainedError") return `No microphone was found. Connect a microphone and try again; the call can continue without it.${code}`;
  if (name === "NotReadableError" || name === "AbortError") return `Your microphone is in use by another app (Teams, Zoom, Discord, another browser tab) or blocked by Windows/Mac privacy settings. Close it and tap the microphone again.${code}`;
  if (e.message === "Call ended") return "The call changed while the microphone was starting. Tap the microphone again once connected.";
  return `The microphone could not be added to this call. Tap the microphone to try again.${code}`;
}

export async function initialCallMedia(
  withCamera: boolean,
  facingMode: "user" | "environment",
  devices: Pick<MediaDevices, "getUserMedia">,
  emptyStream: () => MediaStream,
): Promise<MediaStream> {
  if (!withCamera) return emptyStream();
  return devices.getUserMedia({ video: { facingMode: { ideal: facingMode } }, audio: true });
}

/** Uses the audio slot already negotiated, without restarting the call. */
export async function attachCallMicrophone(pc: RTCPeerConnection, stream: MediaStream, devices: Pick<MediaDevices, "getUserMedia">) {
  const slot = pc.getTransceivers().find((t) => t.receiver.track.kind === "audio");
  const isClosed = () => pc.connectionState === "closed";
  if (!slot || isClosed()) throw new Error("Call ended");
  const fresh = await devices.getUserMedia({ audio: true, video: false });
  const track = fresh.getAudioTracks()[0];
  try {
    if (!track || isClosed()) throw new Error("Microphone unavailable");
    await slot.sender.replaceTrack(track);
    track.enabled = true;
    stream.addTrack(track);
    return track;
  } catch (error) {
    fresh.getTracks().forEach((t) => t.stop());
    throw error;
  }
}
/** True when a sampled video frame (RGBA pixels) is effectively all black. */
export function isBlackFrame(rgba: ArrayLike<number>, threshold = 12): boolean {
  let max = 0;
  for (let i = 0; i + 2 < rgba.length; i += 4) {
    const l = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
    if (l > max) max = l;
  }
  return max < threshold;
}

/** DTLS fingerprint line of an SDP; a different one means the other side built a brand-new connection. */
export function sdpFingerprint(sdp: string | undefined | null): string | null {
  const m = /a=fingerprint:(\S+ \S+)/i.exec(sdp ?? "");
  return m ? m[1].toLowerCase() : null;
}

export type BlackPictureFix = "none" | "reattach" | "camrestart" | "rebuild";

/**
 * Escalating repair while the customer's picture stays black/frozen:
 * re-attach the picture locally (2s), restart the customer's camera (4s,
 * at most every 8s), then rebuild the whole connection (10s, at most every 20s).
 */
export function nextBlackPictureFix(
  darkMs: number,
  now: number,
  s: { reattached: boolean; lastAsk: number; lastRebuild: number },
): BlackPictureFix {
  if (darkMs >= 10000 && now - s.lastRebuild >= 20000) return "rebuild";
  if (darkMs >= 4000 && now - s.lastAsk >= 8000) return "camrestart";
  if (darkMs >= 2000 && !s.reattached) return "reattach";
  return "none";
}
