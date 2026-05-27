import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Upload, Loader2, Trash2, Save, Image as ImageIcon, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_approved/admin-affiliate-banners")({
  component: AdminAffiliateBannersPage,
});

type Banner = {
  id: string;
  name: string;
  image_url: string;
  link_url: string | null;
  alt_text: string | null;
  created_at: string;
};
type Board = { id: string; name: string; slug: string };
type Assignment = { board_id: string; banner_id: string };

const BUCKET = "affiliate-banners";

function AdminAffiliateBannersPage() {
  const { user, hasAny } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const [banners, setBanners] = useState<Banner[] | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [newName, setNewName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const [{ data: bs }, { data: brds }, { data: asg }] = await Promise.all([
      supabase.from("affiliate_banners").select("id, name, image_url, link_url, alt_text, created_at").order("created_at", { ascending: false }),
      supabase.from("forum_boards").select("id, name, slug").order("sort_order"),
      supabase.from("forum_board_affiliate_banners").select("board_id, banner_id"),
    ]);
    setBanners((bs ?? []) as Banner[]);
    setBoards((brds ?? []) as Board[]);
    setAssignments((asg ?? []) as Assignment[]);
  };

  useEffect(() => { if (isAdmin) void load(); }, [isAdmin]);

  if (!isAdmin) return <Navigate to="/admin" />;

  const uploadBanner = async (file: File) => {
    if (!user) return;
    if (!file.type.startsWith("image/")) { toast.error("Please choose an image file"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5MB"); return; }
    const name = newName.trim() || file.name.replace(/\.[^.]+$/, "");
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const { error: insErr } = await supabase.from("affiliate_banners").insert({
        name, image_url: pub.publicUrl, created_by: user.id,
      });
      if (insErr) throw insErr;
      setNewName("");
      toast.success("Banner uploaded");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const updateField = async (id: string, patch: Partial<Banner>) => {
    setBanners((cur) => (cur ?? []).map((b) => b.id === id ? { ...b, ...patch } : b));
  };

  const saveBanner = async (b: Banner) => {
    const { error } = await supabase.from("affiliate_banners").update({
      name: b.name, link_url: b.link_url || null, alt_text: b.alt_text || null,
    }).eq("id", b.id);
    if (error) { toast.error("Save failed", { description: error.message }); return; }
    toast.success("Saved");
  };

  const deleteBanner = async (b: Banner) => {
    if (!confirm(`Delete banner "${b.name}"? Boards using it will lose this banner.`)) return;
    // Try to delete the storage file (best-effort)
    try {
      const url = new URL(b.image_url);
      const idx = url.pathname.indexOf(`/${BUCKET}/`);
      if (idx >= 0) {
        const path = url.pathname.slice(idx + BUCKET.length + 2);
        await supabase.storage.from(BUCKET).remove([path]);
      }
    } catch { /* ignore */ }
    const { error } = await supabase.from("affiliate_banners").delete().eq("id", b.id);
    if (error) { toast.error("Delete failed", { description: error.message }); return; }
    toast.success("Banner deleted");
    await load();
  };

  const toggleBoard = async (banner: Banner, boardId: string, assign: boolean) => {
    if (assign) {
      const { error } = await supabase
        .from("forum_board_affiliate_banners")
        .insert({ board_id: boardId, banner_id: banner.id });
      if (error) { toast.error("Couldn't assign banner", { description: error.message }); return; }
      setAssignments((cur) => [...cur, { board_id: boardId, banner_id: banner.id }]);
    } else {
      const { error } = await supabase
        .from("forum_board_affiliate_banners")
        .delete()
        .eq("board_id", boardId)
        .eq("banner_id", banner.id);
      if (error) { toast.error("Couldn't remove banner", { description: error.message }); return; }
      setAssignments((cur) => cur.filter((a) => !(a.board_id === boardId && a.banner_id === banner.id)));
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/admin"><ArrowLeft className="size-4 mr-1" />Admin</Link>
      </Button>
      <div>
        <h1 className="font-display text-2xl font-bold">Affiliate banners</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload sidebar advert images and assign them to one or more forum boards.
          Recommended size <strong>512×1536 (1:3)</strong> — images are centered and cropped to fit.
        </p>
      </div>

      <section className="rounded-2xl border border-border bg-surface-1 p-4 space-y-3">
        <h2 className="font-display font-bold text-sm uppercase tracking-wide text-muted-foreground">Upload a new banner</h2>
        <div className="grid sm:grid-cols-[1fr_auto] gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Banner name (e.g. Acme Telecoms — Spring promo)"
            disabled={uploading}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadBanner(f); e.currentTarget.value = ""; }}
          />
          <Button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Upload className="size-4 mr-1" />}
            {uploading ? "Uploading…" : "Upload image"}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">Max 5MB. Use a tall 1:3 image — 512 wide × 1536 tall is ideal.</p>
      </section>

      {!banners ? (
        <div className="grid place-items-center py-10 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
      ) : banners.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface-1 p-8 text-center text-sm text-muted-foreground">
          <ImageIcon className="size-8 mx-auto mb-2 opacity-60" />
          No banners uploaded yet. Upload one above to get started.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {banners.map((b) => (
            <div key={b.id} className="rounded-2xl border border-border bg-surface-1 overflow-hidden">
              <div className="grid grid-cols-[112px_1fr] gap-3 p-3">
                <div className="rounded-lg overflow-hidden bg-background border border-border">
                  <img src={b.image_url} alt={b.alt_text ?? b.name} className="w-full aspect-[1/3] object-cover object-center" />
                </div>
                <div className="min-w-0 space-y-2">
                  <Input value={b.name} onChange={(e) => updateField(b.id, { name: e.target.value })} placeholder="Name" />
                  <Input value={b.link_url ?? ""} onChange={(e) => updateField(b.id, { link_url: e.target.value })} placeholder="Click-through URL (optional)" />
                  <Input value={b.alt_text ?? ""} onChange={(e) => updateField(b.id, { alt_text: e.target.value })} placeholder="Alt text (optional)" />
                  <div className="flex items-center justify-between gap-2">
                    <a href={b.image_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                      <ExternalLink className="size-3" /> Open image
                    </a>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => void saveBanner(b)}>
                        <Save className="size-3.5 mr-1" />Save
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => void deleteBanner(b)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="border-t border-border bg-background/60 p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Assign to forum boards</div>
                {boards.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No forum boards.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-1.5">
                    {boards.map((br) => {
                      const checked = assignments.some((a) => a.board_id === br.id && a.banner_id === b.id);
                      return (
                        <label key={br.id} className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded-md border ${checked ? "border-primary/50 bg-primary/10" : "border-border bg-surface-2/60"}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => void toggleBoard(b, br.id, e.target.checked)}
                          />
                          <span className="truncate">{br.name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}