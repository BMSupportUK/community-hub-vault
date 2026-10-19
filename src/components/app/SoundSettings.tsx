import { useEffect, useState } from "react";
import { Play, Bell } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  getSoundPrefs,
  setSoundPrefs,
  onSoundPrefsChange,
  playSoundFromGesture,
} from "@/lib/sound";
import { NOTIFICATION_SOUNDS } from "@/lib/notification-sounds";
import { PHONE_ALERTS } from "@/lib/phone-alerts";
import { phoneToneSrc } from "@/lib/phone-alert-sounds";

// Every alert type gets its own play button: all phone/browser alert
// recordings, plus the extra website-only clips (broadcast, Fan Zone, etc.).
const SAMPLES: { label: string; src: string; gain: number }[] = (() => {
  const out: { label: string; src: string; gain: number }[] = [];
  const seen = new Set<string>();
  for (const a of PHONE_ALERTS) {
    const src = phoneToneSrc(a.key);
    if (!src || seen.has(src)) continue;
    seen.add(src);
    out.push({ label: a.label, src, gain: 2.0 });
  }
  for (const s of NOTIFICATION_SOUNDS) {
    if (seen.has(s.src)) continue;
    seen.add(s.src);
    out.push({ label: s.label, src: s.src, gain: s.gain });
  }
  return out;
})();

export function SoundSettings() {
  const [prefs, setPrefs] = useState(() => getSoundPrefs());

  useEffect(() => onSoundPrefsChange(() => setPrefs(getSoundPrefs())), []);
  // The old mute switch was removed; per-type alert switches replace it.
  useEffect(() => { if (getSoundPrefs().muted) setSoundPrefs({ muted: false }); }, []);

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
          <p className="text-xs text-purple-200/70 pt-1">
            These BM Support sounds play in the browser and on Android phones. On iPhone or iPad,
            alerts arrive with your phone's default message tone instead.
          </p>
        </div>
      </header>

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
              
              onClick={() => playSoundFromGesture(s.src, { gain: s.gain, label: `test-${s.label}` })}
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