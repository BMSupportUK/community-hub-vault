import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Play, Loader2, CheckCircle2, XCircle, Volume2, Square, Send, Smartphone, Upload, RotateCcw } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { SoundSettings } from "@/components/app/SoundSettings";
import { playSoundFromGesture, getSoundPrefs } from "@/lib/sound";
import { sendTestPush } from "@/lib/test-push.functions";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SOUND_BUCKET, loadSoundOverrides, getOverrideUrl, onOverridesChange } from "@/lib/sound-overrides";
import { PHONE_ALERTS } from "@/lib/phone-alerts";
import { canOpenFanZoneAdminPanel } from "@/lib/admin-panel-access";
import { phoneToneSrc } from "@/lib/phone-alert-sounds";

import broadcastAudio from "@/assets/broadcast-notify.mp3";
import fanZoneAppealAsset from "@/assets/fan-zone-appeal-alert.mp3.asset.json";
import fanZoneAppealMsgAsset from "@/assets/fan-zone-appeal-message.mp3.asset.json";
import fanZoneAppealStaffAsset from "@/assets/fan-zone-appeal-staff-reply.mp3.asset.json";
import fanZoneMentionAsset from "@/assets/fan-zone-mention.mp3.asset.json";
import daneBmSupportAsset from "@/assets/dane-bm-support-needed.mp3.asset.json";

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

// Every phone alert first (same recording the phone plays), then the
// website-only sounds that have no phone version.
const BM_SOUNDS: SoundDef[] = [
  ...PHONE_ALERTS.map((a) => ({
    key: `phone-${a.key}`, label: a.label, file: `${a.tone}.mp3`,
    src: phoneToneSrc(a.key) ?? "", gain: 1.2, trigger: `${a.when}.`,
  })),
  { key: "broadcast", label: "Broadcast", file: "broadcast-notify.mp3", src: broadcastAudio, gain: 1.5, trigger: "An admin broadcast / announcement is posted." },
  { key: "dane-bm-support", label: "Needed in BM Support", file: "dane-bm-support-needed.mp3", src: daneBmSupportAsset.url, gain: 2.0, trigger: "You're called to BM Support." },
];


