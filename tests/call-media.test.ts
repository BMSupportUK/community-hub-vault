import { expect, test } from "bun:test";
import { attachCallMicrophone, callMicrophoneError, initialCallMedia } from "../src/lib/call-media";

test("staff connect without requesting microphone or camera permission", async () => {
  let requests = 0;
  const stream = {} as MediaStream;
  const result = await initialCallMedia(false, "user", { getUserMedia: async () => { requests++; throw new Error("Permission denied"); } }, () => stream);
  expect(result).toBe(stream);
  expect(requests).toBe(0);
});

test("staff voice attaches to the existing audio slot only on request", async () => {
  const constraints: MediaStreamConstraints[] = [];
  const track = { enabled: false } as MediaStreamTrack;
  let sent: MediaStreamTrack | null = null;
  let added: MediaStreamTrack | null = null;
  const pc = { connectionState: "connected", getTransceivers: () => [{ receiver: { track: { kind: "audio" } }, sender: { replaceTrack: async (t: MediaStreamTrack) => { sent = t; } } }] } as unknown as RTCPeerConnection;
  const stream = { addTrack: (t: MediaStreamTrack) => { added = t; } } as MediaStream;
  await attachCallMicrophone(pc, stream, { getUserMedia: async (c) => { constraints.push(c ?? {}); return { getAudioTracks: () => [track], getTracks: () => [track] } as MediaStream; } });
  expect(constraints).toEqual([{ audio: true, video: false }]);
  expect(sent).toBe(track);
  expect(added).toBe(track);
  expect(track.enabled).toBe(true);
});

test("denied staff microphone does not close the call", async () => {
  let closed = false;
  const pc = { connectionState: "connected", close: () => { closed = true; }, getTransceivers: () => [{ receiver: { track: { kind: "audio" } } }] } as unknown as RTCPeerConnection;
  await expect(attachCallMicrophone(pc, {} as MediaStream, { getUserMedia: async () => { throw new Error("Permission denied"); } })).rejects.toThrow("Permission denied");
  expect(closed).toBe(false);
});

test("a busy enabled microphone is distinguished from denied access", () => {
  expect(callMicrophoneError(new DOMException("Device busy", "NotReadableError"))).toContain("in use by another app");
  expect(callMicrophoneError(new DOMException("Denied", "NotAllowedError"))).toContain("blocked");
  expect(callMicrophoneError(new DOMException("Track failed", "InvalidModificationError"))).not.toContain("blocked");
});