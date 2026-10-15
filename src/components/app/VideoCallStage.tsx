import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff, RefreshCw, Video, VideoOff, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getVideoIceServers } from "@/lib/video-call.functions";
import { isMobilePhone } from "@/lib/is-mobile-phone";
import staffPlaceholder from "@/assets/staff-video-placeholder.jpg";
import staffPlaceholderMale from "@/assets/staff-video-placeholder-male.jpg";

export { staffPlaceholder, staffPlaceholderMale };

type Side = "offerer" | "answerer";

/**
 * Full-screen two-way video call. Both sides send camera + mic; the offerer
 * starts the WebRTC negotiation once the answerer reports it is ready.
 * Signalling runs over a per-call broadcast topic. Nothing is recorded.
 * When startWithCamera is false (staff side), the camera stays off and a
 * BM Support staff illustration is shown until the user turns the camera on.
 */
export function VideoCallStage({
  topic,
  side,
  otherName,
  onHangup,
  onSuperseded,
  startWithCamera = true,
  placeholderImage = staffPlaceholder,
}: {
  topic: string;
  side: Side;
  otherName: string;
  onHangup: () => void;
  /** Called on an answerer whose call was taken over by the customer's other device. */
  onSuperseded?: () => void;
  startWithCamera?: boolean;
  /** Illustration shown while this side's camera is off (staff side). */
  placeholderImage?: string;
}) {
  const localRef = useRef<HTMLVideoElement | null>(null);
  const remoteRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const offeredRef = useRef(false);
  const facingRef = useRef<"user" | "environment">(side === "answerer" ? "environment" : "user");
  const hungRef = useRef(false);
  // Identifies this device during signalling so a customer can move the call
  // between their devices (PC → phone) without both joining at once.
  const tagRef = useRef(`${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  const activeTagRef = useRef<string | null>(null);

  // Parent callbacks change on every poll; keep them in refs so the call
  // isn't torn down and restarted (that caused the flicker/black screen).
  const onHangupRef = useRef(onHangup);
  onHangupRef.current = onHangup;
  const onSupersededRef = useRef(onSuperseded);
  onSupersededRef.current = onSuperseded;
  const [remoteMuted, setRemoteMuted] = useState(true);
  const [connected, setConnected] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(startWithCamera);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback((event: string, payload: Record<string, unknown> = {}) => {
    chRef.current?.send({ type: "broadcast", event, payload }).catch(() => {});
  }, []);

  const hangup = useCallback(() => {
    if (hungRef.current) return;
    hungRef.current = true;
    send("bye");
    onHangupRef.current();
  }, [send]);

  useEffect(() => {
    let cancelled = false;
    hungRef.current = false;

    let iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

    const createPeer = () => {
      const stream = streamRef.current;
      if (!stream) return null;
      const pc = new RTCPeerConnection({ iceServers });
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      // Staff start with the camera off (audio only). Without a video slot in
      // the offer the customer's phone camera can never be sent -> black screen.
      if (!stream.getVideoTracks().length) pc.addTransceiver("video", { direction: "sendrecv", streams: [stream] });
      if (!stream.getAudioTracks().length) pc.addTransceiver("audio", { direction: "sendrecv", streams: [stream] });
      pc.onicecandidate = (e) => {
        if (!e.candidate) return;
        send("signal", {
          kind: "candidate",
          candidate: e.candidate.toJSON(),
          ...(side === "offerer" ? { to: activeTagRef.current } : { from: tagRef.current }),
        });
      };
      pc.ontrack = (e) => {
        const v = remoteRef.current;
        const src = e.streams[0];
        if (v && src && v.srcObject !== src) {
          v.srcObject = src;
          // Try with sound (Answer was a click); if the browser blocks it,
          // play muted so the picture still shows and offer "Turn sound on".
          v.muted = false;
          v.play().then(() => setRemoteMuted(false)).catch(() => {
            v.muted = true;
            setRemoteMuted(true);
            v.play().catch(() => {});
          });
        }
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") setConnected(true);
        if (pc.connectionState === "failed") setError("The connection dropped. End the call and try again.");
      };
      pcRef.current = pc;
      return pc;
    };

    const makeOffer = async () => {
      const pc = pcRef.current;
      const to = activeTagRef.current;
      if (!pc || offeredRef.current || !to) return;
      offeredRef.current = true;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      send("signal", { kind: "offer", sdp: offer.sdp, to });
    };

    // The customer may move the call to another of their devices (PC → phone):
    // the newest "ready" wins and the previous device is told to stand down.
    const switchPeer = (tag: string) => {
      const old = activeTagRef.current;
      activeTagRef.current = tag;
      offeredRef.current = false;
      pendingIce.current = [];
      if (old) send("moved", { to: old });
      pcRef.current?.close();
      pcRef.current = null;
      if (createPeer()) void makeOffer();
    };

    const flushIce = async () => {
      const pc = pcRef.current;
      if (!pc?.remoteDescription) return;
      for (const c of pendingIce.current.splice(0)) await pc.addIceCandidate(c).catch(() => {});
    };

    (async () => {
      try {
        const r = await getVideoIceServers();
        iceServers = r.iceServers as RTCIceServer[];
      } catch { /* fall back to STUN */ }
      let stream: MediaStream;
      try {
        stream = startWithCamera
          ? await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facingRef.current } }, audio: true })
          : await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        if (!cancelled) setError(startWithCamera
          ? "Camera and microphone permission is needed for the call. Allow them in your browser and try again."
          : "Microphone permission is needed for the call. Allow it in your browser and try again.");
        return;
      }
      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      if (localRef.current) { localRef.current.srcObject = stream; localRef.current.play().catch(() => {}); }
      createPeer();

      const ch = supabase.channel(topic, { config: { broadcast: { self: false } } });
      chRef.current = ch;
      ch.on("broadcast", { event: "ping" }, () => { if (side === "answerer") send("ready", { tag: tagRef.current }); });
      ch.on("broadcast", { event: "ready" }, ({ payload }) => {
        if (side !== "offerer") return;
        const tag = (payload as { tag?: string }).tag;
        if (!tag) return;
        if (!activeTagRef.current) {
          activeTagRef.current = tag;
          makeOffer().catch(() => {});
        } else if (tag !== activeTagRef.current) {
          switchPeer(tag);
        }
      });
      ch.on("broadcast", { event: "bye" }, () => { if (!hungRef.current) { hungRef.current = true; onHangupRef.current(); } });
      ch.on("broadcast", { event: "moved" }, ({ payload }) => {
        if (side !== "answerer" || hungRef.current) return;
        const to = (payload as { to?: string }).to;
        if (to !== tagRef.current) return;
        hungRef.current = true;
        onSupersededRef.current?.();
      });
      ch.on("broadcast", { event: "signal" }, async ({ payload }) => {
        const p = payload as { kind: string; sdp?: string; candidate?: RTCIceCandidateInit; to?: string; from?: string };
        const cur = pcRef.current;
        if (!cur) return;
        if (side === "answerer" && p.to && p.to !== tagRef.current) return;
        if (side === "offerer" && p.from && p.from !== activeTagRef.current) return;
        try {
          if (p.kind === "offer" && p.sdp && side === "answerer") {
            await cur.setRemoteDescription({ type: "offer", sdp: p.sdp });
            const answer = await cur.createAnswer();
            await cur.setLocalDescription(answer);
            send("signal", { kind: "answer", sdp: answer.sdp, from: tagRef.current });
            await flushIce();
          } else if (p.kind === "answer" && p.sdp && side === "offerer") {
            await cur.setRemoteDescription({ type: "answer", sdp: p.sdp });
            await flushIce();
          } else if (p.kind === "candidate" && p.candidate) {
            if (cur.remoteDescription) await cur.addIceCandidate(p.candidate).catch(() => {});
            else pendingIce.current.push(p.candidate);
          }
        } catch { /* ignore bad signal */ }
      });
      ch.subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        if (side === "offerer") send("ping");
        else send("ready", { tag: tagRef.current });
      });
    })();

    // Keep pinging until connected, in case the other side joined late.
    const retry = window.setInterval(() => {
      if (pcRef.current?.connectionState === "connected") return;
      if (side === "offerer" && !offeredRef.current) send("ping");
      if (side === "answerer" && !pcRef.current?.remoteDescription) send("ready", { tag: tagRef.current });
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(retry);
      pcRef.current?.close();
      pcRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (chRef.current) { supabase.removeChannel(chRef.current); chRef.current = null; }
      offeredRef.current = false;
      pendingIce.current = [];
    };
  }, [topic, side, send, startWithCamera]);

  const toggleMic = () => {
    const t = streamRef.current?.getAudioTracks()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    setMicOn(t.enabled);
  };
  const toggleCam = async () => {
    const stream = streamRef.current;
    const existing = stream?.getVideoTracks()[0];
    if (existing) {
      existing.enabled = !existing.enabled;
      setCamOn(existing.enabled);
      return;
    }
    // Camera was never started (staff side) — acquire it on demand.
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facingRef.current }, audio: false });
      const track = fresh.getVideoTracks()[0];
      if (!stream || !track) return;
      stream.addTrack(track);
      const slot = pcRef.current?.getTransceivers().find((t) => t.receiver.track.kind === "video");
      if (slot) await slot.sender.replaceTrack(track);
      if (localRef.current) { localRef.current.srcObject = stream; localRef.current.play().catch(() => {}); }
      setCamOn(true);
    } catch {
      setError("Couldn't turn the camera on. Allow camera permission in your browser and try again.");
    }
  };
  const flip = async () => {
    if (!streamRef.current?.getVideoTracks()[0]) return;
    const next = facingRef.current === "user" ? "environment" : "user";
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({ video: { facingMode: next }, audio: false });
      const newTrack = fresh.getVideoTracks()[0];
      const sender = pcRef.current?.getSenders().find((s) => s.track?.kind === "video");
      await sender?.replaceTrack(newTrack);
      const stream = streamRef.current;
      stream?.getVideoTracks().forEach((t) => { stream.removeTrack(t); t.stop(); });
      stream?.addTrack(newTrack);
      newTrack.enabled = camOn;
      facingRef.current = next;
      if (localRef.current && stream) localRef.current.srcObject = stream;
    } catch {
      setError("Couldn't switch camera on this device.");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background">
      <div className="flex items-center justify-center gap-2 bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground">
        <span className="size-2 animate-pulse rounded-full bg-destructive-foreground" /> Live video call with {otherName} — not recorded
      </div>
      <div className="relative min-h-0 flex-1 bg-muted">
        <video ref={remoteRef} playsInline autoPlay className="h-full w-full object-contain" />
        {connected && remoteMuted && (
          <button
            type="button"
            onClick={() => { setRemoteMuted(false); const v = remoteRef.current; if (v) { v.muted = false; v.play().catch(() => {}); } }}
            className="absolute left-3 top-3 z-10 rounded-full bg-background/85 px-3 py-1.5 text-xs font-semibold text-foreground shadow"
          >
            Turn sound on
          </button>
        )}
        {!connected && !error && (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground">
            <div className="flex flex-col items-center gap-2 text-sm"><Loader2 className="size-6 animate-spin" /> Connecting to {otherName}…</div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-foreground">{error}</div>
        )}
        {camOn ? (
          <video
            ref={localRef}
            playsInline
            autoPlay
            muted
            className="absolute bottom-3 right-3 h-32 w-24 rounded-lg border border-border bg-card object-cover shadow-lg sm:h-44 sm:w-32"
          />
        ) : (
          <div className="absolute bottom-3 right-3 flex h-32 w-24 flex-col items-center justify-end overflow-hidden rounded-lg border border-border bg-card shadow-lg sm:h-44 sm:w-32">
            <img src={placeholderImage} alt="BM Support staff" loading="lazy" width={512} height={768} className="h-full w-full object-cover" />
            <span className="absolute inset-x-0 bottom-0 bg-background/70 px-1 py-0.5 text-center text-[10px] font-medium text-foreground">Camera off</span>
          </div>
        )}
      </div>
      <div className="flex items-center justify-center gap-3 border-t border-border bg-card px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button type="button" onClick={toggleMic} aria-label={micOn ? "Mute microphone" : "Unmute microphone"} className={`grid size-12 place-items-center rounded-full ${micOn ? "bg-secondary text-secondary-foreground" : "bg-destructive text-destructive-foreground"}`}>
          {micOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
        </button>
        {isMobilePhone() && (
          <>
            <button type="button" onClick={toggleCam} aria-label={camOn ? "Turn camera off" : "Turn camera on"} className={`grid size-12 place-items-center rounded-full ${camOn ? "bg-secondary text-secondary-foreground" : "bg-destructive text-destructive-foreground"}`}>
              {camOn ? <Video className="size-5" /> : <VideoOff className="size-5" />}
            </button>
            <button type="button" onClick={flip} aria-label="Flip camera" className="grid size-12 place-items-center rounded-full bg-secondary text-secondary-foreground">
              <RefreshCw className="size-5" />
            </button>
          </>
        )}
        <button type="button" onClick={hangup} aria-label="End call" className="grid size-14 place-items-center rounded-full bg-destructive text-destructive-foreground">
          <PhoneOff className="size-6" />
        </button>
      </div>
    </div>
  );
}
