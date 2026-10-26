import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Eye, Gamepad2, Home, LogOut, Pause, Power, Undo2, Users, Volume1, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Nameplate } from "@/components/app/Nameplate";
import { getVideoIceServers } from "@/lib/video-call.functions";
import { normalizePairCode, sessionIdle, screenShareDestination, canForwardRemote, REMOTE_PAD_KEYS, remoteSetupNotice, type RemoteControlReport } from "@/lib/tv-remote";
import { useScreenLockKeepAlive } from "@/components/app/ScreenLockKeepAlive";
import connectingArt from "@/assets/screen-share-connecting.jpg";

export type LinkKind = "order" | "ticket";
export type Live = { id: string; topic: string; device: string; host: boolean; linkKind: LinkKind | null; linkId: string | null; hostId: string | null };
export type LiveRow = { id: string; topic: string; device_name: string; staff_id: string | null; customer_label: string | null; link_kind: string | null; link_id: string | null };

type Option = { id: string; label: string };

/** Choose which sale or ticket the TV help is for; each one has its own page. */
export function LinkPicker({ onPick, title = "Start TV help" }: { onPick: (kind: LinkKind, id: string, label: string) => void; title?: string }) {
  const [kind, setKind] = useState<LinkKind>("ticket");
  const [orders, setOrders] = useState<Option[]>([]);
  const [tickets, setTickets] = useState<Option[]>([]);
  useEffect(() => {
    void (async () => {
      const [{ data: o }, { data: t }] = await Promise.all([
        supabase.from("orders").select("id, order_ref, existing_username, shipping_name, created_at").order("created_at", { ascending: false }).limit(40),
        supabase.from("tickets").select("id, subject, status, created_at").not("status", "in", "(resolved,closed)").order("created_at", { ascending: false }).limit(40),
      ]);
      setOrders(((o ?? []) as { id: string; order_ref: string | null; existing_username: string | null; shipping_name: string | null }[])
        .map((r) => ({ id: r.id, label: `${r.order_ref ?? r.id.slice(0, 8)} · ${r.existing_username || r.shipping_name || "Customer"}` })));
      setTickets(((t ?? []) as { id: string; subject: string | null }[]).map((r) => ({ id: r.id, label: r.subject || "Ticket" })));
    })();
  }, []);
  const opts = kind === "order" ? orders : tickets;
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant={kind === "ticket" ? "default" : "secondary"} onClick={() => setKind("ticket")}>Ticket</Button>
        <Button type="button" variant={kind === "order" ? "default" : "secondary"} onClick={() => setKind("order")}>Sale</Button>
      </div>
      <select value="" onChange={(e) => { const o = opts.find((x) => x.id === e.target.value); if (o) onPick(kind, o.id, o.label); }}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
        <option value="">{kind === "order" ? "Choose the sale…" : "Choose the ticket…"}</option>
        {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </section>
  );
}

export function PairForm({ kind, linkId, onPaired }: { kind: LinkKind; linkId: string; onPaired: (l: Live) => void }) {
  const { user } = useAuth();
  const [code, setCode] = useState("");
  const [customer, setCustomer] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("claim_tv_pair_code", { _code: code, _customer: customer || undefined, _link_kind: kind, _link_id: linkId });
    setBusy(false);
    const row = Array.isArray(data) ? data[0] : null;
    if (error || !row) { toast.error(error?.message ?? "That code is wrong or has expired"); return; }
    onPaired({ id: row.id, topic: row.topic, device: row.device_name, host: true, linkKind: kind, linkId, hostId: user?.id ?? null });
  };
  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Code on the TV</span>
        <Input inputMode="numeric" autoFocus value={code} onChange={(e) => setCode(normalizePairCode(e.target.value))}
          placeholder="123456" className="h-14 text-center font-mono text-3xl tracking-[0.4em]" />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Customer username (optional, for the log)</span>
        <Input value={customer} maxLength={80} onChange={(e) => setCustomer(e.target.value)} />
      </label>
      <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>{busy ? "Connecting…" : "Connect to TV"}</Button>
    </form>
  );
}

