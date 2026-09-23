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
import { ArrowLeft, Loader2, Sparkles, Send, Trash2, Inbox, Clock, Check } from "lucide-react";
import { firstClockIn, firstDateIn, parseClockTime, toSingleZoneTime, type TimeZoneChoice } from "@/lib/import-time";
import { parseSportsListingBlock } from "@/lib/sports-listing-format";
import {
  queuePastedPost,
  setupDiscordBot,
  listImportQueue,
  resolveQueueItem,
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
  const listFn = useServerFn(listImportQueue);
  const resolveFn = useServerFn(resolveQueueItem);
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
  // The three setup boxes live in the sidebar: tap a post, then work the sidebar.
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
      title: String(ev.title ?? ""),
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

  const onApproveAll = async () => {
    setApprovingAll(true);
    try {
      const r = await approveAllFn();
      toast.success(`Imported ${r.imported} suggested event(s) — saved as drafts, add the dates then publish${r.skipped ? ` · ${r.skipped} still need a category` : ""}`);
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
                    toast.success(`Discord connected — right-click any post in your server → Apps → Send to Sports Guide. (${r.application})`);
                  } catch (e: any) {
                    toast.error(e.message ?? "Discord setup failed");
                  } finally {
                    setSettingUpDiscord(false);
                  }
                }}
              >
                {settingUpDiscord ? <Loader2 className="size-4 animate-spin" /> : <Inbox className="size-4" />}
                {settingUpDiscord ? "Connecting…" : "Connect Discord bot"}
              </Button>
            )}
          </div>
        </header>

        <Tabs defaultValue="paste">
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
              <Button size="sm" variant="secondary" onClick={onApproveAll} disabled={approvingAll || suggestedCount === 0}>
                {approvingAll ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Approve all suggested ({suggestedCount})
              </Button>
            </div>

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
                          <QueueRow
                            key={q.id}
                            item={q}
                            time={t}
                            zone={zone}
                            selected={selectedId === q.id}
                            splitting={splittingId === q.id}
                            onSplit={() => splitItem(q.id)}
                            onSelect={() => selectItem(q)}
                            onZoneApply={(shown, z) => applyZoneToItem(q.id, shown, z)}
                          />
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
  onSplit,
  onSelect,
  onZoneApply,
}: {
  item: QueueItem;
  time: string | null;
  zone: TimeZoneChoice | null;
  selected: boolean;
  splitting: boolean;
  onSplit: () => void;
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
      {splitCount > 1 && (
        <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={splitting} onClick={onSplit}>
            {splitting ? <Loader2 className="size-3 animate-spin" /> : <Scissors className="size-3" />}
            Split into {splitCount} single events
          </Button>
          <span className="text-[11px] text-muted-foreground">Pick a guide for each event separately</span>
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

  const run = async (action: "import" | "discard") => {
    if (!item) return;
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
          ? "Saved as a draft — add the date, then publish"
          : "Discarded",
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

      <ListingPreview raw={String(item.parsed_event?.raw ?? item.raw_text ?? "")} sourceZone={draft.sourceZone} />

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
          Discard
        </Button>
        <Button size="sm" onClick={() => run("import")} disabled={busy !== null || !draft.destinationCategory || (!draft.guideId && !draft.title.trim())}>
          {busy === "import" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Import
        </Button>
      </div>
    </Card>
  );
}

function ListingPreview({ raw, sourceZone }: { raw: string; sourceZone: TimeZoneChoice | null }) {
  const events = useMemo(() => parseSportsListingBlock(raw), [raw]);
  if (!events.length) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        No event cards recognised yet. The original block will still be kept in the editor.
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-muted-foreground">Recognised event cards</span>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
          {events.length}
        </span>
      </div>
      <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
        {events.map((event, index) => {
          const converted = sourceZone
            ? toSingleZoneTime(event.time, event.date, sourceZone)
            : null;
          return (
            <div key={`${event.time}-${event.title}-${index}`} className="rounded-md border border-border bg-card/70 p-2">
              <div className="flex items-start gap-2">
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground">{converted ?? event.time}</p>
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
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}