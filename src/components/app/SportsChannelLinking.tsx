import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listPlaylistCategories, listPlaylistCategoryChannels } from "@/lib/player.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { parseSportsListingBlock } from "@/lib/sports-listing-format";
import { readChannelLinks, readReplaceRows, resolveInCategory, testChannelLinks, type ChannelLinks } from "@/lib/sports-channel-links";

const field = "bg-purple-950/50 border-purple-500/30 text-purple-50 placeholder:text-purple-300/50";

/** Per-guide "Channel linking" rules for BM Player, with a Test against pasted Live TV names. */
export function SportsChannelLinking({ value, body, onChange }: { value: unknown; body: string | null; onChange: (v: ChannelLinks) => void }) {
  const links = readChannelLinks(value);
  const [paste, setPaste] = useState("");
  const [tested, setTested] = useState<ReturnType<typeof testChannelLinks> | null>(null);
  const guideChannels = useMemo(() => {
    const set = new Set<string>();
    for (const e of parseSportsListingBlock(body ?? "")) for (const c of e.channels) if (c.trim()) set.add(c.trim());
    return [...set].slice(0, 60);
  }, [body]);
  // Rows come from the raw value, not the sanitised links, so a half-typed swap
  // (empty "from", trailing spaces) isn't swallowed between keystrokes.
  const replace = readReplaceRows(value);
  const loadCats = useServerFn(listPlaylistCategories);
  const loadChans = useServerFn(listPlaylistCategoryChannels);
  const [cats, setCats] = useState<string[] | null>(null);
  const [catFilter, setCatFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fetchCats = async () => {
    setBusy(true); setErr("");
    try { setCats((await loadCats()).categories); } catch (e) { setErr(e instanceof Error ? e.message : "Could not read the playlist."); }
    setBusy(false);
  };
  const testCategory = async () => {
    if (!links.category) return;
    setBusy(true); setErr("");
    try {
      const { channels } = await loadChans({ data: { category: links.category } });
      if (!channels.length) setErr("That category has no channels in the playlist.");
      setTested(guideChannels.map((g) => { const f = resolveInCategory(g, channels, links); return { guide: g, rewritten: g, found: f ? [f] : [] }; }));
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not read the playlist."); }
    setBusy(false);
  };
  const set = (patch: Partial<ChannelLinks>) => { onChange({ ...links, replace, ...patch }); setTested(null); };
  const setRow = (i: number, k: "from" | "to", v: string) => set({ replace: replace.map((r, j) => (j === i ? { ...r, [k]: v } : r)) });

  const runTest = () => {
    // Pasted Live TV names, one per line; also accept "07 | ..." style lines as-is.
    const playlist = paste.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    setTested(testChannelLinks(guideChannels, playlist, { ...links, replace: replace.filter((r) => r.from.trim()) }));
  };

  return (
    <div className="rounded-lg border border-purple-500/30 p-3 space-y-3">
      <div>
        <Label className="text-purple-100">Channel linking (BM Player)</Label>
        <p className="text-[11px] text-purple-300/70">How the apps find this guide's channels. Changes reach BM Player about a minute after you publish.</p>
      </div>
      <div className="space-y-2">
        <Label className="text-purple-100 text-xs">Playlist category</Label>
        <p className="text-[11px] text-purple-300/70">Pick the Live TV category these games are in. Each game links to the channel in that category with the same number (e.g. CYMRU FOOTBALL 3 → that category's channel 3).</p>
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-sm text-purple-100">{links.category || "None chosen"}</span>
          <Button type="button" variant="outline" size="sm" onClick={fetchCats} disabled={busy}>{cats ? "Reload categories" : "Load playlist categories"}</Button>
          {links.category && <Button type="button" size="sm" onClick={testCategory} disabled={busy || !guideChannels.length}>Test with playlist</Button>}
          {links.category && <Button type="button" variant="ghost" size="sm" onClick={() => set({ category: undefined })}>Clear</Button>}
        </div>
        {cats && (
          <div className="space-y-1">
            <Input value={catFilter} onChange={(e) => setCatFilter(e.target.value)} placeholder="Search categories, e.g. Cymru" className={field} />
            <div className="max-h-48 overflow-y-auto rounded border border-purple-500/20">
              {cats.filter((c) => c.toLowerCase().includes(catFilter.toLowerCase())).slice(0, 200).map((c) => (
                <button key={c} type="button" onClick={() => { set({ category: c }); setCats(null); setCatFilter(""); }}
                  className={"block w-full text-left px-2 py-1 text-xs hover:bg-purple-500/20 " + (c === links.category ? "text-purple-50 font-semibold" : "text-purple-200")}>{c}</button>
              ))}
            </div>
          </div>
        )}
        {err && <p className="text-xs text-destructive">{err}</p>}
      </div>
      <label className="flex items-start gap-2 text-sm text-purple-100">
        <input type="checkbox" className="mt-1" checked={!!links.numbered} onChange={(e) => set({ numbered: e.target.checked })} />
        <span>Channels are numbers only<span className="block text-[11px] text-purple-300/70">"Channel 07" links to the channel whose name starts with "07 |" (Daily Sports).</span></span>
      </label>
      <div>
        <Label className="text-purple-100 text-xs">Only this country (optional)</Label>
        <Input value={links.country ?? ""} onChange={(e) => set({ country: e.target.value.toUpperCase() })} placeholder="e.g. US — skips AU, CA and other copies" className={field} maxLength={12} />
      </div>
      <div className="space-y-2">
        <Label className="text-purple-100 text-xs">Swap words in channel names</Label>
        {replace.map((r, i) => (
          <div key={i} className="flex gap-2 items-center">
            <Input value={r.from} onChange={(e) => setRow(i, "from", e.target.value)} placeholder="Guide says, e.g. CYMRU FOOTBALL" className={field} />
            <span className="text-purple-300">→</span>
            <Input value={r.to} onChange={(e) => setRow(i, "to", e.target.value)} placeholder="Channel says, e.g. Cymru Football event" className={field} />
            <Button type="button" variant="ghost" size="sm" onClick={() => set({ replace: replace.filter((_, j) => j !== i) })}>Remove</Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => set({ replace: [...replace, { from: "", to: "" }] })}>Add a swap</Button>
      </div>
      <div className="space-y-2 border-t border-purple-500/20 pt-3">
        <Label className="text-purple-100 text-xs">Test</Label>
        <Textarea rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"Paste channel names from BM Player Live TV, one per line\n07 | 12:00 Trackside Live!\nUS | Paramount+ Event 03"} className={field} />
        <Button type="button" size="sm" onClick={runTest} disabled={!guideChannels.length || !paste.trim()}>Test</Button>
        {!guideChannels.length && <p className="text-[11px] text-purple-300/70">Add events with channels to the body first.</p>}
        {tested && (
          <ul className="text-xs space-y-1">
            {tested.map((t) => (
              <li key={t.guide} className={t.found.length ? "text-purple-100" : "text-destructive"}>
                <b>{t.guide}</b>
                {t.rewritten !== t.guide && <span className="text-purple-300/70"> (looks for "{t.rewritten}")</span>}
                {" → "}
                {t.found.length ? t.found.slice(0, 4).join(", ") : "no channel found"}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
