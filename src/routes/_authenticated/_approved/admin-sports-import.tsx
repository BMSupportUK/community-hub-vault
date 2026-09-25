import { createFileRoute, Navigate, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Sparkles, Send, Trash2, Inbox, Clock, Check, Scissors, Settings2, X } from "lucide-react";
import { firstClockIn, firstDateIn, parseClockTime, toSingleZoneTime, type TimeZoneChoice } from "@/lib/import-time";
import { formatSportsListingBlock, formatSportsListingEvents, parseSportsListingBlock, splitListingSections } from "@/lib/sports-listing-format";
import { suggestListingFixes, saveQueueListing, type ListingFixSuggestion } from "@/lib/listing-web-fix.functions";
import { checkSportsImport, type ImportCheckResult } from "@/lib/sports-import-check";
import {
  queuePastedPost,
  setupDiscordBot,
  getDiscordStatus,
  listImportQueue,
  resolveQueueItem,
  deleteQueueItems,
  splitQueueItem,
  splitQueueItemAtLine,
  splitQueueItemByProvider,
  combineQueueItems,
  getMergeChannels,
  saveMergeChannels,
  approveAllSuggested,
  listCategoriesWithSubs,
  listGuidesInCategory,
} from "@/lib/discord-import.functions";

export const Route = createFileRoute("/_authenticated/_approved/admin-sports-import")({
  component: AdminSportsImportPage,
});

type Cat = { id: string; name: string; parent_id: string | null; sort_order: number };
type Sub = { category_id: string; name: string; sort_order: number; is_default: boolean };
type QueueDraft = {
  category: string;
  group?: string;
  destinationCategory: string;
  subcategories: string[];
  title: string;
  time: string | null;
  sourceZone: TimeZoneChoice | null;
  guideId: string | null;
};
type QueueItem = {
  id: string;
  raw_text: string;
  parsed_event: any;
  suggested_category_id: string | null;
  suggested_subcategory: string | null;
  status: string;
  created_at: string;
  source?: string;
  forwarded_from?: string | null;
};