export function LiveSessions({ kind, linkId, onJoin }: { kind?: LinkKind; linkId?: string; onJoin: (l: Live) => void }) {
  const { user } = useAuth();
  const uid = user?.id;
  const [rows, setRows] = useState<LiveRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    const load = async () => {
      let q = supabase.from("tv_remote_sessions")
        .select("id, topic, device_name, staff_id, customer_label, link_kind, link_id")
        .in("status", ["claimed", "active"]).gt("expires_at", new Date().toISOString());
      if (kind && linkId) q = q.eq("link_kind", kind).eq("link_id", linkId);
      const { data } = await q.order("claimed_at", { ascending: false });
      const list = ((data ?? []) as LiveRow[]).filter((r) => r.staff_id && r.staff_id !== uid);
      setRows(list);
      const ids = [...new Set(list.flatMap((r) => r.staff_id ? [r.staff_id] : []))];
      if (ids.length) {
        const { data: p } = await supabase.from("profiles").select("id, username").in("id", ids);
        setNames(Object.fromEntries((p ?? []).map((x) => [x.id, x.username ?? "Staff"])));
      }
    };
    void load();
    const t = window.setInterval(load, 5000);
    return () => window.clearInterval(t);
  }, [uid, kind, linkId]);
  return (
    <section className="rounded-2xl border bg-card p-6 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><Eye className="h-5 w-5" />Live TV sessions</h2>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">No other staff are on a TV {kind ? "for this one" : "right now"}.</p> : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 rounded-xl border p-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{r.device_name}{r.customer_label ? ` · ${r.customer_label}` : ""}</p>
                <p className="text-xs text-muted-foreground">{(r.staff_id ? names[r.staff_id] : null) ?? "Staff"} is dealing with it · {r.link_kind === "order" ? "Sale" : r.link_kind === "ticket" ? "Ticket" : "No chat"}</p>
              </div>
              <Button size="sm" onClick={() => onJoin({ id: r.id, topic: r.topic, device: r.device_name, host: false, linkKind: (r.link_kind as LinkKind) ?? null, linkId: r.link_id, hostId: r.staff_id })}>Watch</Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type Viewer = { id: string; username: string; nameplate: string | null; host: boolean };

/**
 * The TV streams to one staff member (the host). The host relays that picture
 * to other staff over a staff-only topic, so the TV app needs no changes.
 */
export function RemoteSession({ live, onEnd }: { live: Live; onEnd: () => void }) {
  useScreenLockKeepAlive();
  const { user } = useAuth();
  const me = user?.id ?? null;
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const [tvState, setTvState] = useState<"waiting" | "allowed" | "declined" | "gone">(live.host ? "waiting" : "allowed");
  const [hasVideo, setHasVideo] = useState(false);
  const [firstFrame, setFirstFrame] = useState(false);
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const chan = useRef<RealtimeChannel | null>(null);
  const staffChan = useRef<RealtimeChannel | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const relays = useRef(new Map<string, RTCPeerConnection>());
  const stream = useRef<MediaStream | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const lastActivity = useRef(new Date());
  const ended = useRef(false);
  const [control, setControl] = useState<ControlState | null>(null);
  const [noReport, setNoReport] = useState(false);
  const [controller, setController] = useState<string | null>(null);
  const controlRef = useRef<ControlState | null>(null);
  const controllerRef = useRef<string | null>(null);

  // Host: share who is in control and what the TV supports with the other staff.
  const shareControl = useCallback(() => {
    staffChan.current?.send({ type: "broadcast", event: "control_state", payload: { control: controlRef.current, controller: controllerRef.current } });
  }, []);
  const setControllerId = useCallback((id: string | null) => {
    controllerRef.current = id; setController(id); shareControl();
  }, [shareControl]);
  useEffect(() => { if (live.host && me && !controllerRef.current) setControllerId(me); }, [live.host, me, setControllerId]);

  const sendRemote = useCallback((ev: RemoteEvent, payload: Record<string, unknown>) => {
    lastActivity.current = new Date();
    if (live.host) {
      if (canForwardRemote(controllerRef.current, me)) chan.current?.send({ type: "broadcast", event: ev, payload });
    } else {
      staffChan.current?.send({ type: "broadcast", event: "rc", payload: { from: me, ev, payload } });
    }
  }, [live.host, me]);
  const takeControl = useCallback(() => {
    if (!me) return;
    if (live.host) setControllerId(me);
    else staffChan.current?.send({ type: "broadcast", event: "take_control", payload: { from: me } });
  }, [live.host, me, setControllerId]);

  const end = useCallback(async (reason?: string) => {
    if (ended.current) return;
    ended.current = true;
    if (live.host) {
      chan.current?.send({ type: "broadcast", event: "end", payload: {} });
      staffChan.current?.send({ type: "broadcast", event: "host_end", payload: {} });
      await supabase.rpc("end_tv_session", { _id: live.id });
    }
    if (reason) toast.info(reason);
    onEndRef.current();
  }, [live.id, live.host]);

  // Host only: relay the TV picture to one watching staff member.
  const relayTo = useCallback(async (viewerId: string) => {
    const s = stream.current; const ch = staffChan.current;
    if (!live.host || !s || !ch) return;
    relays.current.get(viewerId)?.close();
    const { iceServers } = await getVideoIceServers();
    const peer = new RTCPeerConnection({ iceServers });
    relays.current.set(viewerId, peer);
    s.getTracks().forEach((t) => peer.addTrack(t, s));
    peer.onicecandidate = (ev) => { if (ev.candidate) ch.send({ type: "broadcast", event: "r_ice", payload: { to: viewerId, from: "host", candidate: ev.candidate.toJSON() } }); };
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    ch.send({ type: "broadcast", event: "r_offer", payload: { to: viewerId, sdp: offer.sdp } });
  }, [live.host]);

  // TV link (host only).
  useEffect(() => {
    if (!live.host) return;
    let cancelled = false;
    const channel = supabase.channel(live.topic, { config: { broadcast: { self: false } } });
    chan.current = channel;
    const setupPeer = async (sdp: string) => {
      const { iceServers } = await getVideoIceServers();
      if (cancelled) return;
      pc.current?.close();
      const peer = new RTCPeerConnection({ iceServers });
      pc.current = peer;
      peer.ontrack = (ev) => {
        const s = ev.streams[0] ?? new MediaStream([ev.track]);
        stream.current = s;
        if (video.current) video.current.srcObject = s;
        setHasVideo(true);
        staffChan.current?.send({ type: "broadcast", event: "host_ready", payload: {} });
      };
      peer.onicecandidate = (ev) => {
        if (ev.candidate) channel.send({ type: "broadcast", event: "ice", payload: { from: "staff", candidate: ev.candidate.toJSON() } });
      };
      await peer.setRemoteDescription({ type: "offer", sdp });
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      channel.send({ type: "broadcast", event: "answer", payload: { sdp: answer.sdp } });
    };
    channel
      .on("broadcast", { event: "state" }, ({ payload }) => {
        const s = payload?.consent;
        if (s === "allowed" || s === "declined" || s === "waiting") setTvState(s);
        if (s === "declined") void end("The customer declined on the TV.");
      })
      .on("broadcast", { event: "offer" }, ({ payload }) => {
        if (typeof payload?.sdp !== "string") return;
        // An offer proves the TV has allowed and joined; its earlier messages may have been missed.
        setTvState("allowed");
        if (!controlRef.current) channel.send({ type: "broadcast", event: "control_req", payload: {} });
        void setupPeer(payload.sdp);
      })
      .on("broadcast", { event: "ice" }, ({ payload }) => {
        if (payload?.from === "tv" && payload.candidate) pc.current?.addIceCandidate(payload.candidate).catch(() => {});
      })
      .on("broadcast", { event: "screen_off" }, () => setHasVideo(false))
      .on("broadcast", { event: "control" }, ({ payload }) => {
        const c = parseControl(payload);
        controlRef.current = c; setControl(c); setNoReport(false); shareControl();
      })
      .on("broadcast", { event: "end" }, () => { setTvState("gone"); void end("The TV ended the session."); })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          channel.send({ type: "broadcast", event: "hello", payload: {} });
          channel.send({ type: "broadcast", event: "control_req", payload: {} });
        }
      });
    // The TV may join after us, so keep asking what it supports until it answers.
    let asks = 0;
    const ask = window.setInterval(() => {
      if (controlRef.current) return;
      asks += 1;
      channel.send({ type: "broadcast", event: "control_req", payload: {} });
      if (asks >= 5) setNoReport(true);
    }, 3000);
    return () => { cancelled = true; window.clearInterval(ask); pc.current?.close(); supabase.removeChannel(channel); };
  }, [live.topic, live.host, end, shareControl]);

  // Staff-only room: presence (staff card) + picture relay.
  useEffect(() => {
    if (!me) return;
    let cancelled = false;

    const ch = supabase.channel(`${live.topic}:staff`, { config: { broadcast: { self: false }, presence: { key: me } } });
    staffChan.current = ch;
    let viewerPeer: RTCPeerConnection | null = null;
    const st = () => new Set(Object.keys(ch.presenceState()));
    ch.on("presence", { event: "sync" }, () => {
      const st = ch.presenceState<Viewer>();
      const list = Object.values(st).map((v) => v[0]).filter(Boolean) as Viewer[];
      list.sort((a, b) => Number(b.host) - Number(a.host));
      setViewers(list);
      if (live.host) for (const id of [...relays.current.keys()]) if (!st[id]) { relays.current.get(id)?.close(); relays.current.delete(id); }
      if (live.host && controllerRef.current && !st[controllerRef.current] && me) setControllerId(me);
    })
      .on("broadcast", { event: "watch" }, ({ payload }) => { if (live.host && typeof payload?.from === "string") { void relayTo(payload.from); shareControl(); } })
      .on("broadcast", { event: "control_state" }, ({ payload }) => {
        if (live.host) return;
        setControl(parseControl(payload?.control));
        setController(typeof payload?.controller === "string" ? payload.controller : null);
      })
      .on("broadcast", { event: "take_control" }, ({ payload }) => {
        if (live.host && typeof payload?.from === "string" && st().has(payload.from)) setControllerId(payload.from);
      })
      .on("broadcast", { event: "rc" }, ({ payload }) => {
        if (!live.host || !canForwardRemote(controllerRef.current, typeof payload?.from === "string" ? payload.from : null)) return;
        const ev = payload?.ev as RemoteEvent;
        const clean = cleanRemote(ev, payload?.payload);
        if (clean) chan.current?.send({ type: "broadcast", event: ev, payload: clean });
      })
      .on("broadcast", { event: "host_ready" }, () => { if (!live.host) ch.send({ type: "broadcast", event: "watch", payload: { from: me } }); })
      .on("broadcast", { event: "host_end" }, () => { if (!live.host) void end("The staff member dealing with it ended the session."); })
      .on("broadcast", { event: "r_offer" }, async ({ payload }) => {
        if (live.host || payload?.to !== me || typeof payload.sdp !== "string") return;
        const { iceServers } = await getVideoIceServers();
        if (cancelled) return;
        viewerPeer?.close();
        const peer = new RTCPeerConnection({ iceServers });
        viewerPeer = peer; pc.current = peer;
        peer.ontrack = (ev) => {
          if (video.current) video.current.srcObject = ev.streams[0] ?? new MediaStream([ev.track]);
          setHasVideo(true);
        };
        peer.onicecandidate = (ev) => { if (ev.candidate) ch.send({ type: "broadcast", event: "r_ice", payload: { to: "host", from: me, candidate: ev.candidate.toJSON() } }); };
        await peer.setRemoteDescription({ type: "offer", sdp: payload.sdp });
        const ans = await peer.createAnswer();
        await peer.setLocalDescription(ans);
        ch.send({ type: "broadcast", event: "r_answer", payload: { from: me, sdp: ans.sdp } });
      })
      .on("broadcast", { event: "r_answer" }, ({ payload }) => {
        if (!live.host || typeof payload?.from !== "string") return;
        relays.current.get(payload.from)?.setRemoteDescription({ type: "answer", sdp: payload.sdp }).catch(() => {});
      })
      .on("broadcast", { event: "r_ice" }, ({ payload }) => {
        if (!payload?.candidate) return;
        if (live.host && payload.to === "host") relays.current.get(payload.from)?.addIceCandidate(payload.candidate).catch(() => {});
        if (!live.host && payload.to === me) viewerPeer?.addIceCandidate(payload.candidate).catch(() => {});
      })
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;
        const { data: p } = await supabase.from("profiles").select("username, equipped_nameplate_id").eq("id", me).maybeSingle();
        await ch.track({ id: me, username: p?.username ?? "Staff", nameplate: p?.equipped_nameplate_id ?? null, host: live.host });
        if (!live.host) ch.send({ type: "broadcast", event: "watch", payload: { from: me } });
      });
    return () => {
      cancelled = true;
      viewerPeer?.close();
      relays.current.forEach((p) => p.close()); relays.current.clear();
      supabase.removeChannel(ch);
    };
  }, [live.topic, live.host, me, relayTo, end, shareControl, setControllerId]);

  // A picture that arrives while the Screen share tab is hidden can stay black once
  // shown; restart playback whenever the video becomes visible again.
  useEffect(() => {
    const el = video.current;
    if (!hasVideo) setFirstFrame(false);
    if (!el || !hasVideo) return;
    const kick = () => { if (el.srcObject && el.offsetParent !== null) void el.play().catch(() => {}); };
    kick();
    const ro = new ResizeObserver(kick);
    ro.observe(el);
    const t = window.setInterval(() => { if (el.videoWidth > 0) setFirstFrame(true); if (el.paused || el.videoWidth === 0) kick(); }, 1500);
    return () => { ro.disconnect(); window.clearInterval(t); };
  }, [hasVideo]);

  // Host keeps the session alive.
  useEffect(() => {
    if (!live.host) return;
    const t = window.setInterval(() => {
      if (sessionIdle(lastActivity.current, new Date())) void end("Session ended after 30 minutes without activity.");
      else void supabase.rpc("touch_tv_session", { _id: live.id });
    }, 60_000);
    const bump = () => { lastActivity.current = new Date(); };
    window.addEventListener("pointerdown", bump); window.addEventListener("keydown", bump);
    return () => { window.clearInterval(t); window.removeEventListener("pointerdown", bump); window.removeEventListener("keydown", bump); };
  }, [live.id, live.host, end]);

  // Everyone: notice when the customer ends it on the TV (broadcast can be missed).
  useEffect(() => {
    const t = window.setInterval(async () => {
      const { data } = await supabase.from("tv_remote_sessions").select("status").eq("id", live.id).maybeSingle();
      if (data && (data.status === "ended" || data.status === "expired")) {
        ended.current = true; setTvState("gone"); toast.info("The customer ended the session on their TV."); onEndRef.current();
      }
    }, 4000);
    return () => window.clearInterval(t);
  }, [live.id]);

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <div className="relative aspect-video overflow-hidden rounded-2xl border bg-muted">
        <video ref={video} autoPlay playsInline muted onLoadedData={() => setFirstFrame(true)} onResize={() => setFirstFrame(true)} className={hasVideo ? "h-full w-full object-contain" : "hidden"} />
        {!hasVideo && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-muted-foreground">
            {!live.host ? "Connecting to the TV picture…" : tvState === "waiting" ? "Waiting for the customer to press Allow on the TV…" : "The TV screen will appear here once the customer presses Start sharing."}
          </div>
        )}
        {hasVideo && !firstFrame && (
          <div className="pointer-events-none absolute inset-0">
            <img src={connectingArt} alt="Support staff connecting to the customer's TV" width={1600} height={912} className="h-full w-full object-cover" />
            <div className="absolute inset-0 grid place-items-center bg-background/45 p-6">
              <div className="w-full max-w-xl space-y-4 rounded-2xl bg-background/90 p-6 text-center shadow-2xl ring-1 ring-primary/30">
                <div className="flex items-center justify-center gap-3 text-lg font-semibold text-foreground">
                  <span className="h-3 w-3 animate-pulse rounded-full bg-primary" />
                  Connecting to the TV screen…
                </div>
                <div className="flex items-center justify-center gap-3 rounded-xl bg-primary px-5 py-4 text-base font-extrabold uppercase leading-snug tracking-wide text-primary-foreground shadow-glow sm:text-xl">
                  <Home className="h-7 w-7 shrink-0" aria-hidden="true" />
                  Press the Home button on the remote to get the picture
                </div>
                <p className="text-sm text-muted-foreground">The TV only sends a picture when something on its screen moves.</p>
              </div>
            </div>
          </div>
        )}
      </div>
      <aside className="space-y-4 self-start xl:sticky xl:top-4">
        <StaffCard viewers={viewers} device={live.device} host={live.host} tvState={tvState} onEnd={() => void end()} />
        <RemotePad control={control} noReport={noReport && live.host} controller={controller} me={me} viewers={viewers} onSend={sendRemote} onTake={takeControl} />
      </aside>
    </div>
  );
}

