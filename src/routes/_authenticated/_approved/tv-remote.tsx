import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CornerDownLeft, Home, Menu, Pause, Volume1, Volume2, VolumeX, Tv, Power, Send,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getVideoIceServers } from "@/lib/video-call.functions";
import { canSeeTvRemoteHistory, canUseTvRemote, keyForKeyboard, normalizePairCode, sessionIdle, type TvKey } from "@/lib/tv-remote";

export const Route = createFileRoute("/_authenticated/_approved/tv-remote")({
  component: TvRemotePage,
  head: () => ({
    meta: [
      { title: "TV Remote | BM Support Staff" },
      { name: "description", content: "Watch and control a customer's TV during a BM Support help session." },
      { property: "og:title", content: "TV Remote | BM Support Staff" },
      { property: "og:description", content: "Watch and control a customer's TV during a BM Support help session." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Live = { id: string; topic: string; device: string };

function TvRemotePage() {
  const { roles, loading } = useAuth();
  const [live, setLive] = useState<Live | null>(null);
  if (loading) return null;
  if (!canUseTvRemote(roles)) return <Navigate to="/portal" replace />;
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      <header className="flex items-center gap-3">
        <Tv className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">TV Remote</h1>
          <p className="text-sm text-muted-foreground">Ask the customer to open BM Remote Helper on their TV and read you the 6-digit code.</p>
        </div>
      </header>
      {live ? <RemoteSession live={live} onEnd={() => setLive(null)} /> : <PairForm onPaired={setLive} />}
      {canSeeTvRemoteHistory(roles) && <History />}
    </div>
  );
}

function PairForm({ onPaired }: { onPaired: (l: Live) => void }) {
  const [code, setCode] = useState("");
  const [customer, setCustomer] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("claim_tv_pair_code", { _code: code, _customer: customer || undefined });
    setBusy(false);
    const row = Array.isArray(data) ? data[0] : null;
    if (error || !row) { toast.error(error?.message ?? "That code is wrong or has expired"); return; }
    onPaired({ id: row.id, topic: row.topic, device: row.device_name });
  };
  return (
    <form onSubmit={submit} className="max-w-md space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
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

function RemoteSession({ live, onEnd }: { live: Live; onEnd: () => void }) {
  const [tvState, setTvState] = useState<"waiting" | "allowed" | "declined" | "gone">("waiting");
  const [hasVideo, setHasVideo] = useState(false);
  const [text, setText] = useState("");
  const chan = useRef<RealtimeChannel | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const lastActivity = useRef(new Date());
  const ended = useRef(false);

  const end = useCallback(async (reason?: string) => {
    if (ended.current) return;
    ended.current = true;
    chan.current?.send({ type: "broadcast", event: "end", payload: {} });
    await supabase.rpc("end_tv_session", { _id: live.id });
    if (reason) toast.info(reason);
    onEnd();
  }, [live.id, onEnd]);

  useEffect(() => {
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
        if (video.current) video.current.srcObject = ev.streams[0] ?? new MediaStream([ev.track]);
        setHasVideo(true);
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
        if (s === "declined") void end("The customer declined control on the TV.");
      })
      .on("broadcast", { event: "offer" }, ({ payload }) => { if (typeof payload?.sdp === "string") void setupPeer(payload.sdp); })
      .on("broadcast", { event: "ice" }, ({ payload }) => {
        if (payload?.from === "tv" && payload.candidate) pc.current?.addIceCandidate(payload.candidate).catch(() => {});
      })
      .on("broadcast", { event: "screen_off" }, () => setHasVideo(false))
      .on("broadcast", { event: "end" }, () => { setTvState("gone"); void end("The TV ended the session."); })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") channel.send({ type: "broadcast", event: "hello", payload: {} });
      });
    return () => { cancelled = true; pc.current?.close(); supabase.removeChannel(channel); };
  }, [live.topic, end]);

  // Idle timeout and server keep-alive while staff are active.
  useEffect(() => {
    const t = window.setInterval(() => {
      if (sessionIdle(lastActivity.current, new Date())) void end("Session ended after 30 minutes without activity.");
      else void supabase.rpc("touch_tv_session", { _id: live.id });
    }, 60_000);
    return () => window.clearInterval(t);
  }, [live.id, end]);

  const press = useCallback((key: TvKey) => {
    lastActivity.current = new Date();
    chan.current?.send({ type: "broadcast", event: "cmd", payload: { key } });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (document.querySelector("[role=dialog]")) return;
      const k = keyForKeyboard(e.key);
      if (!k) return;
      e.preventDefault();
      press(k);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  const sendText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text) return;
    lastActivity.current = new Date();
    chan.current?.send({ type: "broadcast", event: "text", payload: { text } });
    setText("");
  };

  const Pad = ({ k, label, children }: { k: TvKey; label: string; children: React.ReactNode }) => (
    <Button type="button" variant="secondary" aria-label={label} title={label} className="h-14 w-14" onClick={() => press(k)}>{children}</Button>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="relative aspect-video overflow-hidden rounded-2xl border bg-muted">
        <video ref={video} autoPlay playsInline muted className={hasVideo ? "h-full w-full object-contain" : "hidden"} />
        {!hasVideo && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-muted-foreground">
            {tvState === "waiting" ? "Waiting for the customer to press Allow on the TV…" : "The TV screen will appear here once the customer presses Start sharing."}
          </div>
        )}
      </div>
      <aside className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold">{live.device}</p>
            <p className="text-xs text-muted-foreground">{tvState === "allowed" ? "Control allowed" : tvState === "waiting" ? "Waiting for customer" : "Ended"}</p>
          </div>
          <Button variant="destructive" size="sm" onClick={() => void end()}><Power className="mr-1 h-4 w-4" />End</Button>
        </div>
        <div className="mx-auto grid w-fit grid-cols-3 gap-2">
          <span /><Pad k="up" label="Up (↑)"><ArrowUp /></Pad><span />
          <Pad k="left" label="Left (←)"><ArrowLeft /></Pad>
          <Button type="button" aria-label="OK (Enter)" title="OK (Enter)" className="h-14 w-14 rounded-full" onClick={() => press("ok")}>OK</Button>
          <Pad k="right" label="Right (→)"><ArrowRight /></Pad>
          <span /><Pad k="down" label="Down (↓)"><ArrowDown /></Pad><span />
        </div>
        <div className="grid grid-cols-4 gap-2">
          <Pad k="back" label="Back (Backspace)"><CornerDownLeft /></Pad>
          <Pad k="home" label="Home (Esc)"><Home /></Pad>
          <Pad k="menu" label="Menu"><Menu /></Pad>
          <Pad k="play_pause" label="Play/Pause (Space)"><Pause /></Pad>
          <Pad k="volume_down" label="Volume down (-)"><Volume1 /></Pad>
          <Pad k="volume_up" label="Volume up (+)"><Volume2 /></Pad>
          <Pad k="mute" label="Mute"><VolumeX /></Pad>
        </div>
        <form onSubmit={sendText} className="space-y-1.5">
          <span className="text-sm font-medium">Type on the TV</span>
          <div className="flex gap-2">
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Select a text box on the TV first" autoComplete="off" />
            <Button type="submit" size="icon" aria-label="Send text"><Send className="h-4 w-4" /></Button>
          </div>
        </form>
        <p className="text-xs text-muted-foreground">Keyboard: arrows move, Enter = OK, Backspace = Back, Esc = Home, Space = play/pause, +/- = volume.</p>
      </aside>
    </div>
  );
}

type HistoryRow = { id: string; device_name: string; customer_label: string | null; staff_id: string | null; status: string; claimed_at: string | null; ended_at: string | null; ended_by: string | null };

function History() {
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
