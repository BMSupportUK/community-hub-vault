import { useRef, useState } from "react";
import { Upload, Loader2, X, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { generateHeaderImage } from "@/lib/header-image.functions";

type Props = {
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  bucket?: string;
  folder?: string;
};

export function HeaderImageUpload({ value, onChange, bucket = "blog-headers", folder }: Props) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const genFn = useServerFn(generateHeaderImage);

  const upload = async (file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("Please choose an image file"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5MB"); return; }
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const prefix = folder ? `${folder}/` : "";
    const path = `${prefix}${user?.id ?? "anon"}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from(bucket).upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
    if (error) { setUploading(false); toast.error(error.message); return; }
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    onChange(data.publicUrl);
    setUploading(false);
    toast.success("Header uploaded");
  };

  const generate = async () => {
    if (aiPrompt.trim().length < 3) { toast.error("Describe the image (min 3 characters)"); return; }
    setGenerating(true);
    try {
      const res = await genFn({ data: { prompt: aiPrompt.trim(), bucket: bucket as "blog-headers", folder } });
      onChange(res.url);
      toast.success("Header generated");
      setAiOpen(false);
      setAiPrompt("");
    } catch (e: any) {
      toast.error(e?.message ?? "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-2">
      {value ? (
        <div className="relative w-full h-40 rounded-lg overflow-hidden border border-border bg-muted">
          <img src={value} alt="Header preview" className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute top-2 right-2 p-1 rounded-md bg-background/80 hover:bg-background border border-border"
            aria-label="Remove header image"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <div className="w-full h-40 rounded-lg border border-dashed border-border bg-muted/40 flex items-center justify-center text-sm text-muted-foreground">
          No header image
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.currentTarget.value = ""; }}
        />
        <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Upload className="size-4 mr-1" />}
          {uploading ? "Uploading…" : value ? "Replace image" : "Upload image"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setAiOpen(true)} disabled={uploading}>
          <Sparkles className="size-4 mr-1" />
          Generate with AI
        </Button>
        <Input
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder="…or paste an image URL"
          className="flex-1"
        />
      </div>

      <Dialog open={aiOpen} onOpenChange={(o) => { if (!generating) setAiOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate header image with AI</DialogTitle>
            <DialogDescription>
              Describe the cover image you want. Be specific about subject, style, mood, and colors.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="e.g. A wide cinematic shot of a glowing data center at night, blue and purple neon lights, ultra detailed, no text"
            rows={5}
            disabled={generating}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAiOpen(false)} disabled={generating}>Cancel</Button>
            <Button type="button" onClick={generate} disabled={generating}>
              {generating ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Sparkles className="size-4 mr-1" />}
              {generating ? "Generating…" : "Generate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}