type ControlState = RemoteControlReport & { apps: { pkg: string; label: string }[] };
type RemoteEvent = "cmd" | "text" | "clear_text" | "launch";

function parseControl(p: unknown): ControlState | null {
  if (!p || typeof p !== "object") return null;
  const o = p as Record<string, unknown>;
  const apps = Array.isArray(o.apps) ? o.apps.filter((a): a is { pkg: string; label: string } =>
    !!a && typeof (a as { pkg?: unknown }).pkg === "string" && typeof (a as { label?: unknown }).label === "string").slice(0, 80) : [];
  return {
    fire: o.fire === true, installed: o.installed === true, enabled: o.enabled === true, apps,
    running: typeof o.running === "boolean" ? o.running : undefined, listed: typeof o.listed === "boolean" ? o.listed : undefined,
    adb: typeof o.adb === "boolean" ? o.adb : undefined,
    helper: typeof o.helper === "string" ? o.helper.slice(0, 20) : null,
    error: typeof o.error === "string" ? o.error.slice(0, 300) : null,
  };
}

/** Host-side check of commands relayed from other staff. */
function cleanRemote(ev: RemoteEvent, p: unknown): Record<string, unknown> | null {
  const o = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
  if (ev === "cmd") return (REMOTE_PAD_KEYS as readonly string[]).includes(String(o.key)) ? { key: o.key } : null;
  if (ev === "text") return typeof o.text === "string" ? { text: o.text.slice(0, 200) } : null;
  if (ev === "clear_text") return {};
  if (ev === "launch") return typeof o.pkg === "string" && /^[A-Za-z0-9_.]{1,150}$/.test(o.pkg) ? { pkg: o.pkg } : null;
  return null;
}

