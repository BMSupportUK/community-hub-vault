import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getGuideVideoUrl } from "@/lib/guide-video.functions";

// Tutorials live in the private guide-videos bucket and play only through short-lived signed links.
const refFor = (name: string) => `guide-videos:install-tutorials/${name}.mp4`;

/** Tutorial video for the current self-install step; step 3 differs per TV type. */
export function SetupStepVideo({ step, device }: { step: number; device: "amazon" | "android" }) {
  const [fire, setFire] = useState<"stick" | "television">("stick");
  const name = step === 0 ? "install-step1-get-enabler"
    : step === 1 ? "install-step2-choose-apps"
    : step === 2 ? (device === "android" ? "install-step3-android-tv" : fire === "stick" ? "install-step3-fire-tv-stick" : "install-step3-fire-tv-television")
    : "install-step4-all-done";
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setUrl(null); setFailed(false);
    getGuideVideoUrl({ data: { ref: refFor(name) } })
      .then((r) => { if (live) { setUrl(r.url); setFailed(!r.url); } })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [name]);
  return <div className="space-y-3">
    {step === 2 && device === "amazon" && <div className="flex flex-wrap gap-2" role="group" aria-label="Which Fire TV?">
      <Button size="sm" variant={fire === "stick" ? "default" : "outline"} onClick={() => setFire("stick")}>Fire TV Stick</Button>
      <Button size="sm" variant={fire === "television" ? "default" : "outline"} onClick={() => setFire("television")}>Fire TV television</Button>
    </div>}
    {url ? <video key={url} src={url} controls playsInline preload="metadata"
        controlsList="nodownload noremoteplayback noplaybackrate" disablePictureInPicture disableRemotePlayback
        onContextMenu={(e) => e.preventDefault()}
        className="aspect-video w-full rounded-lg border border-border bg-surface-2" />
      : <p className="rounded-lg border border-border bg-surface-2 p-6 text-center text-sm text-muted-foreground">{failed ? "This video couldn't be loaded. Please try again." : "Loading video…"}</p>}
  </div>;
}
