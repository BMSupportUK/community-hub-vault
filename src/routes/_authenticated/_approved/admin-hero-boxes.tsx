import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Save, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_approved/admin-hero-boxes")({
  component: AdminHeroBoxesPage,
});

interface HeroBox {
  id: string;
  position: number;
  icon_url: string | null;
  title: string;
  description: string;
}

function AdminHeroBoxesPage() {
  const { hasAny } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const [boxes, setBoxes] = useState<HeroBox[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("hero_boxes")
      .select("id, position, icon_url, title, description")
      .order("position");
    if (error) toast.error(error.message);
    setBoxes((data ?? []) as HeroBox[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (!isAdmin) return <Navigate to="/home" />;

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <header className="flex items-center gap-3 mb-6">
          <div className="size-12 rounded-2xl bg-gradient-primary grid place-items-center shadow-glow">
            <Sparkles className="size-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">Landing hero boxes</h1>
            <p className="text-sm text-muted-foreground">Edit the three boxes shown on the public landing page.</p>
          </div>
        </header>

        {loading ? (
          <div className="grid place-items-center py-16 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
        ) : (
          <div className="space-y-4">
            {boxes.map((b) => (
              <BoxEditor key={b.id} box={b} onSaved={load} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function BoxEditor({ box, onSaved }: { box: HeroBox; onSaved: () => void }) {
  const [title, setTitle] = useState(box.title);
  const [description, setDescription] = useState(box.description);
  const [iconUrl, setIconUrl] = useState<string | null>(box.icon_url);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      toast.error("Icon must be under 1MB");
      return;
    }
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `box-${box.position}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("hero-box-icons")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("hero-box-icons").getPublicUrl(path);
      setIconUrl(pub.publicUrl);
      toast.success("Icon uploaded");
    } catch (err: any) {
      toast.error(err.message ?? "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = async () => {
    if (!title.trim()) return toast.error("Title is required");
    setBusy(true);
    const { error } = await supabase
      .from("hero_boxes")
      .update({ title: title.trim(), description: description.trim(), icon_url: iconUrl })
      .eq("id", box.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    onSaved();
  };

  return (
    <div className="rounded-2xl border border-border bg-surface-1 p-5">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Box {box.position + 1}</div>
      <div className="flex gap-4">
        <div className="shrink-0">
          <div className="size-20 rounded-2xl border border-border bg-surface-2 grid place-items-center overflow-hidden">
            {iconUrl ? (
              <img src={iconUrl} alt="" className="size-full object-contain p-2" />
            ) : (
              <ImagePlus className="size-6 text-muted-foreground" />
            )}
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="mt-2 w-20 text-xs px-2 py-1.5 rounded-md bg-surface-2 border border-border hover:bg-surface-3 disabled:opacity-60 inline-flex items-center justify-center gap-1"
          >
            {uploading ? <Loader2 className="size-3 animate-spin" /> : <ImagePlus className="size-3" />}
            {uploading ? "…" : "Upload"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={onPickFile}
          />
        </div>
        <div className="flex-1 space-y-3">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 80))}
              className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm"
              placeholder="e.g. Community Channels"
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 240))}
              rows={3}
              className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm resize-none"
              placeholder="One short sentence describing this box"
            />
            <div className="text-[11px] text-muted-foreground mt-1 text-right">{description.length}/240</div>
          </div>
        </div>
      </div>
      <div className="flex justify-end mt-4">
        <button
          onClick={save}
          disabled={busy}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60 inline-flex items-center gap-2"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save
        </button>
      </div>
    </div>
  );
}