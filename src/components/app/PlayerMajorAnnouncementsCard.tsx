import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Megaphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Row = { id: string; title: string; body: string; active: boolean; created_at: string; image_path: string | null; image_url?: string | null };
const MAX = 4000;

/** Longer announcements opened from the top-right icon in every BM Player; separate from the bottom bar. */
export function PlayerMajorAnnouncementsCard({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const load = async () => {
    const { data, error } = await supabase.from("player_major_announcements").select("id, title, body, active, created_at, image_path")
      .order("created_at", { ascending: false }).limit(50);
    if (error) toast.error("Couldn't load announcements.");
    const withPics = await Promise.all((data ?? []).map(async (r) => {
      if (!r.image_path || !r.active) return r;
      const { data: s } = await supabase.storage.from("player-announcements").createSignedUrl(r.image_path, 3600);
      return { ...r, image_url: s?.signedUrl ?? null };
    }));
    setRows(withPics);
  };
  useEffect(() => { void load(); }, []);

  const post = async () => {
    if (!title.trim() || !body.trim()) return;
    setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    let image_path: string | null = null;
    if (file) {
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      image_path = `${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from("player-announcements").upload(image_path, file, { contentType: file.type });
      if (up.error) { setBusy(false); toast.error("Couldn't upload the picture (JPG, PNG or WebP up to 5 MB)."); return; }
    }
    const { error } = await supabase.from("player_major_announcements")
      .insert({ title: title.trim(), body: body.trim(), created_by: auth.user?.id, image_path });
    setBusy(false);
    if (error) { toast.error("Couldn't post the announcement."); return; }
    setTitle(""); setBody(""); setFile(null); toast.success("Posted to every BM Player's announcement icon."); void load();
  };
  const remove = async (id: string) => {
    setBusy(true);
    const { error } = await supabase.from("player_major_announcements").update({ active: false, ended_at: new Date().toISOString() }).eq("id", id);
    setBusy(false);
    if (error) toast.error("Couldn't remove it."); else { toast.success("Removed from BM Players."); void load(); }
  };
  const fmt = (d: string) => new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="max-w-2xl space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="size-4" /> Back to tools</Button>
      <section className="rounded-2xl border border-border bg-surface-1 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Megaphone className="size-5 text-primary" />
          <h2 className="font-display text-lg font-bold">BM Player major announcements</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          These sit behind the announcement icon at the top right of every BM Player. The icon shows a counter of ones the customer hasn't opened yet. They stay until you remove them. The short message along the bottom of the player is in its own tab.
        </p>
        <Input value={title} maxLength={120} placeholder="Title" onChange={(e) => setTitle(e.target.value)} />
        <Textarea value={body} maxLength={MAX} rows={7} placeholder="Full announcement" onChange={(e) => setBody(e.target.value)} />
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Picture (optional)</span>
          <span className="block text-xs text-muted-foreground">With a picture, the app shows it as a card with the title underneath; the full text opens when the card is pressed. A wide 16:9 picture looks best.</span>
          <Input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        {file && <img src={URL.createObjectURL(file)} alt="Chosen announcement picture" className="aspect-video w-60 rounded-lg object-cover" />}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">{body.length}/{MAX}</span>
          <Button onClick={post} disabled={busy || !title.trim() || !body.trim()}>
            {busy && <Loader2 className="size-4 animate-spin" />} Post to all BM Players
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface-1 p-5 space-y-3">
        <h3 className="font-display font-bold">Showing in BM Players</h3>
        {rows === null ? <Loader2 className="size-4 animate-spin" /> : rows.filter((r) => r.active).length === 0 ? (
          <p className="text-sm text-muted-foreground">No major announcements are showing.</p>
        ) : (
          <ul className="space-y-2">
            {rows.filter((r) => r.active).map((r) => (
              <li key={r.id} className="rounded-xl border border-primary/40 bg-primary/10 p-3">
                <div className="flex items-start gap-3">
                  {r.image_url && <img src={r.image_url} alt={r.title} className="aspect-video w-32 shrink-0 rounded-md object-cover" />}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">{r.title}</p>
                    <p className="text-sm whitespace-pre-wrap">{r.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Posted {fmt(r.created_at)}</p>
                  </div>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => remove(r.id)}><Trash2 className="size-4" /> Remove</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {rows && rows.some((r) => !r.active) && (
          <>
            <h3 className="font-display font-bold pt-2">Removed</h3>
            <ul className="space-y-2">
              {rows.filter((r) => !r.active).map((r) => (
                <li key={r.id} className="rounded-xl border border-border p-3 text-sm">
                  <p className="font-semibold">{r.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Posted {fmt(r.created_at)}</p>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
