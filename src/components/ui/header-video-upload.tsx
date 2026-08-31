import { useRef, useState } from "react";
import { useGuideVideoUrl } from "@/hooks/use-guide-video-url";
import { Upload, Loader2, X, Film } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Props = {
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  bucket?: string;
  folder?: string;
  /** Store in the private guide-videos bucket and play via signed URLs only. */
  secure?: boolean;
};

export function HeaderVideoUpload({ value, onChange, bucket = "kb-videos", folder, secure = false }: Props) {
  const effectiveBucket = secure ? "guide-videos" : bucket;
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    if (!file.type.startsWith("video/")) { toast.error("Please choose a video file"); return; }
    if (file.size > 200 * 1024 * 1024) { toast.error("Video must be under 200MB"); return; }
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "mp4";
    const prefix = folder ? `${folder}/` : "";
    const path = `${prefix}${user?.id ?? "anon"}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from(effectiveBucket).upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
    if (error) { setUploading(false); toast.error(error.message); return; }
    if (secure) {
      onChange(`guide-videos:${path}`);
    } else {
      const { data } = supabase.storage.from(effectiveBucket).getPublicUrl(path);
      onChange(data.publicUrl);
    }
    setUploading(false);
    toast.success("Video uploaded");
  };

  return (
    <div className="space-y-2">
      {value ? (
        <div className="relative w-full rounded-lg overflow-hidden border border-border bg-black">
          <SecurePreview value={value} secure={secure} />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute top-2 right-2 p-1 rounded-md bg-background/80 hover:bg-background border border-border"
            aria-label="Remove video"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <div className="w-full h-24 rounded-lg border border-dashed border-border bg-muted/40 flex items-center justify-center text-sm text-muted-foreground gap-2">
          <Film className="size-4" /> No video
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.currentTarget.value = ""; }}
        />
        <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Upload className="size-4 mr-1" />}
          {uploading ? "Uploading…" : value ? "Replace video" : "Upload video"}
        </Button>
        <Input
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder="…or paste a video URL (mp4, webm)"
          className="flex-1"
        />
      </div>
    </div>
  );
}
function SecurePreview({ value, secure }: { value: string; secure: boolean }) {
  const signed = useGuideVideoUrl(secure ? value : null);
  const src = secure ? signed : value;
  return (
    <video
      src={src ?? undefined}
      controls
      controlsList="nodownload noremoteplayback noplaybackrate"
      disablePictureInPicture
      onContextMenu={(e) => e.preventDefault()}
      className="w-full max-h-56 bg-black"
      preload="metadata"
    />
  );
}
