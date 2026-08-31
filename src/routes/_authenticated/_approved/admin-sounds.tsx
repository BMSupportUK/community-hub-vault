import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Play, Loader2, CheckCircle2, XCircle, Volume2, Square } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { SoundSettings } from "@/components/app/SoundSettings";
import { playSoundFromGesture, getSoundPrefs } from "@/lib/sound";
import { toast } from "sonner";

import mentionAudio from "@/assets/mention-notify.mp3";
import staffMentionAudio from "@/assets/staff-mention.mp3";
import broadcastAudio from "@/assets/broadcast-notify.mp3";
import orderAudio from "@/assets/order-notify.mp3";
import ticketAudio from "@/assets/ticket-notify.mp3";
import ticketReplyAudio from "@/assets/ticket-reply-notify.mp3";
import paymentReceivedAudio from "@/assets/payment-received.mp3";
import newSignupAudio from "@/assets/new-signup-notify.mp3";
import shiftStartAudio from "@/assets/shift-start.mp3";
import shiftEndAudio from "@/assets/shift-end.mp3";
import endBreakAudio from "@/assets/end-break.mp3";
import endLunchAudio from "@/assets/end-lunch.mp3";
import outageAudio from "@/assets/outage-notify.mp3";
import outageResolvedAudio from "@/assets/outage-resolved.mp3";