/** Boro Fan Zone is a separate part of the site — its sounds live in the Fan Zone admin panel. */
export const FZ_SOUNDS: SoundDef[] = [
  { key: "fan-zone-mention", label: "Fan Zone mention", file: "fan-zone-mention.mp3", src: fanZoneMentionAsset.url, gain: 2.0, trigger: "Someone @mentions you in Boro Fan Zone." },
  { key: "fan-zone-appeal", label: "Fan Zone ban appeal", file: "fan-zone-appeal-alert.mp3", src: fanZoneAppealAsset.url, gain: 2.0, trigger: "A banned Fan Zone member submits an appeal." },
  { key: "fan-zone-appeal-message", label: "Fan Zone appeal message", file: "fan-zone-appeal-message.mp3", src: fanZoneAppealMsgAsset.url, gain: 2.0, trigger: "A member sends a new message on their appeal." },
  { key: "fan-zone-appeal-staff-reply", label: "Fan Zone appeal reply", file: "fan-zone-appeal-staff-reply.mp3", src: fanZoneAppealStaffAsset.url, gain: 2.0, trigger: "A moderator replies to a member's appeal." },
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

export function AdminSounds({ zone = "bm" }: { zone?: "bm" | "fanzone" }) {
  const { hasAny, roles } = useAuth();
  const isFz = zone === "fanzone";
  const SOUNDS = isFz ? FZ_SOUNDS : BM_SOUNDS;
  const isAdmin = isFz ? canOpenFanZoneAdminPanel(roles ?? []) : hasAny(["admin", "management"]);
  const [checks, setChecks] = useState<Record<string, Check>>({});
  const [checking, setChecking] = useState(true);
  const [nowPlaying, setNowPlaying] = useState<string | null>(null);
  const sequenceRef = useRef<number | null>(null);
  const [running, setRunning] = useState(false);
  const [pushBusy, setPushBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<"spoken" | "mobile">("spoken");
  const [, setOvVersion] = useState(0);
  const [uploading, setUploading] = useState<string | null>(null);
  useEffect(() => {
    void loadSoundOverrides(true);
    return onOverridesChange(() => setOvVersion((v) => v + 1));
  }, []);

  const replaceSound = async (key: string, file: File) => {
    if (!file.type.startsWith("audio/")) return toast.error("Choose an audio file (MP3).");
    setUploading(key);
    try {
      const ext = file.name.split(".").pop() || "mp3";
      const path = `${key}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(SOUND_BUCKET).upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const { error } = await supabase.from("notification_sound_overrides").upsert({ sound_key: key, url: path, updated_at: new Date().toISOString() });
      if (error) throw error;
      await loadSoundOverrides(true);
      toast.success("Sound replaced — everyone hears the new one from now on.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const resetSound = async (key: string) => {
    const { error } = await supabase.from("notification_sound_overrides").delete().eq("sound_key", key);
    if (error) return toast.error(error.message);
    await loadSoundOverrides(true);
    toast.success("Back to the original sound.");
  };


  const sendPush = async (kind: string) => {
    if (pushBusy) return;
    setPushBusy(kind);
    try {
      const results = await sendTestPush({ data: { kind } });
      const entries = Object.entries(results);
      const skipped = entries.find(([, r]) => r.skipped)?.[1].skipped;
      const failed = entries.reduce((n, [, r]) => n + r.failed, 0);
      const sent = entries.reduce((n, [, r]) => n + r.sent, 0);
      if (skipped) toast.error(`Not sent: ${skipped}`);
      else if (sent === 0) toast.error(`No phone received it (${failed} failed). Is the app installed and signed in on your phone?`);
      else toast.success(`Sent to ${sent} device${sent === 1 ? "" : "s"} — lock your phone to hear the sound.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test push failed");
    } finally {
      setPushBusy(null);
    }
  };

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
    if (prefs.muted || prefs.volume <= 0) {
      toast.error("Sounds are muted or set to 0% — adjust Sound notifications below.");
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
    const prefs = getSoundPrefs();
    if (prefs.muted || prefs.volume <= 0) {
      toast.error("Sounds are muted or set to 0% — adjust Sound notifications below.");
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
          <Link to={isFz ? "/fan-zone-admin" : "/admin"} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> {isFz ? "Back to Fan Zone admin" : "Back to admin"}
          </Link>
          <h1 className="font-display text-2xl font-bold mt-1">{isFz ? "Boro Fan Zone sounds" : "Notification sounds"}</h1>
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


      {!isFz && <div className="inline-flex rounded-xl border border-border bg-surface-1 p-1">
        {([["spoken", `Voice / in-app sounds (${SOUNDS.length})`, Volume2], ["mobile", `Phone alerts (${PHONE_ALERTS.length})`, Smartphone]] as const).map(([k, label, Icon]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${tab === k ? "bg-gradient-primary text-primary-foreground shadow-glow" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>}

      {tab === "spoken" && (<>
      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {SOUNDS.map((s) => {
          const c = checks[s.key];
          const ov = getOverrideUrl(s.key);
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

              <audio
                controls
                preload="metadata"
                src={ov ?? s.src}
                className="mt-3 h-10 w-full"
                aria-label={`Native player for ${s.label}`}
              >
                Your device cannot play this MP3.
              </audio>

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

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-3 py-2 text-xs font-semibold hover:border-primary">
                  {uploading === s.key ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                  Upload & replace
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    disabled={!!uploading}
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void replaceSound(s.key, f); }}
                  />
                </label>
                {ov && (
                  <>
                    <span className="text-[11px] rounded-full bg-primary/15 text-primary px-2 py-0.5">Custom sound</span>
                    <button type="button" onClick={() => void resetSound(s.key)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                      <RotateCcw className="size-3.5" /> Use original
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <SoundSettings />
      </>)}

      {!isFz && tab === "mobile" && (
      <div className="rounded-2xl border border-border bg-surface-1 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display font-bold flex items-center gap-2">
              <Smartphone className="size-4" /> Test on my phone
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Sends a real push notification to every phone where you're signed in, using the exact
              alert type — lock the phone or close the app to hear its sound.
            </p>
          </div>
          <button
            type="button"
            disabled={!!pushBusy}
            onClick={() => void sendPush("all")}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-50"
          >
            {pushBusy === "all" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {pushBusy === "all" ? "Sending all…" : "Send all to my phone"}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2 pr-3 w-8">Tone</th>
                <th className="py-2 pr-3">Notification</th>
                <th className="py-2 pr-3 hidden sm:table-cell">When</th>
                <th className="py-2 pr-3 hidden md:table-cell">Android tone</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {PHONE_ALERTS.map((a) => (
                <tr key={a.key} className="border-t border-border">
                  <td className="py-2 pr-3"><CheckCircle2 className="size-4 text-emerald-400" aria-label="Has its own tone" /></td>
                  <td className="py-2 pr-3 font-semibold">
                    {a.label}
                    {a.isNew && <span className="ml-2 rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[10px]">New unique tone</span>}
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground hidden sm:table-cell">{a.when}</td>
                  <td className="py-2 pr-3 font-mono text-muted-foreground hidden md:table-cell">{a.tone}.mp3</td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      disabled={!!pushBusy}
                      onClick={() => void sendPush(a.key)}
                      className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2 py-1 font-semibold hover:border-primary disabled:opacity-50"
                    >
                      {pushBusy === a.key ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />} Test
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Every phone alert now has its own tone. Tones are built into the Android app, so phones need Android version 1.2.3 to hear the new ones.
        </p>
      </div>
      )}
    </div>
  );
}
