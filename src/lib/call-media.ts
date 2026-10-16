/** Staff receive customer media without acquiring any local device. */
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