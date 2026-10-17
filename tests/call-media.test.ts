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
test("an all-black customer picture is detected so the camera can be restarted", async () => {
  const { isBlackFrame } = await import("../src/lib/call-media");
  const black = new Uint8ClampedArray(32 * 24 * 4);
  expect(isBlackFrame(black)).toBe(true);
  const dim = new Uint8ClampedArray(black);
  dim.set([40, 40, 40, 255], 100 * 4);
  expect(isBlackFrame(dim)).toBe(false);
});

test("a black customer picture escalates: re-attach, camera restart, then full reconnect", async () => {
  const { nextBlackPictureFix } = await import("../src/lib/call-media");
  const fresh = { reattached: false, lastAsk: 0, lastRebuild: 0 };
  const now = 100000;
  expect(nextBlackPictureFix(1000, now, fresh)).toBe("none");
  expect(nextBlackPictureFix(2000, now, fresh)).toBe("reattach");
  expect(nextBlackPictureFix(4000, now, { ...fresh, reattached: true })).toBe("camrestart");
  expect(nextBlackPictureFix(6000, now, { ...fresh, reattached: true, lastAsk: now - 3000 })).toBe("none");
  expect(nextBlackPictureFix(10000, now, { ...fresh, reattached: true, lastAsk: now - 3000 })).toBe("rebuild");
  expect(nextBlackPictureFix(12000, now, { reattached: true, lastAsk: now - 3000, lastRebuild: now - 5000 })).toBe("none");
});

test("a rebuilt connection is recognised by its new fingerprint", async () => {
  const { sdpFingerprint } = await import("../src/lib/call-media");
  expect(sdpFingerprint("v=0\r\na=fingerprint:sha-256 AA:BB\r\n")).toBe("sha-256 aa:bb");
  expect(sdpFingerprint("v=0\r\n")).toBeNull();
});
