import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Video, VideoOff, Send, PhoneOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { endLiveHelpCustomer, getLiveHelp, sendLiveHelpChat, startLiveHelp } from "@/lib/live-help.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Session = { id: string; status: "waiting" | "live" | "ended" | "expired" };
type Msg = { id: string; sender: string; content: string; created_at: string };

const RTC_CONFIG: RTCConfiguration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

/**
 * Customer side of a live "Show Us" session: they point their phone camera at
 * their device and staff watch. Video is peer-to-peer WebRTC signalled over a
 * per-session broadcast channel — never recorded or stored.
 */
export function LiveHelpCustomer({ token, password }: { token: string; password: string }) {
  const start = useServerFn(startLiveHelp);
  const poll = useServerFn(getLiveHelp);
  const sendChat = useServerFn(sendLiveHelpChat);
  const endFn = useServerFn(endLiveHelpCustomer);

  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;

  const teardown = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  const broadcast = useCallback((event: string, payload: Record<string, unknown>) => {
    channelRef.current?.send({ type: "broadcast", event, payload }).catch(() => {});
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      const pc = new RTCPeerConnection(RTC_CONFIG);
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      pc.onicecandidate = (e) => {
        if (e.candidate) broadcast("signal", { kind: "candidate", candidate: e.candidate.toJSON() });
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      broadcast("signal", { kind: "offer", sdp: offer.sdp });
      setCameraError(null);
    } catch {
      setCameraError("Camera permission was refused — allow the camera and press Get Live Help again.");
      toast.error("Camera permission is needed for live help");
    }
  }, [broadcast]);

  const stop = useCallback(async () => {
    const s = sessionRef.current;
    broadcast("end", {});
    teardown();
    setSession(null);
    setMessages([]);
    if (s) await endFn({ data: { token, password, sessionId: s.id } }).catch(() => undefined);
  }, [broadcast, teardown, endFn, token, password]);

  // Request a session.
  const request = async () => {
    setBusy(true);
    try {
      const r = await start({ data: { token, password } });
      if (r.ok) setSession(r.session);
      else toast.error("Couldn't start live help — please try again");
    } catch {
      toast.error("Couldn't start live help — please try again");
    } finally {
      setBusy(false);
    }
  };

  // Poll session state + chat while a session is open.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const tick = async () => {
      const r = await poll({ data: { token, password } }).catch(() => null);
      if (cancelled || !r || !r.ok) return;
      if (!r.session) {
        setSession(null);
        setMessages([]);
        teardown();
        return;
      }
      setSession(r.session);
      setMessages(r.messages);
      if (r.session.status === "ended" || r.session.status === "expired") {
        teardown();
        setSession(null);
        setMessages([]);
      }
    };
    tick();
    const id = window.setInterval(tick, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [session?.id, poll, token, password, teardown]);

  // Broadcast channel for WebRTC signalling + pointer + end.
  useEffect(() => {
    if (!session) return;
    const ch = supabase.channel(`live-help-${session.id}`);
    channelRef.current = ch;
    ch.on("broadcast", { event: "signal" }, ({ payload }) => {
      const pc = pcRef.current;
      if (!pc || !payload) return;
      const p = payload as { kind: string; sdp?: string; candidate?: RTCIceCandidateInit };
      if (p.kind === "answer" && p.sdp) {
        pc.setRemoteDescription({ type: "answer", sdp: p.sdp }).catch(() => {});
      } else if (p.kind === "candidate" && p.candidate) {
        pc.addIceCandidate(p.candidate).catch(() => {});
      } else if (p.kind === "offer") {
        // Staff restarted — ignore, customer is always the offerer.
      }
    });
    ch.on("broadcast", { event: "join" }, () => {
      if (!streamRef.current) startCamera();
    });
    ch.on("broadcast", { event: "pointer" }, ({ payload }) => {
      const p = payload as { x: number; y: number };
      setPointer({ x: p.x, y: p.y });
      window.setTimeout(() => setPointer(null), 2500);
    });
    ch.on("broadcast", { event: "end" }, () => {
      teardown();
      setSession(null);
      setMessages([]);
    });
    ch.subscribe();
    return () => {
      supabase.removeChannel(ch);
      if (channelRef.current === ch) channelRef.current = null;
    };
  }, [session?.id, startCamera, teardown]);

  // When staff joins (detected by polling), start the camera.
  useEffect(() => {
    if (session?.status === "live" && !streamRef.current) startCamera();
  }, [session?.status, startCamera]);

  // Full cleanup on unmount.
  useEffect(() => () => teardown(), [teardown]);

  const send = async () => {
    const s = sessionRef.current;
    const text = draft.trim();
    if (!s || !text) return;
    setDraft("");
    const r = await sendChat({ data: { token, password, sessionId: s.id, content: text } });
    if (r.ok) {
      broadcast("chat", {});
      const r2 = await poll({ data: { token, password } }).catch(() => null);
      if (r2?.ok && r2.session) setMessages(r2.messages);
    }
  };

  if (!session) {
    return (
      <div className="fixed bottom-24 right-4 z-40 sm:bottom-6 sm:right-24">
        <Button
          onClick={request}
          disabled={busy}
          className="rounded-full shadow-glow bg-gradient-primary text-primary-foreground h-12 px-5"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Video className="size-4" />}
          Get Live Help
        </Button>
        {cameraError && <p className="mt-2 max-w-56 text-xs text-destructive">{cameraError}</p>}
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex flex-col bg-background/95 backdrop-blur border-t border-border max-h-[70dvh]">
      {/* Red recording-style bar — always visible while a session is open. */}
      <div className="flex items-center justify-between gap-3 bg-destructive px-4 py-2 text-destructive-foreground">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <span className="size-2.5 rounded-full bg-white animate-pulse" />
          {session.status === "live" ? "Staff can see your camera" : "Waiting for a staff member to join…"}
        </p>
        <Button size="sm" variant="secondary" onClick={stop} className="shrink-0">
          <PhoneOff className="size-4" /> Stop
        </Button>
      </div>

      <div className="flex flex-1 min-h-0 flex-col sm:flex-row">
        <div className="relative flex-1 min-h-40 bg-black">
          <video ref={videoRef} muted playsInline className="h-full w-full object-contain" />
          {!streamRef.current && session.status === "live" && (
            <div className="absolute inset-0 grid place-items-center text-muted-foreground text-sm">
              <Loader2 className="size-5 animate-spin" />
            </div>
          )}
          {session.status === "waiting" && (
            <div className="absolute inset-0 grid place-items-center text-center text-sm text-muted-foreground px-6">
              <p>Keep this page open — your camera will start when a staff member joins.</p>
            </div>
          )}
          {pointer && (
            <div
              className="pointer-events-none absolute size-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-yellow-300 shadow-[0_0_20px_rgba(253,224,71,0.8)]"
              style={{ left: `${pointer.x * 100}%`, top: `${pointer.y * 100}%` }}
            />
          )}
        </div>

        <div className="flex w-full flex-col border-t border-border sm:w-72 sm:border-l sm:border-t-0">
          <div className="flex-1 min-h-24 max-h-40 overflow-y-auto p-3 space-y-2">
            {messages.length === 0 && (
              <p className="text-xs text-muted-foreground">Chat with staff here while they watch.</p>
            )}
            {messages.map((m) => (
              <p key={m.id} className={`text-xs rounded-lg px-2.5 py-1.5 ${m.sender === "customer" ? "bg-primary/15 text-foreground ml-6" : "bg-surface-2 text-foreground mr-6"}`}>
                {m.content}
              </p>
            ))}
          </div>
          <div className="flex items-center gap-2 border-t border-border p-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Type a message…"
              className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm"
            />
            <Button size="icon" onClick={send} disabled={!draft.trim()} className="size-9 shrink-0">
              <Send className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      {session.status === "ended" && (
        <p className="px-4 py-2 text-xs text-muted-foreground flex items-center gap-1.5">
          <VideoOff className="size-3.5" /> This session has ended.
        </p>
      )}
    </div>
  );
}
