import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Upload, Play, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { key: "official_server", label: "Official Service App" },
  { key: "official_3rd_party", label: "Official 3rd Party App" },
  { key: "rebranded", label: "Rebranded Apps" },
] as const;
type CategoryKey = (typeof CATEGORIES)[number]["key"];

type Demo = {
  id: string;
  title: string;
  description: string | null;
  app_name: string | null;
  video_path: string;
  poster_path: string | null;
  sort_order: number;
  is_active: boolean;
  category: CategoryKey;
  created_at: string;
};

type Draft = Partial<Demo> & { _videoFile?: File | null; _posterFile?: File | null };

const BUCKET = "app-demos";

function useSignedUrl(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancel = false;
    if (!path) {
      setUrl(null);
      return;
    }
    supabase.storage.from(BUCKET).createSignedUrl(path, 3600).then(({ data }) => {
      if (!cancel) setUrl(data?.signedUrl ?? null);
    });
    return () => {
      cancel = true;
    };
  }, [path]);
  return url;
}

function DemoCard({ demo, isAdmin, onEdit, onDelete, onPlay }: { demo: Demo; isAdmin: boolean; onEdit: () => void; onDelete: () => void; onPlay: () => void }) {
  const posterUrl = useSignedUrl(demo.poster_path);
  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden shadow-soft">
      <button
        type="button"
        onClick={onPlay}
        className="relative aspect-video w-full bg-black grid place-items-center group overflow-hidden"
      >
        {posterUrl && (
          <img src={posterUrl} alt={demo.title} className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 transition" />
        )}
        <span className="relative z-10 size-14 rounded-full bg-black/60 text-white grid place-items-center backdrop-blur group-hover:scale-110 group-hover:bg-black/70 transition">
          <Play className="size-7 fill-white" />
        </span>
      </button>
      <div className="p-3 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-semibold text-sm">{demo.title}</div>
            {demo.app_name && <div className="text-xs text-muted-foreground">{demo.app_name}</div>}
          </div>
          {isAdmin && (
            <div className="flex gap-1 shrink-0">
              <Button size="sm" variant="ghost" onClick={onEdit}><Pencil className="size-3.5" /></Button>
              <Button size="sm" variant="ghost" onClick={onDelete}><Trash2 className="size-3.5" /></Button>
            </div>
          )}
        </div>
        {demo.description && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{demo.description}</p>}
        {isAdmin && !demo.is_active && <div className="text-[10px] uppercase text-amber-500">Hidden</div>}
      </div>
    </div>
  );
}

