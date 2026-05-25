import { useEffect, useState } from "react";
import { Volume2, VolumeX, Play, Bell } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  getSoundPrefs,
  setSoundPrefs,
  onSoundPrefsChange,
  playSound,
} from "@/lib/sound";
import mentionAudio from "@/assets/mention-notify.mp3";
import ticketAudio from "@/assets/ticket-notify.mp3";
import shiftStartAudio from "@/assets/shift-start.mp3";
import endBreakAudio from "@/assets/end-break.mp3";
import outageAudio from "@/assets/outage-notify.mp3";

const SAMPLES: { label: string; src: string; gain: number }[] = [
  { label: "Mention", src: mentionAudio, gain: 1.5 },
  { label: "Ticket", src: ticketAudio, gain: 2.0 },
  { label: "Shift start", src: shiftStartAudio, gain: 2.2 },
  { label: "Break ending", src: endBreakAudio, gain: 2.2 },
  { label: "Outage", src: outageAudio, gain: 2.2 },
];

export function SoundSettings() {
  const [prefs, setPrefs] = useState(() => getSoundPrefs());

  useEffect(() => onSoundPrefsChange(() => setPrefs(getSoundPrefs())), []);

  const volumePct = Math.round(prefs.volume * 100);

  return (
    <section className="rounded-2xl border border-purple-500/30 bg-purple-950/50 backdrop-blur p-6 text-white space-y-6">
      <header className="flex items-start gap-3">
        <div className="grid place-items-center size-10 rounded-xl bg-fuchsia-500/20 text-fuchsia-300">
          <Bell className="size-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Sound notifications</h2>
          <p className="text-sm text-purple-200/80">
            Control how loud in-app alerts (shifts, breaks, tickets, mentions, outages) play on this device.
          </p>
        </div>
      </header>

      {/* Mute */}
      <div className="flex items-center justify-between rounded-xl border border-purple-500/30 bg-purple-900/40 px-4 py-3">
        <div className="flex items-center gap-3">
          {prefs.muted ? (
            <VolumeX className="size-5 text-rose-300" />
          ) : (
            <Volume2 className="size-5 text-emerald-300" />
          )}
          <div>
            <Label className="text-base">Mute all notification sounds</Label>
            <p className="text-xs text-purple-200/70">You'll still see on-screen alerts and badges.</p>
          </div>
        </div>
        <Switch
          checked={prefs.muted}
          onCheckedChange={(v) => setSoundPrefs({ muted: v })}
        />
      </div>

      {/* Volume */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base">Volume</Label>
          <span className="text-sm font-mono text-purple-100">{volumePct}%</span>
        </div>
        <Slider
          value={[volumePct]}
          min={0}
          max={200}
          step={5}
          disabled={prefs.muted}
          onValueChange={([v]) => setSoundPrefs({ volume: v / 100 })}
        />
        <div className="flex justify-between text-xs text-purple-200/70">
          <span>Quiet</span>
          <span>Default (100%)</span>
          <span>Loud (200%)</span>
        </div>
      </div>

      {/* Test buttons */}
      <div className="space-y-2">
        <Label className="text-base">Test sounds</Label>
        <p className="text-xs text-purple-200/70">
          Play a sample to check loudness. Plays at the same level the real alert will use.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {SAMPLES.map((s) => (
            <Button
              key={s.label}
              variant="secondary"
              size="sm"
              disabled={prefs.muted}
              onClick={() => playSound(s.src, { gain: s.gain, label: `test-${s.label}` })}
              className="bg-purple-800/60 hover:bg-purple-700/80 border border-purple-500/40"
            >
              <Play className="size-3.5 mr-1.5" />
              {s.label}
            </Button>
          ))}
        </div>
      </div>
    </section>
  );
}