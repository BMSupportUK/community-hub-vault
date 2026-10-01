import { useEffect, useRef, useState } from "react";
import { Loader2, Play, Upload, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useGuideVideoUrl } from "@/hooks/use-guide-video-url";
import { compressVideoFile } from "@/lib/compress-video";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const VIDEO_BUCKET = "guide-videos";

type VideoSetting = { ref?: string };

type SecureHowToVideoProps = {
  canManage: boolean;
  settingsKey: string;
  pathPrefix: string;
  title: string;
  emptyHint: string;
  className?: string;
};

export function SecureHowToVideo({
  canManage,
  settingsKey,
  pathPrefix,
  title,
  emptyHint,
  className,
}: SecureHowToVideoProps) {
  const [videoRefValue, setVideoRefValue] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [compressPct, setCompressPct] = useState<number | null>(null);
  const [started, setStarted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const playerRef = useRef<HTMLVideoElement>(null);
  const signedUrl = useGuideVideoUrl(videoRefValue);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", settingsKey)
        .maybeSingle();
      if (cancelled) return;
      if (error) toast.error(error.message);
      const value = data?.value as VideoSetting | null | undefined;
      setVideoRefValue(value?.ref ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [settingsKey]);

  const upload = async (file: File) => {
    if (!file.type.startsWith("video/")) {
      toast.error("Please choose a video file");
      return;
    }
    if (file.size > 200 * 1024 * 1024) {
      toast.error("Video must be under 200MB");
      return;
    }

    setUploading(true);
    try {
      setCompressPct(0);
      const compressed = await compressVideoFile(file, (_stage, pct) => setCompressPct(pct));
      setCompressPct(null);
      const ext = compressed.name.split(".").pop()?.toLowerCase() || "mp4";
      const path = `how-to/${pathPrefix}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from(VIDEO_BUCKET)
        .upload(path, compressed, {
          cacheControl: "3600",
          contentType: compressed.type || "video/mp4",
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const nextRef = `${VIDEO_BUCKET}:${path}`;
      const { error: settingError } = await supabase.from("app_settings").upsert(
        {
          key: settingsKey,
          value: { ref: nextRef },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
      if (settingError) {
        await supabase.storage.from(VIDEO_BUCKET).remove([path]);
        throw settingError;
      }

      setVideoRefValue(nextRef);
      setStarted(false);
      toast.success("How-to video updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
      setCompressPct(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const playFullscreen = async () => {
    const player = playerRef.current;
    if (!player) return;
    setStarted(true);
    try {
      const iosPlayer = player as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
      if (player.requestFullscreen) await player.requestFullscreen();
      else iosPlayer.webkitEnterFullscreen?.();
    } catch {
      // Full-screen can be restricted by a device; playback must still work.
    }
    await player.play().catch(() => undefined);
  };

  return (
    <section className={cn("rounded-xl border border-purple-500/30 bg-purple-950/55 p-4 shadow-lg", className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-purple-50">
          <Video className="size-5 text-fuchsia-300" /> {title}
        </h3>
        {canManage && (
          <>
            <Button
              type="button"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white hover:from-fuchsia-500 hover:to-purple-500"
            >
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              {uploading
                ? compressPct === null
                  ? "Uploading…"
                  : `Preparing ${compressPct}%`
                : videoRefValue
                  ? "Replace video"
                  : "Upload video"}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />
          </>
        )}
      </div>

      {loading || (videoRefValue && !signedUrl) ? (
        <div className="grid aspect-video place-items-center rounded-lg border border-purple-500/20 bg-purple-950/60 text-purple-200/70">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : signedUrl ? (
        <div className="relative aspect-video overflow-hidden rounded-lg border border-purple-500/30 bg-background">
          <video
            ref={playerRef}
            key={signedUrl}
            src={signedUrl}
            controls={started}
            controlsList="nodownload noremoteplayback noplaybackrate"
            disablePictureInPicture
            disableRemotePlayback
            playsInline
            preload="metadata"
            onContextMenu={(event) => event.preventDefault()}
            onEnded={() => setStarted(false)}
            className="size-full bg-background object-contain"
          />
          {!started && (
            <Button
              type="button"
              size="icon"
              onClick={() => void playFullscreen()}
              aria-label="Play how to refer a friend video in full screen"
              className="absolute left-1/2 top-1/2 size-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary text-primary-foreground shadow-xl hover:bg-primary/90"
            >
              <Play className="size-8 fill-current" />
            </Button>
          )}
        </div>
      ) : (
        <div className="grid aspect-video place-items-center rounded-lg border border-dashed border-purple-500/30 bg-purple-950/40 px-6 text-center text-sm text-purple-200/70">
          {canManage ? emptyHint : "A referral walkthrough video is coming soon."}
        </div>
      )}
    </section>
  );
}