export const Route = createFileRoute("/_authenticated/_approved/admin-sounds")({
  component: AdminSounds,
  head: () => ({
    meta: [
      { title: "Notification sounds — BM Support admin" },
      { name: "description", content: "Play and verify every notification MP3 used across BM Support." },
      { property: "og:title", content: "Notification sounds — BM Support admin" },
      { property: "og:description", content: "Play and verify every notification MP3 used across BM Support." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type SoundDef = {
  key: string;
  label: string;
  file: string;
  src: string;
  gain: number;
  trigger: string;
};

const SOUNDS: SoundDef[] = [
  { key: "mention", label: "Mention", file: "mention-notify.mp3", src: mentionAudio, gain: 1.5, trigger: "Someone @mentions you in chat or the forum." },
  { key: "staff-mention", label: "Staff mention", file: "staff-mention.mp3", src: staffMentionAudio, gain: 1.5, trigger: "A member mentions staff in the gate or a staff channel." },
  { key: "broadcast", label: "Broadcast", file: "broadcast-notify.mp3", src: broadcastAudio, gain: 1.5, trigger: "An admin broadcast / announcement is posted." },
  { key: "order", label: "Sale / Order", file: "order-notify.mp3", src: orderAudio, gain: 1.8, trigger: "A customer places a new order." },
  { key: "ticket", label: "New ticket", file: "ticket-notify.mp3", src: ticketAudio, gain: 2.0, trigger: "A new support ticket is opened / left unanswered." },
  { key: "ticket-reply", label: "Ticket reply", file: "ticket-reply-notify.mp3", src: ticketReplyAudio, gain: 2.0, trigger: "A customer replies to a ticket you are assigned to." },
  { key: "payment", label: "Payment confirmed", file: "payment-received.mp3", src: paymentReceivedAudio, gain: 2.0, trigger: "An order payment is confirmed (card or bank transfer)." },
  { key: "signup", label: "New signup", file: "new-signup-notify.mp3", src: newSignupAudio, gain: 1.8, trigger: "A new member signs up and hits the gate." },
  { key: "shift-start", label: "Shift start", file: "shift-start.mp3", src: shiftStartAudio, gain: 2.2, trigger: "Your rota shift is about to start." },
  { key: "shift-end", label: "Shift end", file: "shift-end.mp3", src: shiftEndAudio, gain: 2.2, trigger: "Your rota shift is about to end." },
  { key: "end-break", label: "Break ending", file: "end-break.mp3", src: endBreakAudio, gain: 2.2, trigger: "Your break is nearly over (auto-ends after 10s)." },
  { key: "end-lunch", label: "Lunch ending", file: "end-lunch.mp3", src: endLunchAudio, gain: 2.2, trigger: "Your lunch is nearly over (auto-ends after 10s)." },
  { key: "outage", label: "Outage raised", file: "outage-notify.mp3", src: outageAudio, gain: 2.2, trigger: "A service outage is published on the status page." },
  { key: "outage-resolved", label: "Outage resolved", file: "outage-resolved.mp3", src: outageResolvedAudio, gain: 1.8, trigger: "An outage is marked resolved." },
];

type Check = {
  status: "pending" | "ok" | "fail";
  bytes?: number;
  duration?: number;
  contentType?: string | null;
  error?: string;
};

function formatBytes(n?: number) {
  if (!n) return "—";
  return n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function AdminSounds() {
  const { hasAny } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const [checks, setChecks] = useState<Record<string, Check>>({});
  const [checking, setChecking] = useState(true);
  const [nowPlaying, setNowPlaying] = useState<string | null>(null);
  const sequenceRef = useRef<number | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;

    const run = async () => {
      setChecking(true);
      const AC: typeof AudioContext | undefined =
        (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      const ctx = AC ? new AC() : null;
      for (const s of SOUNDS) {
        if (cancelled) return;
        try {
          const res = await fetch(s.src);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const contentType = res.headers.get("content-type");
          const bytes = await res.arrayBuffer();
          let duration: number | undefined;
          if (ctx) {
            const buf = await ctx.decodeAudioData(bytes.slice(0));
            duration = buf.duration;
          }
          if (cancelled) return;
          setChecks((p) => ({ ...p, [s.key]: { status: "ok", bytes: bytes.byteLength, duration, contentType } }));
        } catch (err) {
          if (cancelled) return;
          setChecks((p) => ({
            ...p,
            [s.key]: { status: "fail", error: (err as Error)?.message ?? "Unknown error" },
          }));
        }
      }
      if (!cancelled) setChecking(false);
    };

    void run();
    return () => {
      cancelled = true;
      if (sequenceRef.current) window.clearTimeout(sequenceRef.current);
    };
  }, [isAdmin]);

  const okCount = useMemo(
    () => SOUNDS.filter((s) => checks[s.key]?.status === "ok").length,
    [checks],
  );
  const failCount = useMemo(
    () => SOUNDS.filter((s) => checks[s.key]?.status === "fail").length,
    [checks],
  );

  if (!isAdmin) return <Navigate to="/home" />;

  const play = async (s: SoundDef) => {
    const prefs = getSoundPrefs();
    if (prefs.muted) {
      toast.error("Sounds are muted on this device — unmute below to test.");
      return;
    }
    setNowPlaying(s.key);
    const ok = await playSoundFromGesture(s.src, { gain: s.gain, label: `admin-test-${s.key}` });
    if (!ok) toast.error(`${s.label} could not start on this device.`);
    const ms = Math.round(((checks[s.key]?.duration ?? 3) + 0.2) * 1000);
    window.setTimeout(() => setNowPlaying((cur) => (cur === s.key ? null : cur)), ms);
  };

  const playAll = async () => {
    if (running) {
      setRunning(false);
      if (sequenceRef.current) window.clearTimeout(sequenceRef.current);
      setNowPlaying(null);
      return;
    }
    setRunning(true);
    let i = 0;
    const step = async () => {
      if (i >= SOUNDS.length) {
        setRunning(false);
        setNowPlaying(null);
        toast.success("Played every notification sound.");
        return;
      }
      const s = SOUNDS[i];
      i += 1;
      setNowPlaying(s.key);
      await playSoundFromGesture(s.src, { gain: s.gain, label: `admin-testall-${s.key}` });
      const ms = Math.round(((checks[s.key]?.duration ?? 3) + 0.4) * 1000);
      sequenceRef.current = window.setTimeout(() => { void step(); }, ms);
    };
    void step();
  };

  return (
    <div className="w-full px-4 sm:px-6 py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Back to admin
          </Link>
          <h1 className="font-display text-2xl font-bold mt-1">Notification sounds</h1>
          <p className="text-sm text-muted-foreground">
            Every MP3 the app uses. Each one is fetched and decoded on load, so you can see at a glance
            whether the file is valid, then press play to hear exactly what staff hear.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs rounded-full border border-border bg-surface-1 px-3 py-1">
            {checking ? "Checking…" : `${okCount}/${SOUNDS.length} OK`}
            {failCount > 0 ? ` · ${failCount} failed` : ""}
          </span>
          <button
            type="button"
            onClick={() => void playAll()}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow"
          >
            {running ? <Square className="size-4" /> : <Volume2 className="size-4" />}
            {running ? "Stop" : "Play all in order"}
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {SOUNDS.map((s) => {
          const c = checks[s.key];
          const active = nowPlaying === s.key;
          return (
            <div
              key={s.key}
              className={`rounded-2xl border p-4 transition-all ${
                active ? "border-primary shadow-glow bg-surface-2" : "border-border bg-surface-1"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-display font-bold flex items-center gap-2">
                    {s.label}
                    {c?.status === "ok" && <CheckCircle2 className="size-4 text-emerald-400" />}
                    {c?.status === "fail" && <XCircle className="size-4 text-rose-400" />}
                    {!c && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                  </div>
                  <div className="text-[11px] font-mono text-muted-foreground truncate">{s.file}</div>
                </div>
                <button
                  type="button"
                  onClick={() => void play(s)}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-3 py-2 text-xs font-semibold hover:border-primary"
                >
                  <Play className="size-3.5" /> {active ? "Playing" : "Play"}
                </button>
              </div>

              <p className="text-xs text-muted-foreground mt-2">{s.trigger}</p>

              <dl className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                <div>
                  <dt className="text-muted-foreground">Length</dt>
                  <dd className="font-mono">{c?.duration ? `${c.duration.toFixed(2)}s` : "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Size</dt>
                  <dd className="font-mono">{formatBytes(c?.bytes)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Volume</dt>
                  <dd className="font-mono">×{s.gain.toFixed(1)}</dd>
                </div>
              </dl>

              {c?.status === "fail" && (
                <p className="mt-2 text-xs text-rose-300">Failed: {c.error}</p>
              )}
            </div>
          );
        })}
      </div>

      <SoundSettings />
    </div>
  );
}
