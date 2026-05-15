import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Headphones, Pencil, Loader2, ImagePlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import welcomeHero from "@/assets/welcome-hero.jpg";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id);
    const roleSet = new Set((roles ?? []).map((r) => r.role as string));
    // Admins/management can view landing to edit hero boxes inline
    if (roleSet.has("admin") || roleSet.has("management")) return;
    throw redirect({ to: "/home" });
  },
  component: Landing,
});

interface HeroBox {
  id: string;
  position: number;
  icon_url: string | null;
  title: string;
  description: string;
}

function Landing() {
  const [boxes, setBoxes] = useState<HeroBox[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [editing, setEditing] = useState<HeroBox | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from("hero_boxes")
      .select("id, position, icon_url, title, description")
      .order("position");
    setBoxes((data ?? []) as HeroBox[]);
  };

  useEffect(() => {
    load();
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id);
      const roleSet = new Set((roles ?? []).map((r) => r.role as string));
      setCanEdit(roleSet.has("admin") || roleSet.has("management"));
    })();
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-8 py-5 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2">
          <div className="size-9 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 shadow-[0_0_30px_rgba(220,38,38,0.6)] grid place-items-center font-display font-bold text-[13px] text-white">BM</div>
          <span className="font-display font-bold text-lg">Support</span>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground px-3 py-2">Sign in</Link>
          <Link to="/signup" className="text-sm font-medium px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-500 shadow-[0_0_24px_rgba(220,38,38,0.55)] transition-all">Request access</Link>
        </div>
      </header>

      <main className="flex-1 px-6 py-10 md:py-16">
        <section
          className="relative max-w-7xl mx-auto rounded-3xl border border-red-900/60 p-8 md:p-14 pb-24 md:pb-32"
          style={{
            background:
              "radial-gradient(1200px 600px at 10% 10%, rgba(248,113,113,0.25), transparent 60%), radial-gradient(900px 500px at 90% 90%, rgba(127,29,29,0.6), transparent 60%), linear-gradient(135deg, #7f1d1d 0%, #991b1b 50%, #450a0a 100%)",
            boxShadow:
              "0 0 80px rgba(220,38,38,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
        >
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div className="space-y-6 text-white">
              <h1 className="font-display text-4xl md:text-6xl font-bold tracking-tight leading-[1.05] drop-shadow-[0_2px_20px_rgba(0,0,0,0.5)]">
                Welcome to <span className="bg-gradient-to-r from-red-200 via-white to-red-300 bg-clip-text text-transparent">BM Support</span>
              </h1>
              <p className="text-lg md:text-xl text-red-50/95 max-w-xl">
                Your all-in-one server for BM Support — stay connected, all in one place.
              </p>
              <p className="text-red-100/80 max-w-xl">
                Access community channels, manage your time, view schedules, get support, and explore our services. Everything you need is just one click away.
              </p>

              <div className="inline-flex items-center gap-3 px-4 py-3 rounded-xl bg-black/40 backdrop-blur-sm border border-red-500/30 shadow-[0_0_30px_rgba(220,38,38,0.25)]">
                <Headphones className="size-4 text-red-300" />
                <span className="text-sm text-red-50">
                  <span className="font-semibold">Expert Support</span> — We're always here to help.
                </span>
                <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)] animate-pulse" />
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-4 bg-gradient-to-tr from-red-500/40 via-transparent to-blue-500/30 blur-2xl rounded-3xl" aria-hidden />
              <div className="relative rounded-3xl overflow-hidden border border-white/20 shadow-[0_20px_80px_rgba(0,0,0,0.6)] aspect-[4/3]">
                <img
                  src={welcomeHero}
                  alt="BM Support hero"
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-tr from-red-950/40 via-transparent to-transparent" aria-hidden />
              </div>
            </div>
          </div>
        </section>

        <div className="relative max-w-7xl mx-auto -mt-12 md:-mt-16 px-6 grid grid-cols-1 sm:grid-cols-3 gap-4 z-10">
          {boxes.map((b) => (
            <div
              key={b.id}
              className="group relative flex items-start gap-4 p-5 rounded-2xl border border-red-400/30 backdrop-blur-md shadow-[0_12px_50px_rgba(127,29,29,0.5)] hover:border-red-300/60 transition-all"
              style={{
                background:
                  "linear-gradient(135deg, rgba(127,29,29,0.9) 0%, rgba(69,10,10,0.9) 100%)",
              }}
            >
              {canEdit && (
                <button
                  onClick={() => setEditing(b)}
                  className="absolute top-2 right-2 size-8 rounded-full bg-black/60 hover:bg-black/80 border border-white/20 grid place-items-center text-white/90 hover:text-white transition opacity-0 group-hover:opacity-100"
                  aria-label="Edit box"
                  title="Edit"
                >
                  <Pencil className="size-4" />
                </button>
              )}
              <div className="shrink-0 size-12 rounded-xl bg-black/40 border border-white/10 grid place-items-center overflow-hidden ring-1 ring-red-500/30 group-hover:ring-red-300/60 transition">
                {b.icon_url ? (
                  <img src={b.icon_url} alt="" className="size-full object-contain p-2" />
                ) : (
                  <span className="text-red-200 text-xs">?</span>
                )}
              </div>
              <div className="min-w-0">
                <div className="font-display font-bold text-white text-base leading-tight">{b.title}</div>
                <p className="text-sm text-red-50/85 mt-1 leading-snug">{b.description}</p>
              </div>
            </div>
          ))}
        </div>
      </main>

      {editing && (
        <EditBoxDialog
          box={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function EditBoxDialog({ box, onClose, onSaved }: { box: HeroBox; onClose: () => void; onSaved: () => void }) {
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
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-background shadow-2xl p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 size-8 rounded-full hover:bg-muted grid place-items-center"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
        <h2 className="font-display text-xl font-bold mb-1">Edit box {box.position + 1}</h2>
        <p className="text-sm text-muted-foreground mb-5">Choose an icon image and update the text.</p>

        <div className="flex gap-4 mb-4">
          <div>
            <div className="size-20 rounded-2xl border border-border bg-muted grid place-items-center overflow-hidden">
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
              className="mt-2 w-20 text-xs px-2 py-1.5 rounded-md bg-muted border border-border hover:bg-accent disabled:opacity-60 inline-flex items-center justify-center gap-1"
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
                className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm"
                placeholder="e.g. Community Channels"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 240))}
                rows={3}
                className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm resize-none"
                placeholder="One short sentence describing this box"
              />
              <div className="text-[11px] text-muted-foreground mt-1 text-right">{description.length}/240</div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60 inline-flex items-center gap-2"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null} Save
          </button>
        </div>
      </div>
    </div>
  );
}
