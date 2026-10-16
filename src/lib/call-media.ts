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