function RemotePad({ control, noReport, controller, me, viewers, onSend, onTake }: {
  control: ControlState | null; noReport: boolean; controller: string | null; me: string | null; viewers: Viewer[];
  onSend: (ev: RemoteEvent, payload: Record<string, unknown>) => void; onTake: () => void;
}) {
  const [text, setText] = useState("");
  const mine = !!me && controller === me;
  const ready = !!control?.enabled;
  const key = (k: (typeof REMOTE_PAD_KEYS)[number]) => onSend("cmd", { key: k });
  const who = viewers.find((v) => v.id === controller)?.username ?? "another staff member";
  const btn = "h-12 w-12";

  let notice: string | null = null;
  if (!control) notice = noReport
    ? "The TV isn't answering remote control requests. The customer's BM Remote Helper is probably an older version — ask them to update it to v1.8 from Install Guides, then start a new screen share."
    : "Waiting for the TV to report remote control…";
  else notice = remoteSetupNotice(control);

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold"><Gamepad2 className="h-4 w-4" />Remote control</p>
        {ready && !mine && <Button size="sm" variant="secondary" onClick={onTake}>Take over</Button>}
      </div>
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : (
        <div className={mine ? "space-y-4" : "pointer-events-none space-y-4 opacity-50"} aria-disabled={!mine}>
          {!mine && <p className="text-xs font-medium text-muted-foreground">Controlled by {who}</p>}
          <div className="mx-auto grid w-fit grid-cols-3 gap-2">
            <span />
            <Button variant="outline" size="icon" className={btn} aria-label="Up" onClick={() => key("up")}><ChevronUp /></Button>
            <span />
            <Button variant="outline" size="icon" className={btn} aria-label="Left" onClick={() => key("left")}><ChevronLeft /></Button>
            <Button size="icon" className={`${btn} rounded-full`} aria-label="OK" onClick={() => key("ok")}>OK</Button>
            <Button variant="outline" size="icon" className={btn} aria-label="Right" onClick={() => key("right")}><ChevronRight /></Button>
            <span />
            <Button variant="outline" size="icon" className={btn} aria-label="Down" onClick={() => key("down")}><ChevronDown /></Button>
            <span />
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => key("back")}><Undo2 className="mr-1 h-4 w-4" />Back</Button>
            <Button variant="secondary" size="sm" onClick={() => key("home")}><Home className="mr-1 h-4 w-4" />Home</Button>
            <Button variant="secondary" size="icon" aria-label="Play or pause" onClick={() => key("play_pause")}><Pause className="h-4 w-4" /></Button>
            <Button variant="secondary" size="icon" aria-label="Volume down" onClick={() => key("volume_down")}><Volume1 className="h-4 w-4" /></Button>
            <Button variant="secondary" size="icon" aria-label="Volume up" onClick={() => key("volume_up")}><Volume2 className="h-4 w-4" /></Button>
          </div>
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (text) { onSend("text", { text }); setText(""); } }}>
            <p className="text-sm font-medium">Type text</p>
            <p className="text-xs text-muted-foreground">Select a box on the TV first, then send.</p>
            <div className="flex gap-2">
              <Input value={text} maxLength={200} onChange={(e) => setText(e.target.value)} placeholder="Username, password…" />
              <Button type="submit" size="sm" disabled={!text}>Send</Button>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => onSend("clear_text", {})}>Clear the TV box</Button>
          </form>
          <div className="space-y-2">
            <p className="text-sm font-medium">Open app</p>
            {control?.apps.length ? (
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" defaultValue=""
                onChange={(e) => { if (e.target.value) { onSend("launch", { pkg: e.target.value }); e.target.value = ""; } }}>
                <option value="" disabled>Choose an app…</option>
                {control.apps.map((a) => <option key={a.pkg} value={a.pkg}>{a.label}</option>)}
              </select>
            ) : <p className="text-xs text-muted-foreground">No apps reported by the TV.</p>}
          </div>
        </div>
      )}
    </section>
  );
}

