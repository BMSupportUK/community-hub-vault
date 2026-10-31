import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getGuideVideoUrl } from "@/lib/guide-video.functions";

// One private video per wizard step per TV type, played only through short-lived signed links.
const refFor = (device: "amazon" | "android", step: number) =>
  `guide-videos:install-tutorials/direct-${device}-step${step + 1}.mp4`;

/** Direct Install tutorial for the step currently shown (Amazon or Android / Google TV). */
export function DirectInstallVideo({ step, device }: { step: number; device: "amazon" | "android" | null }) {
  const [pick, setPick] = useState<"amazon" | "android">(device ?? "amazon");
  useEffect(() => { if (device) setPick(device); }, [device]);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setUrl(null); setFailed(false);
    getGuideVideoUrl({ data: { ref: refFor(pick, step) } })
      .then((r) => { if (live) { setUrl(r.url); setFailed(!r.url); } })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [pick, step]);
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2" role="group" aria-label="Which TV?">
      <Button size="sm" variant={pick === "amazon" ? "default" : "outline"} onClick={() => setPick("amazon")}>Amazon Fire TV</Button>
      <Button size="sm" variant={pick === "android" ? "default" : "outline"} onClick={() => setPick("android")}>Android / Google TV</Button>
    </div>
    {url ? <video key={url} src={url} controls playsInline preload="metadata"
      controlsList="nodownload noremoteplayback noplaybackrate" disablePictureInPicture disableRemotePlayback
      onContextMenu={(e) => e.preventDefault()}
      className="aspect-video w-full rounded-lg border border-border bg-surface-2" />
    : <p className="rounded-lg border border-border bg-surface-2 p-6 text-center text-sm text-muted-foreground">{failed ? "This video isn't ready yet. Please try again later." : "Loading video…"}</p>}
  </div>;
}