function AdminSportsImportPage() {
  const { hasAny } = useAuth();
  const isStaff = hasAny(["admin", "management", "moderator"]);
  const queuePasteFn = useServerFn(queuePastedPost);
  const setupDiscordFn = useServerFn(setupDiscordBot);
  const discordStatusFn = useServerFn(getDiscordStatus);
  const [discord, setDiscord] = useState<{ connected: boolean; application: string | null } | null>(null);
  const refreshDiscord = () => { discordStatusFn().then(setDiscord).catch(() => setDiscord({ connected: false, application: null })); };
  useEffect(() => { refreshDiscord(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const listFn = useServerFn(listImportQueue);
  const resolveFn = useServerFn(resolveQueueItem);
  const splitFn = useServerFn(splitQueueItem);
  const splitProviderFn = useServerFn(splitQueueItemByProvider);
  const catsFn = useServerFn(listCategoriesWithSubs);

  const [text, setText] = useState("");
  const [queueing, setQueueing] = useState(false);
  const [settingUpDiscord, setSettingUpDiscord] = useState(false);
  const [cats, setCats] = useState<Cat[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [queueFilter, setQueueFilter] = useState<"all" | "paste">("all");
  const [approvingAll, setApprovingAll] = useState(false);
  const approveAllFn = useServerFn(approveAllSuggested);
  const deleteFn = useServerFn(deleteQueueItems);
  // The three setup boxes live in the sidebar: tap a post, then work the sidebar.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [splittingId, setSplittingId] = useState<string | null>(null);
  const [splittingProviderId, setSplittingProviderId] = useState<string | null>(null);
  const splitAtLineFn = useServerFn(splitQueueItemAtLine);
  const [draft, setDraft] = useState<QueueDraft>({ category: "", destinationCategory: "", subcategories: [], title: "", time: null, sourceZone: null, guideId: null });
  const timeStore = useRef<Map<string, string | null>>(new Map());
  const sourceZoneStore = useRef<Map<string, TimeZoneChoice | null>>(new Map());

  const selectItem = (q: QueueItem) => {
    if (selectedId === q.id) return;
    const ev = q.parsed_event ?? {};
    const stored = timeStore.current.get(q.id);
    const storedZone = sourceZoneStore.current.get(q.id);
    setSelectedId(q.id);
    setDraft({
      category: String(ev.suggested_category ?? ""),
      destinationCategory: String(ev.suggested_category ?? ""),
      subcategories: ev.suggested_subcategory ? [String(ev.suggested_subcategory)] : [],
      // Leave the guide name empty so nothing looks pre-selected — the admin
      // types a name or explicitly picks a guide from the list.
      title: "",
      time: stored ?? (ev.time ? String(ev.time) : null),
      sourceZone: storedZone ?? null,
      guideId: null,
    });
  };

  const clearSelection = () => {
    setSelectedId(null);
    setDraft({ category: "", destinationCategory: "", subcategories: [], title: "", time: null, sourceZone: null, guideId: null });
  };

  const applyZoneToItem = (itemId: string, shown: string, zone: "gmt" | "et") => {
    timeStore.current.set(itemId, shown);
    sourceZoneStore.current.set(itemId, zone);
    if (itemId === selectedId) setDraft((d) => ({ ...d, time: shown, sourceZone: zone }));
    toast.success(`Times shown in ${zone === "gmt" ? "UK" : "ET"} time — ${shown}`);
  };

  useEffect(() => {
    if (!isStaff) return;
    catsFn().then((d) => {
      setCats(d.categories as Cat[]);
      setSubs(d.subcategories as Sub[]);
    }).catch((e) => toast.error(e.message));
    refreshQueue();
  }, [isStaff]);

  const refreshQueue = (silent = false) => {
    if (!silent) setLoadingQueue(true);
    listFn().then((d) => setQueue(d.items as QueueItem[]))
      .catch((e) => { if (!silent) toast.error(e.message); })
      .finally(() => { if (!silent) setLoadingQueue(false); });
  };

  const splitItem = (itemId: string) => {
    setSplittingId(itemId);
    splitFn({ data: { id: itemId } })
      .then((r: any) => {
        toast.success(`Split into ${r.created} single events`);
        if (itemId === selectedId) clearSelection();
        refreshQueue(true);
      })
      .catch((e: any) => toast.error(e.message))
      .finally(() => setSplittingId(null));
  };

  // A post naming two providers ("MONOMAX" and "STAN Sport") becomes one
  // queued post per provider, each filed against its own guide.
  const splitItemByProvider = (itemId: string) => {
    setSplittingProviderId(itemId);
    splitProviderFn({ data: { id: itemId } })
      .then((r: any) => {
        toast.success(`Split into ${r.created} separate listings`);
        if (itemId === selectedId) clearSelection();
        refreshQueue(true);
      })
      .catch((e: any) => toast.error(e.message))
      .finally(() => setSplittingProviderId(null));
  };

  // Manual split: the admin picks the exact line the second half starts on.
  const splitItemAtLine = (itemId: string, line: number) => {
    setSplittingId(itemId);
    splitAtLineFn({ data: { id: itemId, line } })
      .then(() => {
        toast.success("Split into two posts");
        if (itemId === selectedId) clearSelection();
        refreshQueue(true);
      })
      .catch((e: any) => toast.error(e.message))
      .finally(() => setSplittingId(null));
  };

  // Forwarded posts arrive in the background, so the queue keeps itself
  // up to date — quietly every 10s and whenever the tab regains focus.
  useEffect(() => {
    if (!isStaff) return;
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      refreshQueue(true);
    };
    const id = window.setInterval(tick, 10_000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [isStaff]);

  const visibleQueue = queue.filter((q) => queueFilter === "all" || (q.source ?? "paste") === queueFilter);
  const suggestedCount = queue.filter((q) => q.parsed_event?.suggested_category).length;

  const NEEDS_CATEGORY = "Needs a category";
  // Every post sits under its suggested category heading, so staff can see at a
  // glance what landed where; anything unmatched comes first.
  const groupedQueue = useMemo(() => {
    const map = new Map<string, QueueItem[]>();
    for (const q of visibleQueue) {
      const cat = q.parsed_event?.suggested_category as string | undefined;
      const sub = q.parsed_event?.suggested_subcategory as string | undefined;
      const key = cat ? (sub ? `${cat} › ${sub}` : cat) : NEEDS_CATEGORY;
      const arr = map.get(key) ?? [];
      arr.push(q);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === NEEDS_CATEGORY) return -1;
      if (b === NEEDS_CATEGORY) return 1;
      return a.localeCompare(b);
    });
  }, [visibleQueue]);

  const [deletingAll, setDeletingAll] = useState(false);
  const onDeleteAll = async () => {
    const ids = visibleQueue.map((q) => q.id);
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} import(s)? This can't be undone.`)) return;
    setDeletingAll(true);
    try {
      const r = await deleteFn({ data: { ids } });
      toast.success(`Deleted ${r.deleted} import(s)`);
      refreshQueue();
    } catch (e: any) {
      toast.error(e.message ?? "Delete failed");
    } finally {
      setDeletingAll(false);
    }
  };

  const combineFn = useServerFn(combineQueueItems);
  const getMergeChannelsFn = useServerFn(getMergeChannels);
  const saveMergeChannelsFn = useServerFn(saveMergeChannels);
  const [combiningEspn, setCombiningEspn] = useState(false);
  const [mergeChannels, setMergeChannels] = useState<string[]>([]);
  const [newChannel, setNewChannel] = useState("");
  const [showChannels, setShowChannels] = useState(false);
  const [savingChannels, setSavingChannels] = useState(false);
  useEffect(() => {
    getMergeChannelsFn()
      .then((r) => setMergeChannels(r.channels))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const channelMatchers = useMemo(
    () =>
      mergeChannels
        .map((c) => c.trim())
        .filter(Boolean)
        .map((c) => ({
          name: c,
          // Only treat the name as this post's channel when it appears as a
          // channel label: at the start of a line, after a channel separator,
          // or followed by a number (e.g. "DAZN1" / "ESPN+ 01").
          re: new RegExp(
            `(?:^[\\s*_>#-]*|(?:\\||·|•)\\s*)${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|\\d|[*_#]*$)|\\b${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\d{1,3}\\b`,
            "im",
          ),
        })),
    [mergeChannels],
  );
  const matchChannel = (q: QueueItem) => {
    const text = String(q.parsed_event?.raw ?? q.raw_text ?? "");
    return channelMatchers.find((c) => c.re.test(text))?.name ?? null;
  };
  // Group pending posts by the channel they belong to, so posts from two
  // different providers are never welded into one import.
  const mergeGroups = useMemo(() => {
    const groups = new Map<string, QueueItem[]>();
    for (const q of queue) {
      if (q.status !== "pending") continue;
      const name = matchChannel(q);
      if (!name) continue;
      const list = groups.get(name) ?? [];
      list.push(q);
      groups.set(name, list);
    }
    return [...groups.entries()]
      .map(([name, items]) => ({
        name,
        items: items.slice().sort((a, b) => a.created_at.localeCompare(b.created_at)),
      }))
      .filter((g) => g.items.length >= 2)
      .sort((a, b) => a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, channelMatchers]);
  const onCombineChannel = async (name: string, items: QueueItem[]) => {
    if (items.length < 2) return;
    const list = items
      .map((q, i) => `${i + 1}. ${String(q.parsed_event?.raw ?? q.raw_text ?? "").trim().split("\n").filter((l) => l.trim()).slice(0, 2).join(" / ").slice(0, 90)}`)
      .join("\n");
    if (!window.confirm(`Are all the ${name} listings in the queue?\n\n${list}\n\nThese ${items.length} ${name} posts will be joined (oldest first) into 1 import.`)) return;
    setCombiningEspn(true);
    try {
      const r = await combineFn({ data: { ids: items.map((q) => q.id), title: name } });
      toast.success(`Merged ${r.combined} ${name} listings into 1 import`);
      clearSelection();
      refreshQueue(true);
    } catch (e: any) {
      toast.error(e.message ?? "Merge failed");
    } finally {
      setCombiningEspn(false);
    }
  };
  const [pickMode, setPickMode] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const togglePick = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const onMergePicked = async () => {
    const items = queue
      .filter((q) => picked.includes(q.id))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    if (items.length < 2) return;
    if (!window.confirm(`Join these ${items.length} posts (oldest first) into 1 import?`)) return;
    setCombiningEspn(true);
    try {
      const r = await combineFn({ data: { ids: items.map((q) => q.id) } });
      toast.success(`Merged ${r.combined} posts into 1 import`);
      setPicked([]);
      setPickMode(false);
      clearSelection();
      refreshQueue(true);
    } catch (e: any) {
      toast.error(e.message ?? "Merge failed");
    } finally {
      setCombiningEspn(false);
    }
  };
  const onAddChannel = async () => {
    const name = newChannel.trim();
    if (!name) return;
    if (mergeChannels.some((c) => c.toLowerCase() === name.toLowerCase())) {
      toast.error("That channel is already listed");
      return;
    }
    setSavingChannels(true);
    try {
      const r = await saveMergeChannelsFn({ data: { channels: [...mergeChannels, name] } });
      setMergeChannels(r.channels);
      setNewChannel("");
      toast.success(`Added "${name}" to merge channels`);
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    } finally {
      setSavingChannels(false);
    }
  };
  const onRemoveChannel = async (name: string) => {
    setSavingChannels(true);
    try {
      const r = await saveMergeChannelsFn({ data: { channels: mergeChannels.filter((c) => c !== name) } });
      setMergeChannels(r.channels);
      toast.success(`Removed "${name}"`);
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    } finally {
      setSavingChannels(false);
    }
  };

  const onApproveAll = async () => {
    setApprovingAll(true);
    try {
      const r = await approveAllFn();
      toast.success(`Imported ${r.imported} suggested event(s) — saved as drafts with their dates filled in, ready to publish${r.skipped ? ` · ${r.skipped} still need a category` : ""}`);
      refreshQueue();
    } catch (e: any) {
      toast.error(e.message ?? "Approve-all failed");
    } finally {
      setApprovingAll(false);
    }
  };

  const subsByCatName = useMemo(() => {
    const catById = new Map(cats.map((c) => [c.id, c.name]));
    const map = new Map<string, Sub[]>();
    for (const s of subs) {
      const cn = catById.get(s.category_id);
      if (!cn) continue;
      const arr = map.get(cn) ?? [];
      arr.push(s);
      map.set(cn, arr);
    }
    return map;
  }, [cats, subs]);

  if (!isStaff) return <Navigate to="/home" />;

  const onQueuePaste = async () => {
    const t = text.trim();
    if (!t) return toast.error("Paste a listings post first");
    setQueueing(true);
    try {
      await queuePasteFn({ data: { text: t } });
      toast.success("Added to the review queue — pick a category and guide there");
      setText("");
      refreshQueue();
    } catch (e: any) {
      toast.error(e.message ?? "Couldn't queue the post");
    } finally {
      setQueueing(false);
    }
  };

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="w-full px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <Link to="/admin" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to owner panel
        </Link>

        <header className="relative rounded-3xl overflow-hidden border border-primary/30 shadow-glow bg-gradient-primary p-6">
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-2xl bg-white/15 backdrop-blur grid place-items-center ring-1 ring-white/20">
              <Sparkles className="size-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">Sports Guide Importer</h1>
              <p className="text-sm text-white/85">Paste a listings post — it lands in the review queue as one block, ready to file into a guide.</p>
            </div>
            {isStaff && discord && (
              <span className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${discord.connected ? "bg-success/20 text-white ring-success/60" : "bg-white/10 text-white/80 ring-white/30"}`}>
                <span className={`size-2 rounded-full ${discord.connected ? "bg-success" : "bg-muted-foreground"}`} />
                {discord.connected ? `Discord connected${discord.application ? ` · ${discord.application}` : ""}` : "Discord not connected"}
              </span>
            )}
            {isStaff && (
              <Button
                variant="secondary"
                size="sm"
                className="shrink-0"
                disabled={settingUpDiscord}
                onClick={async () => {
                  setSettingUpDiscord(true);
                  try {
                    const r = await setupDiscordFn({});
                    refreshDiscord();
                    toast.success(`Discord connected — right-click any post in your server → Apps → Send to Sports Guide. (${r.application})`);
                  } catch (e: any) {
                    toast.error(e.message ?? "Discord setup failed");
                  } finally {
                    setSettingUpDiscord(false);
                  }
                }}
              >
                {settingUpDiscord ? <Loader2 className="size-4 animate-spin" /> : <Inbox className="size-4" />}
                {settingUpDiscord ? "Connecting…" : discord?.connected ? "Reconnect" : "Connect Discord bot"}
              </Button>
            )}
          </div>
        </header>

        <Tabs defaultValue="queue">
          <TabsList>
            <TabsTrigger value="paste">Paste &amp; Import</TabsTrigger>
            <TabsTrigger value="queue">
              Review Queue {queue.length > 0 && <span className="ml-2 px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-xs">{queue.length}</span>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="paste" className="space-y-4">
            <Card className="p-4 space-y-3">
              <label className="text-sm font-medium">Paste a listings post</label>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={10}
                placeholder={"Copy a listings post from your sports channel and paste it here.\n\nIt goes into the review queue as one block — nothing is split — then you pick the category, sub categories and guide there."}
                className="font-mono text-sm"
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={onQueuePaste} disabled={queueing || !text.trim()}>
                  {queueing ? <Loader2 className="size-4 animate-spin" /> : <Inbox className="size-4" />}
                  {queueing ? "Adding…" : "Add to review queue"}
                </Button>
                <Button variant="outline" onClick={() => setText("")}>
                  Clear
                </Button>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="queue" className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {(["all", "paste"] as const).map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant={queueFilter === f ? "default" : "outline"}
                  onClick={() => setQueueFilter(f)}
                >
                  {f === "all" ? "All" : "Pasted"}
                  <span className="ml-1.5 text-xs opacity-80">
                    {f === "all" ? queue.length : queue.filter((q) => (q.source ?? "paste") === f).length}
                  </span>
                </Button>
              ))}
              <div className="flex-1" />
              {mergeGroups.length === 0 ? (
                <Button size="sm" variant="outline" disabled>
                  <Sparkles className="size-4" />
                  Merge Listings (0)
                </Button>
              ) : (
                mergeGroups.map((g) => (
                  <Button
                    key={g.name}
                    size="sm"
                    variant="outline"
                    onClick={() => onCombineChannel(g.name, g.items)}
                    disabled={combiningEspn}
                  >
                    {combiningEspn ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                    Merge {g.name} ({g.items.length})
                  </Button>
                ))
              )}
              {!pickMode ? (
                <Button size="sm" variant="outline" onClick={() => { setPickMode(true); setPicked([]); }}>
                  Pick posts to merge
                </Button>
              ) : (
                <>
                  <Button size="sm" onClick={onMergePicked} disabled={combiningEspn || picked.length < 2}>
                    {combiningEspn ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                    Merge selected ({picked.length})
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setPickMode(false); setPicked([]); }}>
                    Cancel
                  </Button>
                </>
              )}
              <Button size="sm" variant="ghost" onClick={() => setShowChannels((v) => !v)} title="Manage merge channels">
                <Settings2 className="size-4" />
              </Button>
              <Button size="sm" variant="destructive" onClick={onDeleteAll} disabled={deletingAll || visibleQueue.length === 0}>
                {deletingAll ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                Delete all shown ({visibleQueue.length})
              </Button>
              <Button size="sm" variant="secondary" onClick={onApproveAll} disabled={approvingAll || suggestedCount === 0}>
                {approvingAll ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Approve all suggested ({suggestedCount})
              </Button>
            </div>

            {showChannels && (
              <Card className="p-3 space-y-2">
                <p className="text-sm font-medium">Merge channels</p>
                <p className="text-xs text-muted-foreground">
                  Pending posts mentioning any of these names are picked up by the Merge Listings button and joined into one import.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {mergeChannels.length === 0 && <span className="text-xs text-muted-foreground">No channels yet.</span>}
                  {mergeChannels.map((c) => (
                    <span key={c} className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs">
                      {c}
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => onRemoveChannel(c)}
                        disabled={savingChannels}
                        aria-label={`Remove ${c}`}
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newChannel}
                    onChange={(e) => setNewChannel(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && onAddChannel()}
                    placeholder="Channel name, e.g. ESPN+"
                    className="h-8 max-w-xs text-sm"
                  />
                  <Button size="sm" variant="secondary" onClick={onAddChannel} disabled={savingChannels || !newChannel.trim()}>
                    {savingChannels ? <Loader2 className="size-4 animate-spin" /> : "Add"}
                  </Button>
                </div>
              </Card>
            )}

            <div className="flex flex-col-reverse gap-4 lg:flex-row lg:items-start">
              <div className="min-w-0 flex-1 space-y-3">
                {loadingQueue ? (
                  <div className="grid place-items-center py-10 text-muted-foreground">
                    <Loader2 className="size-5 animate-spin" />
                  </div>
                ) : visibleQueue.length === 0 ? (
                  <Card className="p-10 grid place-items-center text-center text-muted-foreground gap-2">
                    <Inbox className="size-8" />
                    <p>{queue.length === 0 ? "Review queue is empty." : "Nothing from this source."}</p>
                    <p className="text-xs">Copy a listings post and paste it into the Paste &amp; Import tab — it will appear here.</p>
                  </Card>
                ) : (
                  groupedQueue.map(([groupName, items]) => (
                    <section key={groupName} className="space-y-2">
                      <div className="flex items-center gap-2 pt-1">
                        <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
                          {groupName}
                        </h2>
                        <span className="px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground text-xs">
                          {items.length}
                        </span>
                        <div className="h-px flex-1 bg-border" />
                      </div>
                      {items.map((q) => {
                        const stored = timeStore.current.get(q.id);
                        const t =
                          q.id === selectedId
                            ? draft.time
                            : stored ?? (q.parsed_event?.time ? String(q.parsed_event.time) : null);
                        const zone =
                          q.id === selectedId
                            ? draft.sourceZone
                            : sourceZoneStore.current.get(q.id) ?? null;
                        return (
                          <div key={q.id} className="flex items-start gap-2">
                            {pickMode && q.status === "pending" && (
                              <input
                                type="checkbox"
                                aria-label="Pick post to merge"
                                className="mt-4 size-5 shrink-0 accent-primary"
                                checked={picked.includes(q.id)}
                                onChange={() => togglePick(q.id)}
                              />
                            )}
                            <div className="min-w-0 flex-1">
                          <QueueRow
                            item={q}
                            time={t}
                            zone={zone}
                            selected={selectedId === q.id}
                            splitting={splittingId === q.id}
                            splittingProvider={splittingProviderId === q.id}
                            onSplit={() => splitItem(q.id)}
                            onSplitAtLine={(line) => splitItemAtLine(q.id, line)}
                            onSplitProvider={() => splitItemByProvider(q.id)}
                            onSelect={() => selectItem(q)}
                            onZoneApply={(shown, z) => applyZoneToItem(q.id, shown, z)}
                          />
                            </div>
                          </div>
                        );
                      })}
                    </section>
                  ))
                )}
              </div>

              <aside className="w-full shrink-0 lg:sticky lg:top-6 lg:w-[340px]">
                <QueueSetup
                  item={visibleQueue.find((q) => q.id === selectedId) ?? null}
                  cats={cats}
                  subsByCatName={subsByCatName}
                  draft={draft}
                  setDraft={setDraft}
                  onDone={clearSelection}
                  onResolved={refreshQueue}
                  resolveFn={resolveFn}
                />
              </aside>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}


function QueueRow({
  item,
  time,
  zone,
  selected,
  splitting,
  splittingProvider,
  onSplit,
  onSplitProvider,
  onSelect,
  onZoneApply,
}: {
  item: QueueItem;
  time: string | null;
  zone: TimeZoneChoice | null;
  selected: boolean;
  splitting: boolean;
  splittingProvider: boolean;
  onSplit: () => void;
  onSplitProvider: () => void;
  onSelect: () => void;
  onZoneApply: (shown: string, zone: "gmt" | "et") => void;
}) {
  const ev = item.parsed_event ?? {};

  // Queued posts arrive whole with no time pulled out — fall back to the
  // first clock time written inside the post itself.
  const zoneSource = firstClockIn(String(ev.raw ?? item.raw_text ?? "")) ?? time;
  const zoneDate = ev.date ?? firstDateIn(String(ev.raw ?? item.raw_text ?? ""));
  // Always offer the choice so a wrong pick can be changed before importing.
  const needsZone = parseClockTime(zoneSource) !== null;
  const splitCount = useMemo(
    () => parseSportsListingBlock(String(ev.raw ?? item.raw_text ?? "")).length,
    [ev.raw, item.raw_text],
  );
  // Names listed inside the post that each have their own guide.
  const providerSections = useMemo(
    () => splitListingSections(String(ev.raw ?? item.raw_text ?? "")),
    [ev.raw, item.raw_text],
  );

  return (
    <Card
      onClick={onSelect}
      className={`cursor-pointer space-y-2 p-3 transition ${
        selected ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-primary/40"
      }`}
    >
      {ev.raw && <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/50 p-2 text-xs">{ev.raw}</pre>}
      <div className="text-xs text-muted-foreground">
        {[ev.date, time].filter(Boolean).join(" · ")}
        {Array.isArray(ev.channels) && ev.channels.length > 0 && <> · {ev.channels.join(" • ")}</>}
        {item.source === "telegram" && (
          <>{ev.date || time || (Array.isArray(ev.channels) && ev.channels.length > 0) ? " · " : ""}via Telegram{item.forwarded_from ? ` · forwarded from ${item.forwarded_from}` : ""}</>
        )}
      </div>
      {needsZone && (
        <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <span className="text-[11px] text-muted-foreground">Start times in this post are:</span>
          {(["gmt", "et"] as const).map((z) => (
            <Button
              key={z}
              size="sm"
              variant={zone === z ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              onClick={() => {
                const shown = toSingleZoneTime(zoneSource, zoneDate, z);
                if (!shown) return toast.error("Couldn't read the time on this post");
                onZoneApply(shown, z);
              }}
            >
              <Clock className="size-3" /> {z === "gmt" ? "UK" : "ET"}
            </Button>
          ))}
          {zone && <span className="text-[11px] text-muted-foreground">Tap the other button to change it</span>}
        </div>
      )}
      {/* Splitting is offered on every queued post, whatever the sport, so any
          listing can be filed one event at a time. */}
      <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          disabled={splitting || splitCount < 1}
          onClick={onSplit}
        >
          {splitting ? <Loader2 className="size-3 animate-spin" /> : <Scissors className="size-3" />}
          {splitCount > 1 ? `Split into ${splitCount} single events` : "Split into single events"}
        </Button>
        <span className="text-[11px] text-muted-foreground">
          {splitCount < 1
            ? "No events read from this post yet"
            : "Pick a guide for each event separately"}
        </span>
      </div>
      {providerSections.length > 1 && (
        <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            disabled={splittingProvider}
            onClick={onSplitProvider}
          >
            {splittingProvider ? <Loader2 className="size-3 animate-spin" /> : <Scissors className="size-3" />}
            Split into {providerSections.length} separate listings
          </Button>
          <span className="text-[11px] text-muted-foreground">
            {providerSections.map((s) => s.name).join(" · ")} — each gets its own guide
          </span>
        </div>
      )}
      {!selected && (
        <p className="text-[11px] text-primary/80">Tap to set it up in the sidebar →</p>
      )}
    </Card>
  );
}

// The sidebar: 1 · categories we have, 2 · subcategories we have,
// 3 · the name of the guide — then the import buttons underneath.
function QueueSetup({
  item,
  cats,
  subsByCatName,
  draft,
  setDraft,
  onDone,
  onResolved,
  resolveFn,
}: {
  item: QueueItem | null;
  cats: Cat[];
  subsByCatName: Map<string, Sub[]>;
  draft: QueueDraft;
  setDraft: (d: QueueDraft) => void;
  onDone: () => void;
  onResolved: () => void;
  resolveFn: (args: any) => Promise<any>;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<"import" | "discard" | null>(null);
  // Wizard flow: the boxes follow each other — pick in one, tap OK, the next
  // box opens. Back reopens the previous box.
  const [step, setStep] = useState(1);
  const itemKey = item?.id ?? null;
  useEffect(() => { setStep(1); }, [itemKey]);
  const selectedCategory = cats.find((category) => category.name === draft.category);
  const childCategories = selectedCategory
    ? cats.filter((category) => category.parent_id === selectedCategory.id)
    : [];
  const directSubs = draft.category ? subsByCatName.get(draft.category) ?? [] : [];
  // Box 2: the groups inside the chosen category (e.g. Rugby → Rugby League / Rugby Union,
  // Football → Mens / Women). When a category has no groups of its own, its own
  // sub categories act as the choices.
  const subChoices = childCategories.length > 0
    ? childCategories.map((category) => ({ name: category.name, destinationCategory: category.name, isGroup: true }))
    : directSubs.map((subcategory) => ({
        name: subcategory.name,
        destinationCategory: draft.category,
        isGroup: false,
      }));
  const chosenChoice = subChoices.find((choice) => choice.name === (draft.group || draft.subcategories[0]));
  // Box 3: when the chosen group has its own sub categories, list them too.
  const groupSubs = chosenChoice?.isGroup ? subsByCatName.get(chosenChoice.name) ?? [] : [];
  const selectedSubcategory = draft.subcategories[0] ?? "";
  const readyForGuides = Boolean(
    draft.destinationCategory && (groupSubs.length === 0 || selectedSubcategory),
  );
  // Guide names already used inside the chosen category.
  const guidesFn = useServerFn(listGuidesInCategory);
  const [guides, setGuides] = useState<{ id: string; title: string; subcategory: string | null }[]>([]);
  const [loadingGuides, setLoadingGuides] = useState(false);
  useEffect(() => {
    if (!readyForGuides) { setGuides([]); return; }
    let alive = true;
    setLoadingGuides(true);
    guidesFn({
      data: {
        category: draft.destinationCategory,
        subcategory: selectedSubcategory || null,
      },
    })
      .then((d: any) => { if (alive) setGuides(d.guides ?? []); })
      .catch(() => { if (alive) setGuides([]); })
      .finally(() => { if (alive) setLoadingGuides(false); });
    return () => { alive = false; };
  }, [draft.destinationCategory, selectedSubcategory, readyForGuides]);

  // Inline card edits replace the post text (saved to the queue item), so the
  // double-check and the final import both use the corrected version.
  const [editedRaw, setEditedRaw] = useState<string | null>(null);
  useEffect(() => setEditedRaw(null), [item?.id]);
  const itemRaw = editedRaw ?? String(item?.parsed_event?.raw ?? item?.raw_text ?? "");
  const check = useMemo(() => checkSportsImport(itemRaw, draft.sourceZone), [itemRaw, draft.sourceZone]);
  const [override, setOverride] = useState(false);
  useEffect(() => setOverride(false), [item?.id, draft.sourceZone]);

  const saveListingFn = useServerFn(saveQueueListing);
  const applyCardEdit = async (index: number, updated: { time: string; title: string; channels: string[] }) => {
    if (!item) return;
    const events = check.events.map((event, i) =>
      i === index ? { ...event, time: updated.time, title: updated.title, channels: updated.channels } : event,
    );
    const raw = formatSportsListingEvents(events, { raw: itemRaw, sourceZone: draft.sourceZone ?? "gmt" });
    try {
      await saveListingFn({ data: { id: item.id, raw } });
      setEditedRaw(raw);
      toast.success("Card updated — the double-check has run again");
    } catch (e: any) {
      toast.error(e.message ?? "Couldn't save that edit");
    }
  };

  const run = async (action: "import" | "discard") => {
    if (!item) return;
    if (action === "import" && check.errors > 0 && !override) {
      return toast.error("The double-check found problems — fix the post or tick \"Import anyway\" first");
    }
    if (action === "import" && !draft.destinationCategory) return toast.error("Pick a category and sub category");
    if (action === "import" && !draft.guideId && !draft.title.trim()) return toast.error("Pick the guide this post goes into");
    setBusy(action);
    try {
      const result = await resolveFn({
        data: {
          id: item.id,
          action,
          category: draft.destinationCategory || undefined,
          subcategories: draft.guideId ? [] : draft.subcategories,
          title: draft.title,
          guideId: draft.guideId ?? undefined,
          time: draft.time,
          sourceZone: draft.sourceZone ?? undefined,
        },
      });
      toast.success(
        action === "import"
          ? "Saved as a draft with its dates filled in — check it over, then publish"
          : "Import deleted",
      );
      onDone();
      onResolved();
      const editorId = action === "import" ? result.guideIds?.[0] : undefined;
      if (editorId) {
        await navigate({
          to: "/sports-guides/$id/edit",
          params: { id: editorId },
        });
      }
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setBusy(null);
    }
  };

  if (!item) {
    return (
      <Card className="space-y-2 p-6 text-center text-muted-foreground">
        <Inbox className="mx-auto size-6" />
        <p className="text-sm">Pick a post from the queue to set it up here.</p>
        <p className="text-xs">Category → subcategories → name of the guide.</p>
      </Card>
    );
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-muted-foreground">Setting up</p>
        <p className="truncate text-sm font-medium">{draft.title || "Untitled post"}</p>
      </div>

      <ImportCheckPanel check={check} override={override} onOverride={setOverride} />
      <WebFixPanel
        key={`${item.id}-${draft.sourceZone}`}
        itemId={item.id}
        guide={draft.title}
        check={check}
        onSaved={() => { setDraft({ ...draft, sourceZone: "gmt" }); onResolved(); }}
      />
      <ListingPreview check={check} onEditEvent={applyCardEdit} />

      {(step > 1 || step > 2 || step > 3) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {step > 1 && draft.category && (
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary transition hover:bg-primary/20"
            >
              <Check className="size-3" strokeWidth={3} />
              {draft.category}
            </button>
          )}
          {step > 2 && chosenChoice && (
            <button
              type="button"
              onClick={() => setStep(2)}
              className="flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary transition hover:bg-primary/20"
            >
              <Check className="size-3" strokeWidth={3} />
              {chosenChoice.name}
            </button>
          )}
          {step > 3 && groupSubs.length > 0 && selectedSubcategory && (
            <button
              type="button"
              onClick={() => setStep(3)}
              className="flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary transition hover:bg-primary/20"
            >
              <Check className="size-3" strokeWidth={3} />
              {selectedSubcategory}
            </button>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">Step 1 · Category names we have</span>
          <div className="max-h-44 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {cats.filter((c) => !c.parent_id).map((c) => {
              const on = draft.category === c.name;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setDraft({ ...draft, category: c.name, group: "", destinationCategory: "", subcategories: [], guideId: null })}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition ${
                    on ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted/60"
                  }`}
                >
                  <span className="truncate">{c.name}</span>
                  {on && <span className="text-xs">✓</span>}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-2 pt-1">
            <span />
            <Button
              size="sm"
              onClick={() => {
                // Some categories (e.g. Sports Passes, Daily Sports) have no
                // sub categories at all — skip straight to the guide list
                // instead of stalling on an empty step 2.
                if (subChoices.length === 0) {
                  setDraft({ ...draft, group: "", destinationCategory: draft.category, subcategories: [], guideId: null });
                  setStep(4);
                } else {
                  setStep(2);
                }
              }}
              disabled={!draft.category}
            >
              OK <Check className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">Step 2 · The sub categories we have</span>
          {subChoices.length > 0 ? (
            <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
              {subChoices.map((choice) => {
                const on = choice.isGroup
                  ? draft.group === choice.name
                  : selectedSubcategory === choice.name;
                return (
                  <button
                    key={choice.name}
                    type="button"
                    onClick={() => setDraft({
                      ...draft,
                      group: choice.isGroup ? choice.name : "",
                      destinationCategory: choice.destinationCategory,
                      subcategories: choice.isGroup ? [] : [choice.name],
                      guideId: null,
                    })}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
                      on
                        ? "border-primary bg-primary/10 font-medium text-primary"
                        : "border-border bg-card hover:bg-muted/60"
                    }`}
                  >
                    <span className="truncate">{choice.name}</span>
                    <span className="text-xs">{on ? "✓" : ""}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              {draft.category ? "No sub categories are set up in this category." : "Pick a category first."}
            </p>
          )}
          <div className="flex items-center justify-between gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setStep(1)}>
              <ArrowLeft className="size-4" /> Back
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (subChoices.length === 0) {
                  setDraft({ ...draft, group: "", destinationCategory: draft.category, subcategories: [], guideId: null });
                  setStep(4);
                  return;
                }
                setStep(groupSubs.length > 0 && chosenChoice?.isGroup ? 3 : 4);
              }}
              disabled={subChoices.length > 0 && !chosenChoice}
            >
              OK <Check className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {step === 3 && groupSubs.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">
            Step 3 · The sub categories in {draft.group}
          </span>
          <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
            {groupSubs.map((sub) => {
              const on = selectedSubcategory === sub.name;
              return (
                <button
                  key={sub.name}
                  type="button"
                  onClick={() => setDraft({ ...draft, subcategories: [sub.name], guideId: null })}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
                    on
                      ? "border-primary bg-primary/10 font-medium text-primary"
                      : "border-border bg-card hover:bg-muted/60"
                  }`}
                >
                  <span className="truncate">{sub.name}</span>
                  <span className="text-xs">{on ? "✓" : ""}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setStep(2)}>
              <ArrowLeft className="size-4" /> Back
            </Button>
            <Button size="sm" onClick={() => setStep(4)} disabled={!selectedSubcategory}>
              OK <Check className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">Step 4 · The name of the guide we are importing into</span>
          {!readyForGuides ? (
            <p className="text-[11px] text-muted-foreground">Pick a category first.</p>
          ) : loadingGuides ? (
            <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Loading existing guides…
            </p>
          ) : guides.length > 0 ? (
            <div className="max-h-48 divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {guides.map((g) => {
                const on = draft.guideId === g.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setDraft({ ...draft, title: g.title, guideId: g.id })}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition ${
                      on ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted/60"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {on && (
                        <span className="grid size-4 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                          <Check className="size-3" strokeWidth={3} />
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate">{g.title}</span>
                        {g.subcategory && (
                          <span className="block truncate text-[10px] text-muted-foreground">{g.subcategory}</span>
                        )}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">No guides have been created here yet.</p>
          )}
          <Input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value, guideId: null })}
            className="font-medium"
            placeholder="Or type a new guide name"
          />
          <div className="flex items-center justify-between gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStep(subChoices.length === 0 ? 1 : groupSubs.length > 0 && chosenChoice?.isGroup ? 3 : 2)}
            >
              <ArrowLeft className="size-4" /> Back
            </Button>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => run("discard")} disabled={busy !== null}>
          {busy === "discard" ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          Delete import
        </Button>
        <Button size="sm" onClick={() => run("import")} disabled={busy !== null || !draft.destinationCategory || (!draft.guideId && !draft.title.trim())}>
          {busy === "import" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Import
        </Button>
      </div>
    </Card>
  );
}

function ImportCheckPanel({ check, override, onOverride }: { check: ImportCheckResult; override: boolean; onOverride: (v: boolean) => void }) {
  if (!check.issues.length) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 p-2.5 text-xs font-medium text-primary">
        <Check className="size-4" strokeWidth={3} />
        Double-check passed — {check.events.length} events, every one has a time, name and channel, and the saved guide reads back exactly.
      </div>
    );
  }
  return (
    <div className={`space-y-1.5 rounded-lg border p-2.5 text-xs ${check.errors ? "border-destructive/50 bg-destructive/10" : "border-border bg-muted/30"}`}>
      <p className={`font-semibold ${check.errors ? "text-destructive" : "text-foreground"}`}>
        Double-check: {check.errors ? `${check.errors} problem${check.errors === 1 ? "" : "s"}` : "no problems"}
        {check.warnings ? `, ${check.warnings} warning${check.warnings === 1 ? "" : "s"}` : ""}
      </p>
      <ul className="space-y-1">
        {check.issues.map((issue, i) => (
          <li key={i} className={issue.level === "error" ? "text-destructive" : "text-muted-foreground"}>
            {issue.level === "error" ? "✕" : "!"} {issue.message}
            {issue.events?.length ? ` — card${issue.events.length === 1 ? "" : "s"} ${issue.events.slice(0, 12).map((n) => String(n).padStart(2, "0")).join(", ")}${issue.events.length > 12 ? "…" : ""}` : ""}
          </li>
        ))}
      </ul>
      {check.errors > 0 && (
        <label className="flex items-center gap-2 pt-1 text-foreground">
          <input type="checkbox" checked={override} onChange={(e) => onOverride(e.target.checked)} />
          I've checked the cards below — import anyway
        </label>
      )}
    </div>
  );
}

function WebFixPanel({ itemId, guide, check, onSaved }: { itemId: string; guide: string; check: ImportCheckResult; onSaved: () => void }) {
  const suggestFn = useServerFn(suggestListingFixes);
  const saveFn = useServerFn(saveQueueListing);
  const [busy, setBusy] = useState<"look" | "save" | null>(null);
  const [fixes, setFixes] = useState<ListingFixSuggestion[] | null>(null);
  const [accepted, setAccepted] = useState<Set<number>>(new Set());

  const flagged = useMemo(() => {
    const map = new Map<number, Set<"time" | "title" | "channel">>();
    for (const issue of check.issues) {
      if (!issue.fixable) continue;
      for (const n of issue.events ?? []) {
        if (!map.has(n)) map.set(n, new Set());
        map.get(n)!.add(issue.fixable);
      }
    }
    return [...map.entries()].slice(0, 15).map(([n, problems]) => {
      const e = check.events[n - 1];
      return { n, date: e?.date ?? null, time: e?.time ?? "", title: e?.title ?? "", channels: e?.channels ?? [], problems: [...problems] };
    });
  }, [check]);

  // Look up flagged rows automatically once per post.
  useEffect(() => {
    if (!flagged.length) return;
    let alive = true;
    setBusy("look");
    suggestFn({ data: { guide: guide || undefined, events: flagged } })
      .then((r: any) => { if (alive) { setFixes(r.fixes ?? []); setAccepted(new Set()); } })
      .catch((e: any) => { if (alive) { setFixes([]); toast.error(e.message ?? "Web lookup failed"); } })
      .finally(() => { if (alive) setBusy(null); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, flagged.length]);

  if (!flagged.length) return null;

  const apply = async () => {
    if (!fixes || !accepted.size) return;
    const events = check.events.map((e, i) => {
      const f = fixes.find((x) => x.n === i + 1);
      if (!f || !accepted.has(f.n)) return e;
      return { ...e, time: f.time ?? e.time, title: f.title ?? e.title, channels: f.channels?.length ? f.channels : e.channels };
    });
    setBusy("save");
    try {
      await saveFn({ data: { id: itemId, raw: formatSportsListingEvents(events, { channels: [] }) } });
      toast.success(`${accepted.size} fix${accepted.size === 1 ? "" : "es"} applied — double-check re-run`);
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Couldn't save the fixes");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-2.5 text-xs">
      <p className="flex items-center gap-1.5 font-semibold text-foreground">
        <Sparkles className="size-3.5 text-primary" /> Web check on {flagged.length} flagged card{flagged.length === 1 ? "" : "s"}
      </p>
      {busy === "look" && (
        <p className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Searching the internet for the right details…</p>
      )}
      {fixes && fixes.length === 0 && busy !== "look" && (
        <p className="text-muted-foreground">Nothing online confirmed a fix — check these cards by hand.</p>
      )}
      {fixes && fixes.length > 0 && (
        <>
          <ul className="space-y-1.5">
            {fixes.map((f) => {
              const e = check.events[f.n - 1];
              return (
                <li key={f.n}>
                  <label className="flex items-start gap-2 rounded-md border border-border bg-card/70 p-2">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={accepted.has(f.n)}
                      onChange={(ev) => {
                        const next = new Set(accepted);
                        if (ev.target.checked) next.add(f.n); else next.delete(f.n);
                        setAccepted(next);
                      }}
                    />
                    <span className="min-w-0 flex-1 space-y-0.5">
                      <span className="block font-semibold">Card {String(f.n).padStart(2, "0")}</span>
                      {f.time && <span className="block">Time: <s className="text-muted-foreground">{e?.time || "none"}</s> → <b>{f.time}</b></span>}
                      {f.title && <span className="block break-words">Name: <s className="text-muted-foreground">{e?.title || "none"}</s> → <b>{f.title}</b></span>}
                      {f.channels?.length ? <span className="block">Channel: <s className="text-muted-foreground">{e?.channels.join(", ") || "none"}</s> → <b>{f.channels.join(", ")}</b></span> : null}
                      <span className="block text-muted-foreground">{f.reason}{f.source ? ` · ${f.source}` : ""}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <Button size="sm" disabled={!accepted.size || busy !== null} onClick={apply}>
            {busy === "save" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            Apply {accepted.size || ""} ticked fix{accepted.size === 1 ? "" : "es"}
          </Button>
        </>
      )}
    </div>
  );
}

function ListingPreview({
  check,
  onEditEvent,
}: {
  check: ImportCheckResult;
  onEditEvent?: (index: number, updated: { time: string; title: string; channels: string[] }) => void | Promise<void>;
}) {
  // Shows exactly what the save action writes (same formatter, re-read).
  const events = check.events;
  const flagged = new Map<number, "error" | "warning">();
  const flagReasons = new Map<number, string[]>();
  for (const issue of check.issues) for (const n of issue.events ?? []) {
    if (flagged.get(n) !== "error") flagged.set(n, issue.level);
    flagReasons.set(n, [...(flagReasons.get(n) ?? []), issue.message]);
  }
  const [editing, setEditing] = useState<number | null>(null);
  const [editTime, setEditTime] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editChannels, setEditChannels] = useState("");
  const [saving, setSaving] = useState(false);
  // Reopen nothing after a save — the check re-runs and the card re-renders.
  useEffect(() => setEditing(null), [check.formatted]);

  if (!events.length) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        No event cards recognised yet. The original block will still be kept in the editor.
      </div>
    );
  }

  const startEdit = (index: number) => {
    const event = events[index];
    setEditing(index);
    setEditTime(event.time ?? "");
    setEditTitle(event.title ?? "");
    setEditChannels((event.channels ?? []).join(" | "));
  };

  const saveEdit = async (index: number) => {
    if (!onEditEvent) return;
    setSaving(true);
    try {
      await onEditEvent(index, {
        time: editTime.trim(),
        title: editTitle.trim(),
        channels: editChannels.split("|").map((c) => c.trim()).filter(Boolean),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-muted-foreground">Recognised event cards — flagged ones can be edited in place</span>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
          {events.length}
        </span>
      </div>
      <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
        {events.map((event, index) => {
          const flag = flagged.get(index + 1);
          const isEditing = editing === index;
          return (
            <div key={`${event.time}-${event.title}-${index}`} className={`rounded-md border bg-card/70 p-2 ${flag === "error" ? "border-destructive" : flag === "warning" ? "border-primary/50" : "border-border"}`}>
              <div className="flex items-start gap-2">
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  {isEditing ? (
                    <div className="space-y-1.5">
                      <Input
                        value={editTime}
                        onChange={(e) => setEditTime(e.target.value)}
                        placeholder="Start time, e.g. 19:45"
                        className="h-7 text-xs"
                      />
                      <Input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        placeholder="Event name"
                        className="h-7 text-xs"
                      />
                      <Input
                        value={editChannels}
                        onChange={(e) => setEditChannels(e.target.value)}
                        placeholder="Channels, split with | e.g. Sky Sports Main Event | Sky Sports+"
                        className="h-7 text-xs"
                      />
                      <div className="flex gap-1.5">
                        <Button size="sm" className="h-6 px-2 text-[11px]" disabled={saving} onClick={() => saveEdit(index)}>
                          {saving ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />} Save card
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setEditing(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs font-semibold text-foreground">{event.time}</p>
                      <p className="break-words text-sm font-medium leading-snug">{event.title}</p>
                      {event.channels.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {event.channels.map((channel) => (
                            <span key={channel} className="rounded-full border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              {channel}
                            </span>
                          ))}
                        </div>
                      )}
                      {flag && (
                        <p className={`mt-1 text-[10px] ${flag === "error" ? "text-destructive" : "text-primary"}`}>
                          {flagReasons.get(index + 1)?.join(" · ")}
                        </p>
                      )}
                    </>
                  )}
                </div>
                {onEditEvent && !isEditing && (
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => startEdit(index)}>
                    Edit
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}