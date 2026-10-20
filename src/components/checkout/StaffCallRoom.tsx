import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { LifeBuoy, Loader2, LogOut, Users, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getVideoIceServers } from "@/lib/video-call.functions";
import { requestVideoCallAssistance } from "@/lib/live-help.functions";
import { assistWaitSeconds, pickCallHost, type StaffCallMember } from "@/lib/video-call-access";

/**
 * Staff-only room beside a customer video call. One staff member (the host)
 * holds the real connection to the customer and passes the customer's picture
 * and sound on to every other staff member. The customer never sees this room.
 * If the host leaves, the longest-present staff member takes over the
 * customer connection, so nobody else is dropped.
 */

type Me = { userId: string; name: string; role: string };

function waitIce(pc: RTCPeerConnection) {
  return new Promise<void>((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const t = window.setTimeout(done, 2500);
    function done() { window.clearTimeout(t); pc.removeEventListener("icegatheringstatechange", check); resolve(); }
    function check() { if (pc.iceGatheringState === "complete") done(); }
    pc.addEventListener("icegatheringstatechange", check);
  });
}

export function useStaffCallRoom(sessionId: string | null, me: Me | null) {
  const [members, setMembers] = useState<StaffCallMember[]>([]);
  const [ready, setReady] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [remote, setRemote] = useState<MediaStream | null>(null);
  const hostRef = useRef(false);
  const tracksRef = useRef(new Map<string, MediaStreamTrack>());
  const pcsRef = useRef(new Map<string, { pc: RTCPeerConnection; at: number }>());
  const viewerPcRef = useRef<RTCPeerConnection | null>(null);
  const chRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const membersRef = useRef<StaffCallMember[]>([]);
  const meId = me?.userId ?? null;
  const meRef = useRef(me);
  meRef.current = me;

  useEffect(() => {
    if (!sessionId || !meId) return;
    let off = false;
    let ice: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
    getVideoIceServers().then((r) => { ice = r.iceServers as RTCIceServer[]; }).catch(() => {});
    const joinedAt = Date.now();
    const pcs = pcsRef.current;
    const ch = supabase.channel(`video-call-staff-${sessionId}`, {
      config: { presence: { key: meId }, broadcast: { self: false } },
    });
    chRef.current = ch;
    const send = (payload: Record<string, unknown>) => { ch.send({ type: "broadcast", event: "relay", payload: { ...payload, from: meId } }).catch(() => {}); };
    const track = () => {
      const m = meRef.current;
      if (m) void ch.track({ ...m, joinedAt, host: hostRef.current });
    };

    const closeRelay = (id: string) => { pcs.get(id)?.pc.close(); pcs.delete(id); };

    const offerTo = async (id: string) => {
      closeRelay(id);
      const pc = new RTCPeerConnection({ iceServers: ice });
      pcs.set(id, { pc, at: Date.now() });
      for (const kind of ["video", "audio"] as const) {
        const t = pc.addTransceiver(kind, { direction: "sendonly" });
        const cur = tracksRef.current.get(kind);
        if (cur) await t.sender.replaceTrack(cur).catch(() => {});
      }
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitIce(pc);
      if (off || pcs.get(id)?.pc !== pc) return;
      send({ kind: "offer", to: id, sdp: pc.localDescription?.sdp ?? offer.sdp });
    };

    const syncRelays = (list: StaffCallMember[]) => {
      if (!hostRef.current) {
        for (const id of [...pcs.keys()]) closeRelay(id);
        return;
      }
      const viewers = new Set(list.filter((m) => m.userId !== meId).map((m) => m.userId));
      for (const id of [...pcs.keys()]) if (!viewers.has(id)) closeRelay(id);
      for (const id of viewers) if (!pcs.has(id)) void offerTo(id).catch(() => {});
    };

    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState<StaffCallMember>();
      const list = Object.values(state).map((a) => a[0]).filter(Boolean) as StaffCallMember[];
      membersRef.current = list;
      setMembers(list);
      if (!list.some((m) => m.userId === meId)) return;
      const shouldHost = pickCallHost(list) === meId;
      if (shouldHost !== hostRef.current) {
        hostRef.current = shouldHost;
        setIsHost(shouldHost);
        if (shouldHost) { viewerPcRef.current?.close(); viewerPcRef.current = null; setRemote(null); }
        track();
      }
      setReady(true);
      syncRelays(list);
    });

    ch.on("broadcast", { event: "relay" }, async ({ payload }) => {
      const p = payload as { kind: string; to?: string; from: string; sdp?: string };
      if (p.to && p.to !== meId) return;
      try {
        if (p.kind === "offer" && p.sdp && !hostRef.current) {
          viewerPcRef.current?.close();
          const pc = new RTCPeerConnection({ iceServers: ice });
          viewerPcRef.current = pc;
          pc.ontrack = (e) => {
            setRemote((prev) => new MediaStream([...(prev?.getTracks().filter((t) => t.kind !== e.track.kind) ?? []), e.track]));
          };
          await pc.setRemoteDescription({ type: "offer", sdp: p.sdp });
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await waitIce(pc);
          if (viewerPcRef.current !== pc) return;
          send({ kind: "answer", to: p.from, sdp: pc.localDescription?.sdp ?? answer.sdp });
        } else if (p.kind === "answer" && p.sdp && hostRef.current) {
          const pc = pcs.get(p.from)?.pc;
          if (pc && pc.signalingState === "have-local-offer") await pc.setRemoteDescription({ type: "answer", sdp: p.sdp });
        } else if (p.kind === "want" && hostRef.current) {
          const cur = pcs.get(p.from);
          if (!cur || (cur.pc.connectionState !== "connected" && Date.now() - cur.at > 6000)) void offerTo(p.from).catch(() => {});
        }
      } catch { /* ignore bad signal */ }
    });

    ch.subscribe((status) => { if (status === "SUBSCRIBED") track(); });

    // Viewers keep asking for the picture until it arrives (late join, host swap).
    const retry = window.setInterval(() => {
      if (hostRef.current) return;
      const pc = viewerPcRef.current;
      if (!pc || pc.connectionState !== "connected") send({ kind: "want" });
    }, 4000);

    return () => {
      off = true;
      window.clearInterval(retry);
      for (const id of [...pcs.keys()]) closeRelay(id);
      viewerPcRef.current?.close();
      viewerPcRef.current = null;
      supabase.removeChannel(ch);
      chRef.current = null;
      hostRef.current = false;
      membersRef.current = [];
      setMembers([]);
      setReady(false);
      setIsHost(false);
      setRemote(null);
    };
  }, [sessionId, meId]);

  /** Host: a new customer track arrived — forward it to every other staff member. */
  const pushTrack = useCallback((t: MediaStreamTrack) => {
    tracksRef.current.set(t.kind, t);
    for (const { pc } of pcsRef.current.values()) {
      const tr = pc.getTransceivers().find((x) => x.receiver.track?.kind === t.kind);
      void tr?.sender.replaceTrack(t).catch(() => {});
    }
  }, []);

  /** True while at least one other staff member is still on the call. */
  const othersPresent = useCallback(() => membersRef.current.some((m) => m.userId !== meId), [meId]);

  return { members, ready, isHost, remote, pushTrack, othersPresent, sessionId, meId };
}