export function AppDemosView() {
  const { hasAny } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const [items, setItems] = useState<Demo[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeCat, setActiveCat] = useState<CategoryKey>("official_server");
  const [playing, setPlaying] = useState<Demo | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("app_demos")
      .select("*")
      .order("sort_order")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setItems((data as Demo[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const uploadFile = async (file: File, kind: "video" | "poster") => {
    const ext = file.name.split(".").pop() || (kind === "video" ? "mp4" : "jpg");
    const path = `${kind}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: "3600",
      contentType: file.type || undefined,
      upsert: false,
    });
    if (error) throw error;
    return path;
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.title?.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!draft.id && !draft._videoFile) {
      toast.error("Please choose a video file");
      return;
    }
    setSaving(true);
    try {
      let videoPath = draft.video_path ?? "";
      let posterPath = draft.poster_path ?? null;
      if (draft._videoFile) videoPath = await uploadFile(draft._videoFile, "video");
      if (draft._posterFile) posterPath = await uploadFile(draft._posterFile, "poster");

      if (draft.id) {
        const { error } = await supabase
          .from("app_demos")
          .update({
            title: draft.title!,
            description: draft.description ?? null,
            app_name: draft.app_name ?? null,
            video_path: videoPath,
            poster_path: posterPath,
            sort_order: draft.sort_order ?? 100,
            is_active: draft.is_active ?? true,
            category: (draft.category ?? "official_server") as CategoryKey,
          })
          .eq("id", draft.id);
        if (error) throw error;
      } else {
        const { data: u } = await supabase.auth.getUser();
        const { error } = await supabase.from("app_demos").insert({
          title: draft.title!,
          description: draft.description ?? null,
          app_name: draft.app_name ?? null,
          video_path: videoPath,
          poster_path: posterPath,
          sort_order: draft.sort_order ?? 100,
          is_active: draft.is_active ?? true,
          category: (draft.category ?? activeCat) as CategoryKey,
          created_by: u.user?.id ?? null,
        });
        if (error) throw error;
      }
      toast.success("Saved");
      setDraft(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (d: Demo) => {
    if (!confirm(`Delete "${d.title}"?`)) return;
    const paths = [d.video_path, d.poster_path].filter(Boolean) as string[];
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
    const { error } = await supabase.from("app_demos").delete().eq("id", d.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Deleted");
    load();
  };

  return (
    <main className="relative flex-1 overflow-visible md:overflow-y-auto md:scrollbar-hide">
      <div className="relative max-w-6xl mx-auto px-4 md:px-6 py-6 space-y-6">
        <header className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-bold">App Demos</h1>
            <p className="text-sm text-muted-foreground">Short video walkthroughs of our apps.</p>
          </div>
          {isAdmin && (
            <Button onClick={() => setDraft({ is_active: true, sort_order: 100, category: activeCat })}>
              <Plus className="size-4" /> Upload demo
            </Button>
          )}
        </header>

        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => {
            const count = items.filter((i) => i.category === c.key).length;
            const active = activeCat === c.key;
            return (
              <button
                key={c.key}
                onClick={() => setActiveCat(c.key)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium border transition",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-surface-2 text-muted-foreground border-border hover:text-foreground",
                )}
              >
                {c.label} <span className="opacity-70 ml-1">{count}</span>
              </button>
            );
          })}
        </div>

        {(() => {
          const filtered = items.filter((i) => i.category === activeCat);
          if (loading) return (
            <div className="py-16 grid place-items-center text-muted-foreground">
              <Loader2 className="size-6 animate-spin" />
            </div>
          );
          if (filtered.length === 0) return (
            <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
              <Play className="size-8 mx-auto mb-2 opacity-50" />
              No demos in this category yet.
            </div>
          );
          return (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((d) => (
                <DemoCard key={d.id} demo={d} isAdmin={isAdmin} onEdit={() => setDraft(d)} onDelete={() => remove(d)} onPlay={() => setPlaying(d)} />
              ))}
            </div>
          );
        })()}

      </div>

      <Dialog open={!!draft} onOpenChange={(o) => !o && !saving && setDraft(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit demo" : "Upload demo"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-3">
              <div>
                <Label>Title</Label>
                <Input value={draft.title ?? ""} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              </div>
              <div>
                <Label>Category</Label>
                <select
                  className="w-full h-10 rounded-md border border-border bg-surface-2 px-3 text-sm"
                  value={(draft.category as string) ?? activeCat}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value as CategoryKey })}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>App name</Label>
                <Input value={draft.app_name ?? ""} onChange={(e) => setDraft({ ...draft, app_name: e.target.value })} />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea rows={3} value={draft.description ?? ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </div>
              <div>
                <Label>Video file {draft.id && <span className="text-xs text-muted-foreground">(leave empty to keep current)</span>}</Label>
                <Input
                  type="file"
                  accept="video/*"
                  onChange={(e) => setDraft({ ...draft, _videoFile: e.target.files?.[0] ?? null })}
                />
              </div>
              <div>
                <Label>Poster image (optional)</Label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setDraft({ ...draft, _posterFile: e.target.files?.[0] ?? null })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Sort order</Label>
                  <Input type="number" value={draft.sort_order ?? 100} onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })} />
                </div>
                <div className="flex items-end gap-2">
                  <Switch checked={draft.is_active ?? true} onCheckedChange={(v) => setDraft({ ...draft, is_active: v })} />
                  <Label>Active</Label>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={saving} onClick={() => setDraft(null)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PlayerDialog demo={playing} onClose={() => setPlaying(null)} />
    </main>
  );
}

function PlayerDialog({ demo, onClose }: { demo: Demo | null; onClose: () => void }) {
  const videoUrl = useSignedUrl(demo?.video_path);
  const posterUrl = useSignedUrl(demo?.poster_path);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!videoUrl) return;
    const el = videoRef.current;
    if (!el) return;
    const tryFullscreen = () => {
      const anyEl = el as HTMLVideoElement & {
        webkitRequestFullscreen?: () => Promise<void>;
        webkitEnterFullscreen?: () => void;
      };
      if (anyEl.requestFullscreen) anyEl.requestFullscreen().catch(() => {});
      else if (anyEl.webkitRequestFullscreen) anyEl.webkitRequestFullscreen();
      else if (anyEl.webkitEnterFullscreen) anyEl.webkitEnterFullscreen();
    };
    const t = setTimeout(tryFullscreen, 100);
    return () => clearTimeout(t);
  }, [videoUrl]);

  return (
    <Dialog open={!!demo} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl w-[95vw] p-0 bg-black border-border overflow-hidden sm:rounded-xl">
        {demo && (
          <div>
            <div className="aspect-video w-full bg-black grid place-items-center">
              {videoUrl ? (
                <video
                  ref={videoRef}
                  src={videoUrl}
                  poster={posterUrl ?? undefined}
                  controls
                  controlsList="nodownload noremoteplayback noplaybackrate"
                  disablePictureInPicture
                  disableRemotePlayback
                  onContextMenu={(e) => e.preventDefault()}
                  autoPlay
                  playsInline
                  className="w-full h-full object-contain bg-black"
                />
              ) : (
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              )}
            </div>
            <div className="px-4 py-3 bg-background">
              <div className="font-semibold text-base">{demo.title}</div>
              {demo.app_name && <div className="text-xs text-muted-foreground">{demo.app_name}</div>}
              {demo.description && <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-2">{demo.description}</p>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}