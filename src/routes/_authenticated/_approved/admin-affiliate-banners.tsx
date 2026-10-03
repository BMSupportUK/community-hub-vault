import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Upload, Loader2, Trash2, Save, ExternalLink, Eye, MousePointerClick } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { AD_SIZES, AD_SIZE_KEYS, ADVERTISE_HERE_NAME, type AdSize } from "@/lib/ad-sizes";
import { AD_SITES, AD_SITE_KEYS, BM_ZONES, BM_ZONE_SIZES, type AdSite } from "@/lib/ad-zones";

export const Route = createFileRoute("/_authenticated/_approved/admin-affiliate-banners")({
  component: AdminAffiliateBannersPage,
  head: () => ({
    meta: [
      { title: "Affiliate Banners | BM Support" },
      { name: "description", content: "Manage BM Support and Boro Fan Zone advert banners and page placements." },
      { property: "og:title", content: "Affiliate Banners | BM Support" },
      { property: "og:description", content: "Manage BM Support and Boro Fan Zone advert banners and page placements." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Banner = {
  id: string;
  name: string;
  image_url: string;
  link_url: string | null;
  alt_text: string | null;
  size: AdSize;
  site: AdSite;
  zones: string[];
  created_at: string;
};
type Board = { id: string; name: string; slug: string };
type Assignment = { board_id: string; banner_id: string };
type BannerStat = { impressions: number; clicks: number };

const BUCKET = "affiliate-banners";

function AdminAffiliateBannersPage() {
  const { user, hasAny } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const [banners, setBanners] = useState<Banner[] | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSize, setNewSize] = useState<AdSize>("skyscraper");
  const [newSite, setNewSite] = useState<AdSite>("bm_support");
  const fileRef = useRef<HTMLInputElement>(null);
  const [placeholders, setPlaceholders] = useState<Banner[]>([]);
  const [phUploading, setPhUploading] = useState<AdSize | null>(null);
  const [stats, setStats] = useState<Record<string, BannerStat>>({});

  const load = async () => {
    const [{ data: bs }, { data: brds }, { data: asg }, { data: statRows }] = await Promise.all([
      supabase.from("affiliate_banners").select("id, name, image_url, link_url, alt_text, size, site, zones, created_at").order("created_at", { ascending: false }),
      supabase.from("forum_boards").select("id, name, slug").order("sort_order"),
      supabase.from("forum_board_affiliate_banners").select("board_id, banner_id"),
      supabase.rpc("ad_event_stats", { _days: 36500 }),
    ]);
    const all = (bs ?? []) as Banner[];
    setPlaceholders(all.filter((b) => b.name === ADVERTISE_HERE_NAME));
    setBanners(all.filter((b) => b.name !== ADVERTISE_HERE_NAME));
    setBoards((brds ?? []) as Board[]);
    setAssignments((asg ?? []) as Assignment[]);
    const totals: Record<string, BannerStat> = {};
    for (const row of statRows ?? []) {
      const id = String(row.ad_slot_id);
      const current = totals[id] ?? { impressions: 0, clicks: 0 };
      current.impressions += Number(row.impressions);
      current.clicks += Number(row.clicks);
      totals[id] = current;
    }
    setStats(totals);
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
        name, image_url: pub.publicUrl, created_by: user.id, size: newSize, site: newSite,
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

  const uploadPlaceholder = async (sizeKey: AdSize, file: File) => {
    if (!user) return;
    if (!file.type.startsWith("image/")) { toast.error("Please choose an image file"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5MB"); return; }
    setPhUploading(sizeKey);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${user.id}/advertise-${sizeKey}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const old = placeholders.filter((p) => p.size === sizeKey);
      const { error: insErr } = await supabase.from("affiliate_banners").insert({
        name: ADVERTISE_HERE_NAME, image_url: pub.publicUrl, created_by: user.id, size: sizeKey, site: "bm_support",
        alt_text: "Advertise here", link_url: "mailto:bmsupport2022@protonmail.com",
      });
      if (insErr) throw insErr;
      if (old.length) await supabase.from("affiliate_banners").delete().in("id", old.map((o) => o.id));
      toast.success(`"Advertise here" ${AD_SIZES[sizeKey].label} updated`);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setPhUploading(null);
    }
  };

  const updateField = async (id: string, patch: Partial<Banner>) => {
    setBanners((cur) => (cur ?? []).map((b) => b.id === id ? { ...b, ...patch } : b));
  };

  const saveBanner = async (b: Banner) => {
    const { error } = await supabase.from("affiliate_banners").update({
      name: b.name, link_url: b.link_url || null, alt_text: b.alt_text || null, size: b.size, site: b.site, zones: b.site === "bm_support" ? b.zones : [],
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
    <div className="w-full h-dvh overflow-y-auto px-4 md:px-8 py-6 space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/admin"><ArrowLeft className="size-4 mr-1" />Owner panel</Link>
      </Button>
      <div>
        <h1 className="font-display text-2xl font-bold">Affiliate banners</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload your own advert banners and assign them to the exact page zones where they should appear.
          Member Home and the public landing page are separate zones. Design your artwork to match:
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {AD_SIZE_KEYS.map((k) => (
            <div key={k} className="rounded-xl border border-border bg-surface-1 p-3">
              <div className="font-semibold text-sm">{AD_SIZES[k].label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{AD_SIZES[k].description}</div>
              <div className="text-xs mt-1.5 font-mono text-foreground">{AD_SIZES[k].recommended}</div>
            </div>
          ))}
        </div>
      </div>

      <section className="rounded-2xl border border-border bg-surface-1 p-4 space-y-3">
        <h2 className="font-display font-bold text-lg">Advertise here</h2>
        <p className="text-xs text-muted-foreground">Upload one version for each size. It receives the same random, equal display time as every other banner.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {AD_SIZE_KEYS.map((k) => {
            const current = placeholders.find((p) => p.size === k);
            return (
              <div key={k} className="rounded-xl border border-border bg-background p-3 space-y-2">
                <div className="font-semibold text-sm">{AD_SIZES[k].label}</div>
                <div className="text-[11px] font-mono text-muted-foreground">{AD_SIZES[k].recommended}</div>
                <div className="rounded-lg border border-border bg-surface-1 overflow-hidden grid place-items-center" style={{ aspectRatio: `${AD_SIZES[k].width} / ${AD_SIZES[k].height}`, maxHeight: 220 }}>
                  {current ? <img src={current.image_url} alt="" className="w-full h-full object-cover" /> : <span className="text-xs text-muted-foreground p-2 text-center">Using built-in default</span>}
                </div>
                 <BannerStats stats={stats[current?.id ?? `__advertise_here__:${k}`]} />
                <label className="block">
                  <input type="file" accept="image/*" className="hidden" disabled={phUploading !== null}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadPlaceholder(k, f); e.currentTarget.value = ""; }} />
                  <span className="inline-flex w-full items-center justify-center gap-1 h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium cursor-pointer">
                    {phUploading === k ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                    {current ? "Replace" : "Upload"}
                  </span>
                </label>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface-1 p-4 space-y-3">
        <h2 className="font-display font-bold text-sm uppercase tracking-wide text-muted-foreground">Upload a new banner</h2>
        <div className="grid sm:grid-cols-[1fr_auto_auto_auto] gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Banner name (e.g. Acme Telecoms — Spring promo)"
            disabled={uploading}
          />
          <select
            value={newSite}
            onChange={(e) => setNewSite(e.target.value as AdSite)}
            disabled={uploading}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            aria-label="Banner site"
          >
            {AD_SITE_KEYS.map((k) => <option key={k} value={k}>{AD_SITES[k]}</option>)}
          </select>
          <select
            value={newSize}
            onChange={(e) => setNewSize(e.target.value as AdSize)}
            disabled={uploading}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            aria-label="Banner size"
          >
            {AD_SIZE_KEYS.map((k) => (
              <option key={k} value={k}>{AD_SIZES[k].label} — {AD_SIZES[k].width}×{AD_SIZES[k].height}</option>
            ))}
          </select>
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
        <p className="text-[11px] text-muted-foreground">Max 5MB. Pick the size your artwork was designed for — slots only rotate banners that fit them.</p>
      </section>

      {!banners ? (
        <div className="grid place-items-center py-10 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
      ) : (
        <>
          <div className="rounded-2xl border border-border bg-surface-1 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">BM Support zones and the sizes each can show</p>
            <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3 text-xs">
              {BM_ZONES.map((z) => (
                <li key={z.key} className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{z.label}</span>
                  <span className="text-muted-foreground text-right">
                    {BM_ZONE_SIZES[z.key].map((s) => `${AD_SIZES[s].label.split(" ")[0]} ${AD_SIZES[s].width}×${AD_SIZES[s].height}`).join(" + ")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        {AD_SIZE_KEYS.map((sizeKey) => (
        <section key={sizeKey} className="space-y-4 rounded-3xl border-2 border-border p-3 md:p-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-xl font-bold">{AD_SIZES[sizeKey].label}</h2>
            <span className="text-xs text-muted-foreground font-mono">{AD_SIZES[sizeKey].recommended}</span>
          </div>
          {AD_SITE_KEYS.map((siteKey) => {
          const sizeBanners = banners.filter((b) => (b.size ?? "skyscraper") === sizeKey && (b.site ?? "bm_support") === siteKey);
          return (
            <div key={siteKey} className="space-y-3">
              <div className="rounded-xl border border-border bg-surface-1 px-4 py-3 flex flex-wrap items-center gap-3">
                <h3 className="font-display font-bold">{AD_SITES[siteKey]}</h3>
                <span className="text-xs rounded-full bg-primary/10 border border-primary/30 px-2 py-0.5 font-semibold">{sizeBanners.length} {sizeBanners.length === 1 ? "banner" : "banners"}</span>
              </div>
              {sizeBanners.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-surface-1 p-5 text-center text-sm text-muted-foreground">No banners in this section yet.</div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {sizeBanners.map((b) => (
                    <div key={b.id} className="rounded-2xl border border-border bg-surface-1 overflow-hidden">
                      <div className="grid grid-cols-[112px_1fr] gap-3 p-3">
                        <div className="space-y-2">
                          <div className="rounded-lg overflow-hidden bg-background border border-border">
                            <img src={b.image_url} alt={b.alt_text ?? b.name} className={`w-full object-center ${b.size === "leaderboard" ? "aspect-[3/1] object-contain" : b.size === "square" ? "aspect-square object-cover" : "aspect-[1/2] object-cover"}`} />
                          </div>
                          <BannerStats stats={stats[b.id]} />
                        </div>
                        <div className="min-w-0 space-y-2">
                          <Input value={b.name} onChange={(e) => updateField(b.id, { name: e.target.value })} placeholder="Name" />
                          <select value={b.size} onChange={(e) => updateField(b.id, { size: e.target.value as AdSize })} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm" aria-label="Banner size">
                            {AD_SIZE_KEYS.map((k) => <option key={k} value={k}>{AD_SIZES[k].label} — {AD_SIZES[k].width}×{AD_SIZES[k].height}</option>)}
                          </select>
                          <select value={b.site} onChange={(e) => updateField(b.id, { site: e.target.value as AdSite })} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm" aria-label="Banner site">
                            {AD_SITE_KEYS.map((k) => <option key={k} value={k}>{AD_SITES[k]}</option>)}
                          </select>
                          <Input value={b.link_url ?? ""} onChange={(e) => updateField(b.id, { link_url: e.target.value })} placeholder="Click-through URL (optional)" />
                          <Input value={b.alt_text ?? ""} onChange={(e) => updateField(b.id, { alt_text: e.target.value })} placeholder="Alt text (optional)" />
                          <div className="flex items-center justify-between gap-2">
                            <a href={b.image_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ExternalLink className="size-3" /> Open image</a>
                            <div className="flex gap-1.5"><Button size="sm" variant="outline" onClick={() => void saveBanner(b)}><Save className="size-3.5 mr-1" />Save</Button><Button size="sm" variant="destructive" onClick={() => void deleteBanner(b)}><Trash2 className="size-3.5" /></Button></div>
                          </div>
                        </div>
                      </div>
                      {b.site === "bm_support" && (
                        <div className="border-t border-border bg-background/60 p-3">
                          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Show in zones</div>
                          <p className="text-[11px] text-muted-foreground mb-2">{b.zones.length === 0 ? "None ticked = shows in every zone." : `${b.zones.length} selected.`} Press Save to apply.</p>
                          <div className="grid grid-cols-2 gap-1.5">{BM_ZONES.map((z) => { const on = b.zones.includes(z.key); return <label key={z.key} className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded-md border ${on ? "border-primary/50 bg-primary/10" : "border-border bg-surface-2/60"}`}><input type="checkbox" checked={on} onChange={(e) => updateField(b.id, { zones: e.target.checked ? [...b.zones, z.key] : b.zones.filter((k) => k !== z.key) })} /><span className="truncate">{z.label}</span></label>; })}</div>
                        </div>
                      )}
                      <div className="border-t border-border bg-background/60 p-3">
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Assign to forum boards</div>
                        {boards.length === 0 ? <p className="text-xs text-muted-foreground">No forum boards.</p> : <div className="grid grid-cols-2 gap-1.5">{boards.map((br) => { const checked = assignments.some((a) => a.board_id === br.id && a.banner_id === b.id); return <label key={br.id} className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded-md border ${checked ? "border-primary/50 bg-primary/10" : "border-border bg-surface-2/60"}`}><input type="checkbox" checked={checked} onChange={(e) => void toggleBoard(b, br.id, e.target.checked)} /><span className="truncate">{br.name}</span></label>; })}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
          })}
        </section>
        ))}
        </>
      )}
    </div>
  );
}

function BannerStats({ stats }: { stats?: BannerStat }) {
  return (
    <div className="grid grid-cols-2 gap-1 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1"><Eye className="size-3" />{(stats?.impressions ?? 0).toLocaleString("en-GB")} views</span>
      <span className="inline-flex items-center gap-1"><MousePointerClick className="size-3" />{(stats?.clicks ?? 0).toLocaleString("en-GB")} clicks</span>
    </div>
  );
}