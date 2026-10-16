/** Staff receive customer media without acquiring any local device. */
export function callMicrophoneError(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Microphone access was blocked by the browser or device. The call can continue without it.";
  if (name === "NotFoundError") return "No microphone was found. Connect a microphone and try again; the call can continue without it.";
  if (name === "NotReadableError" || name === "AbortError") return "Your microphone could not start. Close other apps using it, check your device’s microphone settings, and try again.";
  if (error instanceof Error && error.message === "Call ended") return "The call changed while the microphone was starting. Tap the microphone again once connected.";
  return "The microphone could not be added to this call. Tap the microphone to try again; microphone permission may already be enabled.";
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