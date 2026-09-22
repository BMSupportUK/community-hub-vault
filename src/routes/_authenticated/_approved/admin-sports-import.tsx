import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Sparkles, Send, Trash2, Inbox, Wand2, Clock } from "lucide-react";
import { buildDualTime, hasBothZones, parseClockTime } from "@/lib/import-time";
import {
  parseDiscordPaste,
  importParsedEvents,
  queueUnmatched,
  listImportQueue,
  resolveQueueItem,
  approveAllSuggested,
  listCategoriesWithSubs,
  type RoutedEvent,
} from "@/lib/discord-import.functions";

export const Route = createFileRoute("/_authenticated/_approved/admin-sports-import")({
  component: AdminSportsImportPage,
});

type Cat = { id: string; name: string };
type Sub = { category_id: string; name: string; sort_order: number; is_default: boolean };
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
  const parseFn = useServerFn(parseDiscordPaste);
  const importFn = useServerFn(importParsedEvents);
  const queueFn = useServerFn(queueUnmatched);
  const listFn = useServerFn(listImportQueue);
  const resolveFn = useServerFn(resolveQueueItem);
  const catsFn = useServerFn(listCategoriesWithSubs);

  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [matched, setMatched] = useState<RoutedEvent[]>([]);
  const [unmatched, setUnmatched] = useState<RoutedEvent[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [queueFilter, setQueueFilter] = useState<"all" | "telegram" | "paste">("all");
  const [approvingAll, setApprovingAll] = useState(false);
  const approveAllFn = useServerFn(approveAllSuggested);
  const [bulkCategory, setBulkCategory] = useState<string>("");
  const [bulkSubcategory, setBulkSubcategory] = useState<string | null>(null);

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
      toast.success(`Imported ${r.imported} suggested event(s) as drafts${r.skipped ? ` · ${r.skipped} still need a category` : ""}`);
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

  const bulkSubs = bulkCategory ? subsByCatName.get(bulkCategory) ?? [] : [];

  if (!isStaff) return <Navigate to="/home" />;

  const onParse = async () => {
    const t = text.trim();
    if (!t) return toast.error("Paste some Discord messages first");
    setParsing(true);
    setMatched([]);
    setUnmatched([]);
    try {
      const res = await parseFn({ data: { text: t } });
      // Ignore AI category routing — strip suggestions and merge into one list.
      // If a bulk default is set, pre-fill every row with it.
      const all = [...(res.matched as RoutedEvent[]), ...(res.unmatched as RoutedEvent[])].map((e) => ({
        ...e,
        category: bulkCategory || null,
        subcategory: bulkCategory ? bulkSubcategory : null,
      }));
      setMatched([]);
      setUnmatched(all);
      const total = all.length;
      if (total === 0) toast.error("No events found in the pasted text");
      else toast.success(`Found ${total} event(s) — pick a category for each (or use the bulk picker)`);
    } catch (e: any) {
      toast.error(e.message ?? "Parse failed");
    } finally {
      setParsing(false);
    }
  };

  const updateMatched = (idx: number, patch: Partial<RoutedEvent>) =>
    setMatched((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));

  const updateUnmatched = (idx: number, patch: Partial<RoutedEvent>) =>
    setUnmatched((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));

  const removeMatched = (idx: number) => setMatched((prev) => prev.filter((_, i) => i !== idx));
  const removeUnmatched = (idx: number) => setUnmatched((prev) => prev.filter((_, i) => i !== idx));

  const applyBulkToAll = () => {
    if (!bulkCategory) return toast.error("Pick a category first");
    setMatched((prev) => prev.map((e) => ({ ...e, category: bulkCategory, subcategory: bulkSubcategory })));
    setUnmatched((prev) => prev.map((e) => ({ ...e, category: bulkCategory, subcategory: bulkSubcategory })));
    toast.success(`Applied ${bulkCategory}${bulkSubcategory ? ` › ${bulkSubcategory}` : ""} to all events`);
  };

  const onImportAll = async () => {
    setImporting(true);
    try {
      // 1) Import everything with a category set
      const toImport = [...matched, ...unmatched].filter((e) => e.category);
      let inserted = 0;
      if (toImport.length) {
        const r = await importFn({
          data: {
            events: toImport.map((e) => ({
              title: e.title,
              time: e.time,
              date: e.date,
              channels: e.channels,
              raw: e.raw,
              category: e.category!,
              subcategory: e.subcategory ?? null,
            })),
          },
        });
        inserted = r.inserted;
      }
      // 2) Queue anything still without a category
      const toQueue = unmatched.filter((e) => !e.category);
      let queued = 0;
      if (toQueue.length) {
        const r = await queueFn({
          data: {
            events: toQueue.map((e) => ({
              title: e.title,
              time: e.time,
              date: e.date,
              channels: e.channels,
              raw: e.raw,
            })),
          },
        });
        queued = r.queued;
      }
      toast.success(`Imported ${inserted} • Queued ${queued} for review`);
      setMatched([]);
      setUnmatched([]);
      setText("");
      refreshQueue();
    } catch (e: any) {
      toast.error(e.message ?? "Import failed");
    } finally {
      setImporting(false);
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
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">Sports Guide Importer</h1>
              <p className="text-sm text-white/85">Paste Discord listings — AI splits them into events and routes to your categories.</p>
            </div>
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
              <label className="text-sm font-medium">Paste from Discord</label>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={10}
                placeholder={"Copy one or more messages from a Discord sports channel and paste here.\n\nExample:\nSaturday 1 January 2026\n19:45 GMT\nManchester United vs Liverpool\nSky Sports Main Event"}
                className="font-mono text-sm"
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={onParse} disabled={parsing || !text.trim()}>
                  {parsing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                  {parsing ? "Parsing…" : "Parse with AI"}
                </Button>
                <Button variant="outline" onClick={() => { setText(""); setMatched([]); setUnmatched([]); }}>
                  Clear
                </Button>
              </div>
            </Card>

            {(matched.length > 0 || unmatched.length > 0) && (
              <>
                <Card className="p-4 space-y-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="flex-1 min-w-[180px]">
                      <label className="text-xs text-muted-foreground">Default category</label>
                      <Select value={bulkCategory} onValueChange={(v) => { setBulkCategory(v); setBulkSubcategory(null); }}>
                        <SelectTrigger><SelectValue placeholder="Pick a category" /></SelectTrigger>
                        <SelectContent>
                          {cats.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1 min-w-[180px]">
                      <label className="text-xs text-muted-foreground">Default subcategory</label>
                      <Select
                        value={bulkSubcategory ?? "__none"}
                        onValueChange={(v) => setBulkSubcategory(v === "__none" ? null : v)}
                        disabled={bulkSubs.length === 0}
                      >
                        <SelectTrigger><SelectValue placeholder={bulkSubs.length === 0 ? "—" : "Pick a subcategory"} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">— None —</SelectItem>
                          {bulkSubs.map((s) => <SelectItem key={s.name} value={s.name}>{s.name}{s.is_default ? " ★" : ""}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button variant="secondary" onClick={applyBulkToAll} disabled={!bulkCategory}>
                      <Wand2 className="size-4" />
                      Apply to all
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Pick once and hit “Apply to all”, or set per-event below. AI category suggestions are ignored.
                  </p>
                </Card>

                <Card className="p-4 space-y-3">
                  <h2 className="font-display text-lg">Events ({matched.length + unmatched.length})</h2>
                  {[...matched, ...unmatched].map((e, i) => {
                    const inMatched = i < matched.length;
                    const localIdx = inMatched ? i : i - matched.length;
                    return (
                      <EventRow
                        key={i}
                        event={e}
                        cats={cats}
                        subsByCatName={subsByCatName}
                        onChange={(p) => (inMatched ? updateMatched(localIdx, p) : updateUnmatched(localIdx, p))}
                        onRemove={() => (inMatched ? removeMatched(localIdx) : removeUnmatched(localIdx))}
                      />
                    );
                  })}
                </Card>

                <div className="flex justify-end">
                  <Button size="lg" onClick={onImportAll} disabled={importing}>
                    {importing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                    Import all
                  </Button>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="queue" className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {(["all", "telegram", "paste"] as const).map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant={queueFilter === f ? "default" : "outline"}
                  onClick={() => setQueueFilter(f)}
                >
                  {f === "all" ? "All" : f === "telegram" ? "Telegram" : "Pasted"}
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
            {loadingQueue ? (
              <div className="grid place-items-center py-10 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
              </div>
            ) : visibleQueue.length === 0 ? (
              <Card className="p-10 grid place-items-center text-center text-muted-foreground gap-2">
                <Inbox className="size-8" />
                <p>{queue.length === 0 ? "Review queue is empty." : "Nothing from this source."}</p>
                <p className="text-xs">Forward a listings post to your Telegram bot and it will appear here.</p>
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
                  {items.map((q) => (
                    <QueueRow
                      key={q.id}
                      item={q}
                      cats={cats}
                      subsByCatName={subsByCatName}
                      onResolved={refreshQueue}
                      resolveFn={resolveFn}
                    />
                  ))}
                </section>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

function EventRow({
  event,
  cats,
  subsByCatName,
  onChange,
  onRemove,
}: {
  event: RoutedEvent;
  cats: Cat[];
  subsByCatName: Map<string, Sub[]>;
  onChange: (patch: Partial<RoutedEvent>) => void;
  onRemove: () => void;
}) {
  const subs = event.category ? subsByCatName.get(event.category) ?? [] : [];
  return (
    <div className="rounded-lg border border-border p-3 space-y-2 bg-card/50">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <Input
            value={event.title}
            onChange={(e) => onChange({ title: e.target.value })}
            className="font-medium"
          />
          <div className="text-xs text-muted-foreground mt-1 truncate">
            {[event.date, event.time].filter(Boolean).join(" · ")}
            {event.channels.length > 0 && <> · {event.channels.join(" • ")}</>}
          </div>
        </div>
        <Button size="icon" variant="ghost" onClick={onRemove}>
          <Trash2 className="size-4" />
        </Button>
      </div>
      {!hasBothZones(event.time) && parseClockTime(event.time) !== null && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Time listed is:</span>
          {(["gmt", "et"] as const).map((z) => (
            <Button
              key={z}
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() => {
                const dual = buildDualTime(event.time, event.date, z);
                if (!dual) return toast.error("Couldn't read the time on this post");
                onChange({ time: dual });
              }}
            >
              <Clock className="size-3" /> {z.toUpperCase()}
            </Button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Select value={event.category ?? ""} onValueChange={(v) => onChange({ category: v, subcategory: null })}>
          <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            {cats.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select
          value={event.subcategory ?? "__none"}
          onValueChange={(v) => onChange({ subcategory: v === "__none" ? null : v })}
          disabled={subs.length === 0}
        >
          <SelectTrigger><SelectValue placeholder={subs.length === 0 ? "—" : "Subcategory"} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">— None —</SelectItem>
            {subs.map((s) => <SelectItem key={s.name} value={s.name}>{s.name}{s.is_default ? " ★" : ""}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function QueueRow({
  item,
  cats,
  subsByCatName,
  onResolved,
  resolveFn,
}: {
  item: QueueItem;
  cats: Cat[];
  subsByCatName: Map<string, Sub[]>;
  onResolved: () => void;
  resolveFn: (args: any) => Promise<any>;
}) {
  const ev = item.parsed_event ?? {};
  const [title, setTitle] = useState<string>(String(ev.title ?? ""));
  const [category, setCategory] = useState<string>(String(ev.suggested_category ?? ""));
  const [subcategories, setSubcategories] = useState<string[]>(
    ev.suggested_subcategory ? [String(ev.suggested_subcategory)] : [],
  );
  const [busy, setBusy] = useState<"import" | "discard" | null>(null);
  const [time, setTime] = useState<string | null>(ev.time ?? null);
  const subs = category ? subsByCatName.get(category) ?? [] : [];

  // Only offer the zone buttons when the post lists a single time without
  // both zones spelled out — and only when we can actually read the clock.
  const needsZone = !hasBothZones(time) && parseClockTime(time) !== null;

  const applyZone = (zone: "gmt" | "et") => {
    const dual = buildDualTime(ev.time ?? time, ev.date, zone);
    if (!dual) return toast.error("Couldn't read the time on this post");
    setTime(dual);
    toast.success(`Time set from ${zone.toUpperCase()} — ${dual}`);
  };

  const run = async (action: "import" | "discard") => {
    if (action === "import" && !category) return toast.error("Pick a category");
    setBusy(action);
    try {
      await resolveFn({
        data: {
          id: item.id,
          action,
          category: category || undefined,
          subcategories,
          title,
          time,
        },
      });
      toast.success(
        action === "import"
          ? `Imported as draft${subcategories.length > 1 ? ` in ${subcategories.length} subcategories` : ""}`
          : "Discarded",
      );
      onResolved();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="p-3 space-y-2">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} className="font-medium" />
      <div className="text-xs text-muted-foreground">
        {[ev.date, time].filter(Boolean).join(" · ")}
        {Array.isArray(ev.channels) && ev.channels.length > 0 && <> · {ev.channels.join(" • ")}</>}
      </div>
      {needsZone && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Time listed is:</span>
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => applyZone("gmt")}>
            <Clock className="size-3" /> GMT
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => applyZone("et")}>
            <Clock className="size-3" /> ET
          </Button>
        </div>
      )}
      {item.source === "telegram" && (
        <div className="text-[11px] text-muted-foreground">
          via Telegram{item.forwarded_from ? ` · forwarded from ${item.forwarded_from}` : ""}
        </div>
      )}
      {ev.raw && <pre className="text-xs bg-muted/50 rounded p-2 whitespace-pre-wrap break-words max-h-24 overflow-auto">{ev.raw}</pre>}
      <Select value={category} onValueChange={(v) => { setCategory(v); setSubcategories([]); }}>
        <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
        <SelectContent>
          {cats.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>
      {subs.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">
              Subcategories {subcategories.length > 0 && `· ${subcategories.length} selected`}
            </span>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[11px]"
                onClick={() => setSubcategories(subs.map((s) => s.name))}
              >
                Select all
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[11px]"
                onClick={() => setSubcategories([])}
              >
                Clear
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {subs.map((s) => {
              const on = subcategories.includes(s.name);
              return (
                <button
                  key={s.name}
                  type="button"
                  onClick={() =>
                    setSubcategories((prev) =>
                      prev.includes(s.name) ? prev.filter((n) => n !== s.name) : [...prev, s.name],
                    )
                  }
                  className={`rounded-full px-2.5 py-1 text-[11px] ring-1 transition ${
                    on
                      ? "bg-primary text-primary-foreground ring-primary"
                      : "bg-muted/50 text-muted-foreground ring-border hover:text-foreground"
                  }`}
                >
                  {s.name}{s.is_default ? " ★" : ""}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => run("discard")} disabled={busy !== null}>
          {busy === "discard" ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          Discard
        </Button>
        <Button size="sm" onClick={() => run("import")} disabled={busy !== null || !category}>
          {busy === "import" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Import
        </Button>
      </div>
    </Card>
  );
}