export type StaffCallRoom = ReturnType<typeof useStaffCallRoom>;

const ROLE_LABEL: Record<string, string> = { admin: "Admin", management: "Management", staff: "Staff" };

/** Staff-only box: who is on the call plus the admin/management help button. */
export function StaffOnCallBox({ room, requestHelp }: { room: StaffCallRoom; requestHelp?: (a: { data: { sessionId: string } }) => Promise<{ ok: boolean; waitSeconds: number }> }) {
  const askOrder = useServerFn(requestVideoCallAssistance);
  const ask = requestHelp ?? askOrder;
  const [lastAt, setLastAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (lastAt == null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [lastAt]);
  const wait = assistWaitSeconds(lastAt, now);
  const seniorJoined = lastAt != null && room.members.some((m) => (m.role === "admin" || m.role === "management") && m.userId !== room.meId && m.joinedAt >= lastAt - 5000);
  const sorted = [...room.members].sort((a, b) => a.joinedAt - b.joinedAt);

  const request = async () => {
    if (!room.sessionId) return;
    setBusy(true);
    try {
      const r = await ask({ data: { sessionId: room.sessionId } });
      const at = Date.now() - (120 - r.waitSeconds) * 1000;
      setLastAt(at);
      setNow(Date.now());
      if (r.ok) toast.success("Admin and management have been asked to join");
      else toast.message("Help was already requested on this call");
    } catch (e) {
      toast.error((e as Error).message || "Couldn't send the request");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed left-3 top-3 z-[110] w-64 max-w-[calc(100vw-1.5rem)] rounded-xl border border-border bg-card/95 p-3 text-card-foreground shadow-lg backdrop-blur-sm">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 text-left text-sm font-semibold">
        <Users className="size-4 text-primary" /> Staff on this call ({room.members.length})
        <span className="ml-auto text-xs text-muted-foreground">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <p className="text-[11px] text-muted-foreground">Only staff can see this box.</p>
          <ul className="space-y-1">
            {sorted.map((m) => (
              <li key={m.userId} className="flex items-center gap-2 text-xs">
                <span className="truncate font-medium">{m.name}{m.userId === room.meId ? " (you)" : ""}</span>
                <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px]">{ROLE_LABEL[m.role] ?? m.role}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">{new Date(m.joinedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={busy || wait > 0}
            onClick={request}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-3 animate-spin" /> : <LifeBuoy className="size-3" />}
            {seniorJoined ? "Admin/management joined" : wait > 0 ? `Help requested · waiting (${wait}s)` : "Request admin/management help"}
          </button>
        </div>
      )}
    </div>
  );
}

/** What a second (or later) staff member sees: the customer's picture passed on by the host. */
export function StaffCallViewer({ room, sessionId, onLeave, sidePanel }: { room: StaffCallRoom; sessionId: string; onLeave: () => void; sidePanel?: ReactNode }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [deg, setDeg] = useState(0);
  const [soundBlocked, setSoundBlocked] = useState(false);

  useEffect(() => {
    const s = room.remote;
    const v = videoRef.current;
    const a = audioRef.current;
    if (v) { v.srcObject = s ? new MediaStream(s.getVideoTracks()) : null; v.muted = true; v.play().catch(() => {}); }
    if (a) { a.srcObject = s ? new MediaStream(s.getAudioTracks()) : null; a.play().then(() => setSoundBlocked(false)).catch(() => setSoundBlocked(!!s?.getAudioTracks().length)); }
  }, [room.remote]);

  // Read-only: follow how the customer holds the phone so the picture is upright.
  useEffect(() => {
    const ch = supabase.channel(`video-call-${sessionId}`, { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "orient" }, ({ payload }) => {
      const d = Number((payload as { deg?: number }).deg);
      if ([0, 90, 180, 270].includes(d)) setDeg(d);
    });
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sessionId]);

  const hasVideo = !!room.remote?.getVideoTracks().length;
  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background lg:flex-row">
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="relative grid min-h-0 flex-1 place-items-center overflow-hidden bg-muted">
          <video ref={videoRef} playsInline autoPlay muted className="max-h-full max-w-full object-contain" style={{ transform: deg ? `rotate(${360 - deg}deg)` : undefined }} />
          {!hasVideo && (
            <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Connecting to the customer's picture…</span>
            </div>
          )}
          <audio ref={audioRef} autoPlay />
        </div>
        <div className="flex items-center justify-center gap-3 border-t border-border p-3">
          {soundBlocked && (
            <button type="button" onClick={() => { audioRef.current?.play().then(() => setSoundBlocked(false)).catch(() => {}); }} className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground">
              <Volume2 className="size-4" /> Turn on sound
            </button>
          )}
          <button type="button" onClick={onLeave} className="inline-flex items-center gap-2 rounded-full bg-destructive px-5 py-2 text-sm font-semibold text-destructive-foreground">
            <LogOut className="size-4" /> Leave call
          </button>
        </div>
      </div>
      {sidePanel && <div className="flex h-[40vh] min-h-0 flex-col border-t border-border lg:h-auto lg:w-96 lg:border-l lg:border-t-0">{sidePanel}</div>}
    </div>
  );
}