function StaffCard({ viewers, device, host, tvState, onEnd }: { viewers: Viewer[]; device: string; host: boolean; tvState: string; onEnd: () => void }) {
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">{device}</p>
          <p className="text-xs text-muted-foreground">{tvState === "allowed" ? "Customer allowed" : tvState === "waiting" ? "Waiting for customer" : "Ended"}</p>
        </div>
        {host
          ? <Button variant="destructive" size="sm" onClick={onEnd}><Power className="mr-1 h-4 w-4" />End</Button>
          : <Button variant="secondary" size="sm" onClick={onEnd}><LogOut className="mr-1 h-4 w-4" />Leave</Button>}
      </div>
      <p className="mb-2 flex items-center gap-2 text-sm font-medium"><Users className="h-4 w-4" />Staff on this TV</p>
      <div className="flex flex-wrap gap-3">
        {viewers.map((v) => (
          <div key={v.id} className="flex items-center gap-2">
            <span className="relative h-9 w-[151px] shrink-0 overflow-hidden rounded-lg">
              <Nameplate id={v.nameplate} className="absolute inset-0"
                fallbackStyle={{ background: "linear-gradient(to bottom right, hsl(var(--primary)/0.35), hsl(var(--accent)/0.25))" }} />
              <span className="relative flex h-full items-center px-2.5">
                <span className="truncate font-display text-sm font-semibold text-foreground">{v.username}</span>
              </span>
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${v.host ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
              {v.host ? "Dealing with it" : "Watching"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}


type HistoryRow = { id: string; device_name: string; customer_label: string | null; staff_id: string | null; status: string; claimed_at: string | null; ended_at: string | null; ended_by: string | null };

export function History() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from("tv_remote_sessions")
        .select("id, device_name, customer_label, staff_id, status, claimed_at, ended_at, ended_by")
        .not("staff_id", "is", null).order("claimed_at", { ascending: false }).limit(50);
      const list = (data ?? []) as HistoryRow[];
      setRows(list);
      const ids = [...new Set(list.map((r) => r.staff_id).filter(Boolean))] as string[];
      if (ids.length) {
        const { data: p } = await supabase.from("profiles").select("id, username").in("id", ids);
        setNames(Object.fromEntries((p ?? []).map((x) => [x.id, x.username ?? "Staff"])));
      }
    })();
  }, []);
  const fmt = (s: string | null) => s ? new Date(s).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" }) : "—";
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">Session history</h2>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">No sessions yet.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground"><tr><th className="py-2">Staff</th><th>Customer</th><th>TV</th><th>Started</th><th>Ended</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="py-2">{r.staff_id ? names[r.staff_id] ?? "Staff" : "—"}</td>
                  <td>{r.customer_label ?? "—"}</td><td>{r.device_name}</td>
                  <td>{fmt(r.claimed_at)}</td><td>{fmt(r.ended_at)}</td>
                  <td>{r.status}{r.ended_by ? ` (${r.ended_by.replace("_", " ")})` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

type RequestRow = { id: string; device_name: string; created_at: string; expires_at: string; link_kind: string | null; link_id: string | null };

/** Help requests sent from customers' TVs, waiting for staff to answer. */
export function HelpRequests({ onOpen }: { onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [orderLabels, setOrderLabels] = useState<Record<string, string>>({});
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("tv_remote_sessions").select("id, device_name, created_at, expires_at, link_kind, link_id")
        .eq("status", "pending").not("requested_at", "is", null).gt("expires_at", new Date().toISOString()).order("requested_at", { ascending: true });
      const list = (data ?? []) as RequestRow[];
      setRows(list);
      // Label each request with the sale it belongs to, so staff open that
      // order's own screen share page rather than a generic one.
      const orderIds = [...new Set(list.flatMap((r) => r.link_kind === "order" && r.link_id ? [r.link_id] : []))];
      if (orderIds.length) {
        const { data: summaries } = await supabase.rpc("staff_checkout_order_summary" as never);
        const map: Record<string, string> = {};
        for (const s of (summaries ?? []) as { id: string; order_ref: string | null; existing_username: string | null; shipping_name: string | null }[]) {
          if (orderIds.includes(s.id)) map[s.id] = `${s.order_ref ?? s.id.slice(0, 8)} · ${s.existing_username || s.shipping_name || "Customer"}`;
        }
        setOrderLabels(map);
      } else {
        setOrderLabels({});
      }
    };
    void load();
    const t = window.setInterval(load, 4000);
    return () => window.clearInterval(t);
  }, []);
  const fmt = (s: string) => new Date(s).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });
  return (
    <section className="rounded-2xl border bg-card p-6 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">TV help requests</h2>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">No customers waiting. Requests appear here when a customer presses Screen share help on their secure checkout.</p> : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const destination = screenShareDestination(r.link_kind, r.link_id);
            return (
            <li key={r.id} className="flex items-center justify-between gap-3 rounded-xl border p-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{r.device_name}</p>
                <p className="text-xs text-muted-foreground">
                  {r.link_kind === "order" && r.link_id ? `Sale ${orderLabels[r.link_id] ?? ""}` : r.link_kind === "ticket" ? "Support ticket" : "No sale linked"} · Requested {fmt(r.created_at)}
                </p>
              </div>
              {destination ? (
                <Button size="sm" asChild>
                  <Link {...destination}>Answer</Link>
                </Button>
              ) : (
                <Button size="sm" onClick={() => onOpen(r.id)}>Answer</Button>
              )}
            </li>
          ); })}
        </ul>
      )}
    </section>
  );
}

