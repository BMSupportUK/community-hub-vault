import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { getGuideVideoUrl } from "@/lib/guide-video.functions";

// Private guide-videos files, played only through short-lived signed links.
const VIDEOS = {
  amazon: "guide-videos:install-tutorials/direct-install-amazon.mp4",
  android: "guide-videos:install-tutorials/direct-install-android.mp4",
} as const;

/** Start time (seconds) of each of the six wizard steps inside each video. */
export const DIRECT_VIDEO_CHAPTERS: Record<keyof typeof VIDEOS, number[]> = {
  amazon: [0, 0, 0, 0, 0, 0],
  android: [0, 0, 0, 0, 0, 0],
};

/** Direct Install tutorial: Amazon or Android/Google TV, jumping to the current step. */
export function DirectInstallVideo({ step, device }: { step: number; device: "amazon" | "android" | null }) {
  const [pick, setPick] = useState<"amazon" | "android">(device ?? "amazon");
  useEffect(() => { if (device) setPick(device); }, [device]);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    let live = true;
    setUrl(null); setFailed(false);
    getGuideVideoUrl({ data: { ref: VIDEOS[pick] } })
      .then((r) => { if (live) { setUrl(r.url); setFailed(!r.url); } })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [pick]);
  const start = DIRECT_VIDEO_CHAPTERS[pick][step] ?? 0;
  useEffect(() => { if (ref.current && ref.current.readyState > 0) ref.current.currentTime = start; }, [start]);
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2" role="group" aria-label="Which TV?">
      <Button size="sm" variant={pick === "amazon" ? "default" : "outline"} onClick={() => setPick("amazon")}>Amazon Fire TV</Button>
      <Button size="sm" variant={pick === "android" ? "default" : "outline"} onClick={() => setPick("android")}>Android / Google TV</Button>
    </div>
    {url ? <video ref={ref} key={url} src={url} controls playsInline preload="metadata"
      onLoadedMetadata={(e) => { e.currentTarget.currentTime = start; }}
      controlsList="nodownload noremoteplayback noplaybackrate" disablePictureInPicture disableRemotePlayback
      onContextMenu={(e) => e.preventDefault()}
      className="aspect-video w-full rounded-lg border border-border bg-surface-2" />
    : <p className="rounded-lg border border-border bg-surface-2 p-6 text-center text-sm text-muted-foreground">{failed ? "This video couldn't be loaded. Please try again." : "Loading video…"}</p>}
  </div>;
}
