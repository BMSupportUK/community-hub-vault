import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Video, Send, PhoneOff, MessageSquareText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  endLiveHelpStaff,
  getLiveHelpStaff,
  joinLiveHelp,
  listOrderLiveHelp,
  sendLiveHelpChatStaff,
  sendLiveHelpWhatsAppInvite,
} from "@/lib/live-help.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Session = {
  id: string;
  status: "waiting" | "live" | "ended" | "expired";
  requestedAt: string;
  joinedAt: string | null;
  endedAt: string | null;
  staffNote: string | null;
};
type Msg = { id: string; sender: string; content: string; created_at: string };

const RTC_CONFIG: RTCConfiguration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

/**
 * Staff side of a live "Show Us" session, shown on the order's secure admin
 * page. Staff watch the customer's phone camera, drop a pointer on the view,
 * chat, and end the session with a note.
 */
export function LiveHelpStaff({ orderId }: { orderId: string }) {
  const list = useServerFn(listOrderLiveHelp);
  const join = useServerFn(joinLiveHelp);
  const poll = useServerFn(getLiveHelpStaff);
  const sendChat = useServerFn(sendLiveHelpChatStaff);
  const endFn = useServerFn(endLiveHelpStaff);
  const whatsappInvite = useServerFn(sendLiveHelpWhatsAppInvite);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [active, setActive] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [waPhone, setWaPhone] = useState("");
  const [waOpen, setWaOpen] = useState(false);
  const [connected, setConnected] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const activeRef = useRef<Session | null>(null);
  activeRef.current = active;

  const broadcast = useCallback((event: string, payload: Record<string, unknown>) => {
    channelRef.current?.send({ type: "broadcast", event, payload }).catch(() => {});
  }, []);

  const teardown = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setConnected(false);
  }, []);

  // Poll sessions for this order.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const r = await list({ data: { orderId } }).catch(() => null);
      if (cancelled || !r) return;
      setSessions(r.sessions);
      const cur = activeRef.current;
      if (cur) {
        const fresh = r.sessions.find((s) => s.id === cur.id);
        if (fresh && (fresh.status === "ended" || fresh.status === "expired")) {
          teardown();
          setActive(null);
          setMessages([]);
        } else if (fresh) {
          setActive(fresh);
        }
      }
    };
    tick();
    const id = window.setInterval(tick, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [list, orderId, teardown]);

  // Poll chat while in a session.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const tick = async () => {
      const r = await poll({ data: { sessionId: active.id } }).catch(() => null);
      if (cancelled || !r) return;
      setMessages(r.messages);
    };
    tick();
    const id = window.setInterval(tick, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [active?.id, poll]);

  // Signalling channel while in a session.
  useEffect(() => {
    if (!active) return;
    const ch = supabase.channel(`live-help-${active.id}`);
    channelRef.current = ch;
    ch.on("broadcast", { event: "signal" }, ({ payload }) => {
      const p = payload as { kind: string; sdp?: string; candidate?: RTCIceCandidateInit };
      if (p.kind === "offer" && p.sdp) {
        (async () => {
          const pc = new RTCPeerConnection(RTC_CONFIG);
          pcRef.current = pc;
          pc.onicecandidate = (e) => {
            if (e.candidate) broadcast("signal", { kind: "candidate", candidate: e.candidate.toJSON() });
          };
          pc.ontrack = (e) => {
            if (videoRef.current && e.streams[0]) {
              videoRef.current.srcObject = e.streams[0];
              videoRef.current.play().catch(() => {});
              setConnected(true);
            }
          };
          await pc.setRemoteDescription({ type: "offer", sdp: p.sdp! });
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          broadcast("signal", { kind: "answer", sdp: answer.sdp });
        })().catch(() => toast.error("Couldn't connect to the customer's camera"));
      } else if (p.kind === "candidate" && p.candidate) {
        pcRef.current?.addIceCandidate(p.candidate).catch(() => {});
      }
    });
    ch.on("broadcast", { event: "end" }, () => {
      teardown();
      setActive(null);
      setMessages([]);
    });
    ch.on("broadcast", { event: "chat" }, () => {
      poll({ data: { sessionId: active.id } })
        .then((r) => setMessages(r.messages))
        .catch(() => {});
    });
    ch.subscribe();
    return () => {
      supabase.removeChannel(ch);
      if (channelRef.current === ch) channelRef.current = null;
    };
  }, [active?.id, broadcast, poll, teardown]);

  useEffect(() => () => teardown(), [teardown]);

  const joinSession = async (s: Session) => {
    setBusy(true);
    try {
      const r = await join({ data: { sessionId: s.id } });
      setActive(r.session);
      // Tell the customer to start their camera.
      window.setTimeout(() => broadcast("join", {}), 800);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't join the session");
    } finally {
      setBusy(false);
    }
  };

  const endSession = async () => {
    const s = activeRef.current;
    if (!s) return;
    broadcast("end", {});
    teardown();
    setActive(null);
    setMessages([]);
    try {
      await endFn({ data: { sessionId: s.id, note: note.trim() || undefined } });
      setNote("");
      toast.success("Session ended");
    } catch {
      toast.error("Couldn't save the session end — please try again");
    }
    const r = await list({ data: { orderId } }).catch(() => null);
    if (r) setSessions(r.sessions);
  };

  const send = async () => {
    const s = activeRef.current;
    const text = draft.trim();
    if (!s || !text) return;
    setDraft("");
    await sendChat({ data: { sessionId: s.id, content: text } }).catch(() => toast.error("Message failed"));
    broadcast("chat", {});
    const r = await poll({ data: { sessionId: s.id } }).catch(() => null);
    if (r) setMessages(r.messages);
  };

  const inviteWhatsApp = async () => {
    setBusy(true);
    try {
      await whatsappInvite({ data: { orderId, phone: waPhone.trim() } });
      toast.success("WhatsApp invite sent");
      setWaOpen(false);
      setWaPhone("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send the WhatsApp invite");
    } finally {
      setBusy(false);
    }
  };

  // Tap the video to drop a pointer the customer sees.
  const dropPointer = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    broadcast("pointer", {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    });
  };

  const waiting = sessions.find((s) => s.status === "waiting");
  const past = sessions.filter((s) => s.status === "ended" || s.status === "expired").slice(0, 5);

  return (
    <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold flex items-center gap-2">
          <Video className="size-5 text-primary" /> Live Help
        </h2>
        <Button size="sm" variant="secondary" onClick={() => setWaOpen((v) => !v)}>
          <MessageSquareText className="size-4" /> Invite via WhatsApp
        </Button>
      </div>

      {waOpen && (
        <div className="rounded-lg border border-border bg-background p-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            Send the customer a WhatsApp message with their secure page link. Enter their number in
            international format, digits only (e.g. 447700900123).
          </p>
          <div className="flex gap-2">
            <input
              value={waPhone}
              onChange={(e) => setWaPhone(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="447700900123"
              className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm font-mono"
            />
            <Button size="sm" onClick={inviteWhatsApp} disabled={busy || waPhone.length < 7}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Send"}
            </Button>
          </div>
        </div>
      )}

      {!active && waiting && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-400/40 bg-amber-500/10 p-3">
          <p className="text-sm font-semibold text-amber-200">
            Customer is waiting for live help — requested {new Date(waiting.requestedAt).toLocaleTimeString()}
          </p>
          <Button size="sm" onClick={() => joinSession(waiting)} disabled={busy} className="bg-gradient-primary text-primary-foreground">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Video className="size-4" />} Join
          </Button>
        </div>
      )}

      {!active && !waiting && (
        <p className="text-sm text-muted-foreground">
          No live help session right now. When the customer presses "Get Live Help" on their secure page, it
          appears here.
        </p>
      )}

      {active && (
        <div className="space-y-3">
          <div
            className="relative aspect-video w-full cursor-crosshair overflow-hidden rounded-xl bg-black"
            onClick={dropPointer}
            title="Tap to show the customer where to press"
          >
            <video ref={videoRef} playsInline className="h-full w-full object-contain" />
            {!connected && (
              <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
                <span className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" /> Connecting to the customer's camera…
                </span>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Tap the video to drop a pointer the customer sees on their screen.</p>

          <div className="rounded-lg border border-border">
            <div className="max-h-44 overflow-y-auto p-3 space-y-2">
              {messages.map((m) => (
                <p key={m.id} className={`text-xs rounded-lg px-2.5 py-1.5 ${m.sender === "staff" ? "bg-primary/15 ml-6" : "bg-surface-2 mr-6"}`}>
                  {m.content}
                </p>
              ))}
              {messages.length === 0 && <p className="text-xs text-muted-foreground">No messages yet.</p>}
            </div>
            <div className="flex items-center gap-2 border-t border-border p-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Message the customer…"
                className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm"
              />
              <Button size="icon" onClick={send} disabled={!draft.trim()} className="size-9 shrink-0">
                <Send className="size-4" />
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note for the order (optional) — what was the problem?"
              className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm"
            />
            <Button variant="destructive" onClick={endSession}>
              <PhoneOff className="size-4" /> End session
            </Button>
          </div>
        </div>
      )}

      {past.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Recent sessions</p>
          {past.map((s) => (
            <div key={s.id} className="rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{s.status === "expired" ? "Expired" : "Ended"}</span> ·{" "}
              {new Date(s.requestedAt).toLocaleString()}
              {s.staffNote ? ` — ${s.staffNote}` : ""}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
