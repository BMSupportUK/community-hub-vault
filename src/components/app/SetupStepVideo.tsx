import { useState } from "react";
import { Button } from "@/components/ui/button";

type Pointer = { url: string };
// Videos are registered as asset pointers; any not yet added simply show a "coming soon" note.
const files = import.meta.glob<Pointer>("../../assets/videos/install-step*.mp4.asset.json", { eager: true, import: "default" });
const urlFor = (name: string) => Object.entries(files).find(([p]) => p.endsWith(`/${name}.mp4.asset.json`))?.[1]?.url;

/** Tutorial video for the current self-install step; step 3 differs per TV type. */
export function SetupStepVideo({ step, device }: { step: number; device: "amazon" | "android" }) {
  const [fire, setFire] = useState<"stick" | "television">("stick");
  const name = step === 0 ? "install-step1-get-enabler"
    : step === 1 ? "install-step2-choose-apps"
    : step === 2 ? (device === "android" ? "install-step3-android-tv" : fire === "stick" ? "install-step3-fire-tv-stick" : "install-step3-fire-tv-television")
    : "install-step4-all-done";
  const url = urlFor(name);
  return <div className="space-y-3">
    {step === 2 && device === "amazon" && <div className="flex flex-wrap gap-2" role="group" aria-label="Which Fire TV?">
      <Button size="sm" variant={fire === "stick" ? "default" : "outline"} onClick={() => setFire("stick")}>Fire TV Stick</Button>
      <Button size="sm" variant={fire === "television" ? "default" : "outline"} onClick={() => setFire("television")}>Fire TV television</Button>
    </div>}
    {url ? <video key={url} src={url} controls playsInline preload="metadata" className="aspect-video w-full rounded-lg border border-border bg-surface-2" />
      : <p className="rounded-lg border border-border bg-surface-2 p-6 text-center text-sm text-muted-foreground">The video for this step is coming soon.</p>}
  </div>;
}
