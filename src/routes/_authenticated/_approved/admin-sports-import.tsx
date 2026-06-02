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
import { ArrowLeft, Loader2, Sparkles, Send, Trash2, Inbox, Wand2 } from "lucide-react";
import {
  parseDiscordPaste,
  importParsedEvents,
  queueUnmatched,
  listImportQueue,
  resolveQueueItem,
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

  const refreshQueue = () => {
    setLoadingQueue(true);
    listFn().then((d) => setQueue(d.items as QueueItem[]))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoadingQueue(false));
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
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <Link to="/admin" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to admin
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
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card className="p-4 space-y-3">
                    <h2 className="font-display text-lg flex items-center gap-2">
                      <CheckCircle2 className="size-5 text-green-500" />
                      Matched ({matched.length})
                    </h2>
                    {matched.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No auto-matches.</p>
                    ) : matched.map((e, i) => (
                      <EventRow
                        key={i}
                        event={e}
                        cats={cats}
                        subsByCatName={subsByCatName}
                        onChange={(p) => updateMatched(i, p)}
                        onRemove={() => removeMatched(i)}
                      />
                    ))}
                  </Card>

                  <Card className="p-4 space-y-3">
                    <h2 className="font-display text-lg flex items-center gap-2">
                      <AlertCircle className="size-5 text-amber-500" />
                      Needs Routing ({unmatched.length})
                    </h2>
                    {unmatched.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Everything matched — nothing to route.</p>
                    ) : unmatched.map((e, i) => (
                      <EventRow
                        key={i}
                        event={e}
                        cats={cats}
                        subsByCatName={subsByCatName}
                        onChange={(p) => updateUnmatched(i, p)}
                        onRemove={() => removeUnmatched(i)}
                      />
                    ))}
                  </Card>
                </div>

                <div className="flex justify-end">
                  <Button size="lg" onClick={onImportAll} disabled={importing}>
                    {importing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                    Import all (unrouted will queue)
                  </Button>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="queue" className="space-y-3">
            {loadingQueue ? (
              <div className="grid place-items-center py-10 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
              </div>
            ) : queue.length === 0 ? (
              <Card className="p-10 grid place-items-center text-center text-muted-foreground gap-2">
                <Inbox className="size-8" />
                <p>Review queue is empty.</p>
              </Card>
            ) : (
              queue.map((q) => (
                <QueueRow
                  key={q.id}
                  item={q}
                  cats={cats}
                  subsByCatName={subsByCatName}
                  onResolved={refreshQueue}
                  resolveFn={resolveFn}
                />
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
  const [category, setCategory] = useState<string>("");
  const [subcategory, setSubcategory] = useState<string | null>(null);
  const [busy, setBusy] = useState<"import" | "discard" | null>(null);
  const subs = category ? subsByCatName.get(category) ?? [] : [];

  const run = async (action: "import" | "discard") => {
    if (action === "import" && !category) return toast.error("Pick a category");
    setBusy(action);
    try {
      await resolveFn({ data: { id: item.id, action, category: category || undefined, subcategory, title } });
      toast.success(action === "import" ? "Imported as draft" : "Discarded");
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
        {[ev.date, ev.time].filter(Boolean).join(" · ")}
        {Array.isArray(ev.channels) && ev.channels.length > 0 && <> · {ev.channels.join(" • ")}</>}
      </div>
      {ev.raw && <pre className="text-xs bg-muted/50 rounded p-2 whitespace-pre-wrap break-words max-h-24 overflow-auto">{ev.raw}</pre>}
      <div className="grid grid-cols-2 gap-2">
        <Select value={category} onValueChange={(v) => { setCategory(v); setSubcategory(null); }}>
          <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            {cats.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select
          value={subcategory ?? "__none"}
          onValueChange={(v) => setSubcategory(v === "__none" ? null : v)}
          disabled={subs.length === 0}
        >
          <SelectTrigger><SelectValue placeholder={subs.length === 0 ? "—" : "Subcategory"} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">— None —</SelectItem>
            {subs.map((s) => <SelectItem key={s.name} value={s.name}>{s.name}{s.is_default ? " ★" : ""}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
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