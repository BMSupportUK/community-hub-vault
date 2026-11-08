import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw, Save, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { listPlaylistCategories, listPlaylistCategoryChannels } from "@/lib/player.functions";
import { readChannelLinks, resolveInCategory, type ChannelLinks } from "@/lib/sports-channel-links";
import { parseSportsListingBlock } from "@/lib/sports-listing-format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Json } from "@/integrations/supabase/types";

type Guide = { id: string; title: string; body: string | null; published: boolean; channel_links: Json };
type Match = { guide: string; channel: string | null };

export function PlayerSportsCategoryMatching() {
  const loadCategories = useServerFn(listPlaylistCategories);
  const loadChannels = useServerFn(listPlaylistCategoryChannels);
  const [guides, setGuides] = useState<Guide[]>([]);
  const { data: playlist, isFetching: playlistBusy, error: playlistError, refetch: reloadPlaylist } = useQuery({
    queryKey: ["player-sports-playlist-categories"],
    queryFn: () => loadCategories(),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const categories = playlist?.categories ?? [];
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ id: string; category: string; channels: string[]; matches: Match[] } | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.from("sports_blogs").select("id, title, body, published, channel_links").order("title").then(({ data, error }) => {
      if (!active) return;
      if (error) setError(error.message);
      else setGuides(data ?? []);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  async function fetchPlaylist() {
    setError("");
    await reloadPlaylist();
  }

  const categoryFor = (g: Guide) => drafts[g.id] ?? readChannelLinks(g.channel_links).category ?? "";
  async function save(g: Guide) {
    setBusy(g.id);
    const links: ChannelLinks = { ...readChannelLinks(g.channel_links), category: categoryFor(g) || undefined };
    try {
      const { data, error } = await supabase.from("sports_blogs").update({ channel_links: readChannelLinks(links) as Json }).eq("id", g.id).select("id, title, body, published, channel_links").single();
      if (error) throw error;
      setGuides((rows) => rows.map((r) => r.id === g.id ? data : r));
      setDrafts((old) => { const next = { ...old }; delete next[g.id]; return next; });
      toast.success("Sports category assignment saved");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save the assignment."); }
    finally { setBusy(null); }
  }

  async function test(g: Guide) {
    const category = categoryFor(g);
    if (!category) return;
    setBusy(g.id); setError("");
    try {
      const { channels } = await loadChannels({ data: { category } });
      const names = [...new Set(parseSportsListingBlock(g.body ?? "").flatMap((e) => e.channels))];
      setPreview({ id: g.id, category, channels, matches: names.map((name) => ({ guide: name, channel: resolveInCategory(name, channels, readChannelLinks(g.channel_links)) })) });
    } catch (e) { setError(e instanceof Error ? e.message : "Could not read the category."); }
    finally { setBusy(null); }
  }

  const visibleCategories = categories.filter((c) => c.toLowerCase().includes(categorySearch.toLowerCase()));
  return <section className="space-y-4" aria-label="Website guide category assignments">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-display text-lg font-semibold">Website guides → playlist sports categories</h2>
      <Button variant="outline" disabled={playlistBusy} onClick={() => void fetchPlaylist()}>
        {playlistBusy ? <Loader2 className="animate-spin" /> : <RefreshCw />}{playlistBusy ? "Loading playlist…" : categories.length ? "Reload playlist" : "Retry playlist"}
      </Button>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="relative"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" aria-label="Search website guides" placeholder="Search website guides" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      <Input aria-label="Filter playlist categories" placeholder="Search playlist categories" disabled={!categories.length} value={categorySearch} onChange={(e) => setCategorySearch(e.target.value)} />
    </div>
    {categories.length > 0 && <p className="text-xs text-muted-foreground">{categories.length} playlist categories loaded</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {playlistError && <p role="alert" className="text-sm text-destructive">Could not load playlist categories. Please retry.</p>}
    {loading ? <Loader2 className="animate-spin" aria-label="Loading website guides" /> : <div className="divide-y divide-border">
      {guides.filter((g) => g.title.toLowerCase().includes(search.toLowerCase())).map((g) => {
        const category = categoryFor(g);
        const dirty = category !== (readChannelLinks(g.channel_links).category ?? "");
        const options = [...new Set([...visibleCategories, ...(category ? [category] : [])])];
        return <div key={g.id} className="py-4 space-y-3">
          <div className="grid items-center gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto]">
            <div className="min-w-0"><h3 className="break-words font-medium">{g.title}</h3><span className="text-xs text-muted-foreground">{g.published ? "Published" : "Draft"}{dirty ? " · Unsaved" : ""}</span></div>
            <Select value={category || "__none__"} disabled={!categories.length || busy !== null} onValueChange={(v) => { setDrafts((old) => ({ ...old, [g.id]: v === "__none__" ? "" : v })); setPreview(null); }}>
              <SelectTrigger aria-label={`Playlist category for ${g.title}`} className="min-w-0"><SelectValue placeholder="Choose sports category" /></SelectTrigger>
              <SelectContent><SelectItem value="__none__">No category assigned</SelectItem>{options.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={!category || busy !== null} onClick={() => void test(g)} aria-label={`Test ${g.title}`}>Test</Button>
              <Button size="sm" disabled={!dirty || busy !== null} onClick={() => void save(g)} aria-label={`Save ${g.title}`}>{busy === g.id ? <Loader2 className="animate-spin" /> : <Save />}Save</Button>
            </div>
          </div>
          {preview?.id === g.id && <div className="space-y-2 border-l-2 border-primary pl-3 text-sm">
            <div className="flex justify-between gap-3"><span className="font-medium">{preview.category} · {preview.channels.length} channels</span><Button size="sm" variant="ghost" onClick={() => setPreview(null)}>Close</Button></div>
            {preview.matches.length ? <ul className="max-h-64 space-y-1 overflow-y-auto">{preview.matches.map((m) => <li key={m.guide} className={m.channel ? "text-foreground" : "text-destructive"}>{m.guide} → {m.channel ?? "No channel found"}</li>)}</ul> : <p className="text-muted-foreground">No fixtures listed in this guide.</p>}
            <details><summary className="cursor-pointer text-muted-foreground">Playlist channels</summary><ul className="mt-2 max-h-48 overflow-y-auto">{preview.channels.map((c, i) => <li key={`${c}-${i}`}>{c}</li>)}</ul></details>
          </div>}
        </div>;
      })}
      {!guides.filter((g) => g.title.toLowerCase().includes(search.toLowerCase())).length && <p className="py-4 text-muted-foreground">No website guides found.</p>}
    </div>}
  </section>;
}