type OrderReq = { id: string; topic: string; device_name: string; status: string; staff_id: string | null; requested_at: string | null };

/** Active screen-share requests for one sale, answered and watched in place. */
export function useOrderScreenShares(orderId: string, kind: LinkKind = "order") {
  const [rows, setRows] = useState<OrderReq[]>([]);
  useEffect(() => {
    if (!orderId) return;
    const load = async () => {
      const { data } = await supabase.from("tv_remote_sessions")
        .select("id, topic, device_name, status, staff_id, requested_at")
        .eq("link_kind", kind).eq("link_id", orderId).in("status", ["pending", "claimed", "active"])
        .gt("expires_at", new Date().toISOString()).order("requested_at", { ascending: false });
      setRows(((data ?? []) as OrderReq[]).filter((r) => r.status !== "pending" || r.requested_at));
    };
    void load();
    const t = window.setInterval(load, 4000);
    return () => window.clearInterval(t);
  }, [orderId, kind]);
  return rows;
}

export function OrderScreenShareTab({ orderId, rows, kind = "order", autoAnswer = false, onAutoAnswered }: { orderId: string; rows: OrderReq[]; kind?: LinkKind; autoAnswer?: boolean; onAutoAnswered?: () => void }) {
  const { user } = useAuth();
  const [live, setLive] = useState<Live | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const closedSessions = useRef(new Set<string>());
  const uid = user?.id ?? null;
  // Rejoin a session this staff member is already dealing with (e.g. after refresh).
  useEffect(() => {
    if (live || !uid) return;
    const active = rows.filter((r) => r.status !== "pending" && r.staff_id && !closedSessions.current.has(r.id));
    const current = active.find((r) => r.staff_id === uid) ?? active[0];
    if (current) setLive({ id: current.id, topic: current.topic, device: current.device_name, host: current.staff_id === uid, linkKind: kind, linkId: orderId, hostId: current.staff_id });
  }, [rows, uid, live, orderId, kind]);
  const answer = async (r: OrderReq) => {
    setBusy(r.id);
    const { data, error } = await supabase.rpc("answer_tv_request", { _id: r.id });
    setBusy(null);
    const row = Array.isArray(data) ? data[0] : null;
    if (error || !row) { toast.error(error?.message ?? "Could not answer this request"); return; }
    setLive({ id: row.id, topic: row.topic, device: row.device_name, host: true, linkKind: kind, linkId: orderId, hostId: uid });
  };
  // Answer pressed in the ticket header: answer the waiting request as soon as it is listed here.
  useEffect(() => {
    if (!autoAnswer || live || busy) return;
    const pending = rows.find((r) => r.status === "pending" && !closedSessions.current.has(r.id));
    if (!pending) return;
    onAutoAnswered?.();
    void answer(pending);
  }, [autoAnswer, rows, live, busy]);
  if (live) return <RemoteSession key={live.id} live={live} onEnd={() => {
    closedSessions.current.add(live.id);
    setLive(null);
  }} />;
  const currentRows = rows.filter((r) => !closedSessions.current.has(r.id));
  return (
    <section className="rounded-2xl border bg-card p-6 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">Screen share requests</h2>
      {currentRows.length === 0 ? <p className="text-sm text-muted-foreground">No active screen share requests for this {kind === "order" ? "sale" : "ticket"}. When the customer presses Screen share help, it appears here.</p> : (
        <ul className="space-y-2">
          {currentRows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 rounded-xl border p-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{r.device_name}</p>
                <p className="text-xs text-muted-foreground">{r.status === "pending" ? "Waiting for staff" : "Someone is dealing with it"}</p>
              </div>
              {r.status === "pending"
                ? <Button size="sm" disabled={busy === r.id} onClick={() => void answer(r)}>{busy === r.id ? "Answering…" : "Answer"}</Button>
                : <Button size="sm" variant="secondary" onClick={() => setLive({ id: r.id, topic: r.topic, device: r.device_name, host: r.staff_id === uid, linkKind: kind, linkId: orderId, hostId: r.staff_id })}>{r.staff_id === uid ? "Open" : "Watch"}</Button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
