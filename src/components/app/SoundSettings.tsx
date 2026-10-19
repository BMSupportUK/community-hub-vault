import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { playSoundFromGesture } from "@/lib/sound";
import { NOTIFICATION_SOUNDS } from "@/lib/notification-sounds";
import { PHONE_ALERTS } from "@/lib/phone-alerts";
import { phoneToneSrc } from "@/lib/phone-alert-sounds";
import { categoriesForRoles, notifyCategory } from "@/lib/notification-categories";

type Tone = { label: string; src: string; gain: number };

/** Sounds each alert type plays, worked out from the same kinds the alerts use. */
function tonesFor(categoryId: string): Tone[] {
  const out: Tone[] = [];
  const seen = new Set<string>();
  for (const a of PHONE_ALERTS) {
    if (!a.kinds.some((k) => notifyCategory(k, null, null) === categoryId)) continue;
    const src = phoneToneSrc(a.key);
    if (!src || seen.has(src)) continue;
    seen.add(src);
    out.push({ label: a.label, src, gain: 2.0 });
  }
  return out;
}

const play = (t: Tone) => playSoundFromGesture(t.src, { gain: t.gain, label: `test-${t.label}` });

export function SoundSettings() {
  const { roles } = useAuth();
  const cats = categoriesForRoles((roles ?? []).map(String));
  const usedSrcs = new Set(cats.flatMap((c) => tonesFor(c.id).map((t) => t.src)));
  const extras = NOTIFICATION_SOUNDS.filter((s) => !usedSrcs.has(s.src) && !PHONE_TONE_KEYS.has(s.key));

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        One card for every alert on the Browser and Phone app tabs. Tap play to hear it at the real alert volume.
        On iPhone or iPad, alerts use your phone's default message tone instead.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {cats.map((c) => {
          const tones = tonesFor(c.id);
          return (
            <div key={c.id} className="rounded-xl border border-border bg-surface-2 p-4 space-y-2">
              <div>
                <span className="block text-sm font-semibold">{c.label}</span>
                <span className="block text-xs text-muted-foreground">{c.hint}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {tones.length ? (
                  tones.map((t) => (
                    <Button key={t.src} size="sm" variant="secondary" onClick={() => play(t)}>
                      <Play className="size-3.5 mr-1.5" />
                      {tones.length > 1 ? t.label : "Play"}
                    </Button>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">Uses the standard notification tone</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {extras.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Other sounds</h3>
          <div className="flex flex-wrap gap-2">
            {extras.map((s) => (
              <Button key={s.key} size="sm" variant="secondary" onClick={() => play(s)}>
                <Play className="size-3.5 mr-1.5" />
                {s.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Website sound keys that are just the phone recordings (already shown in cards).
const PHONE_TONE_KEYS = new Set([
  "mention", "staff-mention", "order", "ticket", "ticket-reply", "payment-received", "signup",
  "shift-start", "shift-end", "end-break", "end-lunch", "outage", "outage-resolved",
]);
