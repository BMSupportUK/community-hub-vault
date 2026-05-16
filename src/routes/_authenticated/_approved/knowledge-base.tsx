import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Search, X, Pencil, Trash2, GripVertical, BookOpen, ChevronRight,
  ArrowLeft, Save, Loader2, FolderPlus, Eye, EyeOff, Star,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { HtmlEditor } from "@/components/ui/html-editor";
import { sanitizeRichHtml } from "@/lib/sanitize-html";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import kbHero from "@/assets/knowledge-base-hero.jpg";

export const Route = createFileRoute("/_authenticated/_approved/knowledge-base")({
  component: KnowledgeBasePage,
});

type Category = { id: string; name: string; slug: string; icon: string; sort_order: number };
type Article = {
  id: string;
  category_id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  body: string | null;
  image_url: string | null;
  badge: string | null;
  published: boolean;
  sort_order: number;
  created_at: string;
};
type Welcome = { title: string; body: string };
type RatingRow = { article_id: string; user_id: string; rating: number };

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `item-${Date.now()}`;
}

const KB_DRAFT_KEY = "kb-new-article-draft";
const KB_TAB_KEY = "kb-active-tab";
const KB_CAT_KEY = "kb-active-cat";
const KB_EDIT_KEY = "kb-editing-article";
const KB_READ_KEY = "kb-reading-article";

function StarRating({
  value, onChange, size = 16, readOnly = false,
}: { value: number; onChange?: (n: number) => void; size?: number; readOnly?: boolean }) {
  const [hover, setHover] = useState(0);
  const display = hover || value;
  return (
    <div className="inline-flex items-center gap-0.5" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= display;
        return (
          <button
            key={n}
            type="button"
            disabled={readOnly}
            onMouseEnter={() => !readOnly && setHover(n)}
            onClick={() => !readOnly && onChange?.(n)}
            className={cn("p-0.5 rounded transition-transform", !readOnly && "hover:scale-110 cursor-pointer", readOnly && "cursor-default")}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
          >
            <Star
              style={{ width: size, height: size }}
              className={cn(filled ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")}
            />
          </button>
        );
      })}
    </div>
  );
}

function KnowledgeBasePage() {
  const { isMod, user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<string>(() => {
    try { return sessionStorage.getItem(KB_TAB_KEY) || "welcome"; } catch { return "welcome"; }
  });
  const [welcome, setWelcome] = useState<Welcome>({ title: "", body: "" });
  const [welcomeDraft, setWelcomeDraft] = useState<Welcome | null>(null);
  const [savingWelcome, setSavingWelcome] = useState(false);
  const [activeCat, setActiveCat] = useState<string | null>(() => {
    try { return sessionStorage.getItem(KB_CAT_KEY); } catch { return null; }
  });
  const [search, setSearch] = useState("");
  const [reading, setReading] = useState<Article | null>(() => {
    try { const raw = sessionStorage.getItem(KB_READ_KEY); return raw ? JSON.parse(raw) as Article : null; } catch { return null; }
  });
  const [editing, setEditing] = useState<Article | null>(() => {
    try { const raw = sessionStorage.getItem(KB_EDIT_KEY); return raw ? JSON.parse(raw) as Article : null; } catch { return null; }
  });
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [showCatEditor, setShowCatEditor] = useState(false);
  const dragCatId = useRef<string | null>(null);
  const dragArtId = useRef<string | null>(null);

  // Persist UI state across screen swaps (route remounts).
  useEffect(() => { try { sessionStorage.setItem(KB_TAB_KEY, tab); } catch { /* ignore */ } }, [tab]);
  useEffect(() => {
    try {
      if (activeCat) sessionStorage.setItem(KB_CAT_KEY, activeCat);
      else sessionStorage.removeItem(KB_CAT_KEY);
    } catch { /* ignore */ }
  }, [activeCat]);
  useEffect(() => {
    try {
      if (editing) sessionStorage.setItem(KB_EDIT_KEY, JSON.stringify(editing));
      else sessionStorage.removeItem(KB_EDIT_KEY);
    } catch { /* ignore */ }
  }, [editing]);
  useEffect(() => {
    try {
      if (reading) sessionStorage.setItem(KB_READ_KEY, JSON.stringify(reading));
      else sessionStorage.removeItem(KB_READ_KEY);
    } catch { /* ignore */ }
  }, [reading]);

  const kbQuery = useQuery({
    queryKey: ["kb-data"],
    queryFn: async () => {
      const [{ data: cats }, { data: arts }, { data: setting }, { data: rs }] = await Promise.all([
        supabase.from("kb_categories").select("*").order("sort_order"),
        supabase.from("kb_articles").select("*").order("sort_order").order("created_at", { ascending: false }),
        supabase.from("app_settings").select("value").eq("key", "kb_welcome").maybeSingle(),
        supabase.from("kb_article_ratings").select("article_id, user_id, rating"),
      ]);
      return {
        categories: (cats ?? []) as Category[],
        articles: (arts ?? []) as Article[],
        ratings: (rs ?? []) as RatingRow[],
        welcome: (setting?.value as Welcome | null) ?? null,
      };
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const categories = kbQuery.data?.categories ?? [];
  const articles = kbQuery.data?.articles ?? [];
  const ratings = kbQuery.data?.ratings ?? [];
  const loading = kbQuery.isLoading;
  const load = () => queryClient.invalidateQueries({ queryKey: ["kb-data"] });

  // Sync welcome from query data; auto-select first category once data arrives.
  useEffect(() => {
    const w = kbQuery.data?.welcome ?? null;
    setWelcome({
      title: w?.title ?? "Welcome to the Knowledge Base",
      body: w?.body ?? "Search our guides or browse by category to find answers fast.",
    });
  }, [kbQuery.data?.welcome]);
  useEffect(() => {
    if (categories.length && !activeCat) setActiveCat(categories[0].id);
  }, [categories, activeCat]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of articles) m[a.category_id] = (m[a.category_id] ?? 0) + 1;
    return m;
  }, [articles]);

  const ratingStats = useMemo(() => {
    const m: Record<string, { avg: number; count: number }> = {};
    const buckets: Record<string, number[]> = {};
    for (const r of ratings) {
      (buckets[r.article_id] ??= []).push(r.rating);
    }
    for (const [id, list] of Object.entries(buckets)) {
      const sum = list.reduce((a, b) => a + b, 0);
      m[id] = { avg: sum / list.length, count: list.length };
    }
    return m;
  }, [ratings]);

  const myRatingFor = (articleId: string) =>
    user?.id ? ratings.find((r) => r.article_id === articleId && r.user_id === user.id)?.rating ?? 0 : 0;

  const rateArticle = async (articleId: string, rating: number) => {
    if (!user?.id) return toast.error("Sign in to rate");
    // optimistic
    queryClient.setQueryData<typeof kbQuery.data>(["kb-data"], (prev) => {
      if (!prev) return prev;
      const others = prev.ratings.filter((r) => !(r.article_id === articleId && r.user_id === user.id));
      return { ...prev, ratings: [...others, { article_id: articleId, user_id: user.id, rating }] };
    });
    const { error } = await supabase
      .from("kb_article_ratings")
      .upsert({ article_id: articleId, user_id: user.id, rating }, { onConflict: "article_id,user_id" });
    if (error) {
      toast.error(error.message);
      load();
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return articles.filter((a) => {
      if (!q && activeCat && a.category_id !== activeCat) return false;
      if (!isMod && !a.published) return false;
      if (!q) return true;
      return (
        a.title.toLowerCase().includes(q) ||
        (a.excerpt ?? "").toLowerCase().includes(q) ||
        (a.body ?? "").toLowerCase().includes(q)
      );
    });
  }, [articles, activeCat, search, isMod]);

  const activeCategory = categories.find((c) => c.id === activeCat) ?? null;

  // ---------- Article CRUD ----------
  const openNewArticle = () => {
    let draft: Article | null = null;
    try {
      const raw = localStorage.getItem(KB_DRAFT_KEY);
      if (raw) draft = JSON.parse(raw) as Article;
    } catch { draft = null; }
    setEditing({
      id: "",
      category_id: draft?.category_id || activeCat || categories[0]?.id || "",
      title: draft?.title ?? "",
      slug: draft?.slug ?? "",
      excerpt: draft?.excerpt ?? "",
      body: draft?.body ?? "",
      image_url: draft?.image_url ?? "",
      badge: draft?.badge ?? "",
      published: draft?.published ?? false,
      sort_order: 0,
      created_at: "",
    });
    if (draft && (draft.title || draft.body || draft.excerpt || draft.image_url)) {
      toast.message("Draft restored");
    }
  };

  // Persist new-article draft so it survives navigation / accidental close.
  useEffect(() => {
    if (!editing || editing.id) return;
    try { localStorage.setItem(KB_DRAFT_KEY, JSON.stringify(editing)); } catch { /* ignore */ }
  }, [editing]);

  const saveArticle = async () => {
    if (!editing) return;
    if (!editing.title.trim() || !editing.category_id) return toast.error("Title and category are required");
    const slug = editing.slug?.trim() || slugify(editing.title);
    const payload = {
      category_id: editing.category_id,
      title: editing.title.trim(),
      slug,
      excerpt: editing.excerpt?.trim() || null,
      body: editing.body?.trim() || null,
      image_url: editing.image_url?.trim() || null,
      badge: editing.badge?.trim() || null,
      published: editing.published,
    };
    const { error } = editing.id
      ? await supabase.from("kb_articles").update(payload).eq("id", editing.id)
      : await supabase.from("kb_articles").insert({ ...payload, created_by: user?.id ?? null });
    if (error) return toast.error(error.message);
    toast.success(editing.id ? "Article updated" : "Article added");
    if (!editing.id) { try { localStorage.removeItem(KB_DRAFT_KEY); } catch { /* ignore */ } }
    setEditing(null);
    load();
  };

  const deleteArticle = async (id: string) => {
    if (!confirm("Delete this article?")) return;
    const { error } = await supabase.from("kb_articles").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    setReading(null);
    load();
  };

  // ---------- Category CRUD ----------
  const openNewCategory = () => {
    setEditingCat({ id: "", name: "", slug: "", icon: "BookOpen", sort_order: (categories.at(-1)?.sort_order ?? 0) + 10 });
    setShowCatEditor(true);
  };

  const saveCategory = async () => {
    if (!editingCat) return;
    if (!editingCat.name.trim()) return toast.error("Name is required");
    const slug = editingCat.slug?.trim() || slugify(editingCat.name);
    const payload = { name: editingCat.name.trim(), slug, icon: editingCat.icon || "BookOpen", sort_order: editingCat.sort_order };
    const { error } = editingCat.id
      ? await supabase.from("kb_categories").update(payload).eq("id", editingCat.id)
      : await supabase.from("kb_categories").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(editingCat.id ? "Category updated" : "Category added");
    setEditingCat(null); setShowCatEditor(false);
    load();
  };

  const deleteCategory = async (id: string) => {
    const n = counts[id] ?? 0;
    if (n > 0 && !confirm(`This category has ${n} article(s). Delete it and ALL of its articles?`)) return;
    if (n === 0 && !confirm("Delete this category?")) return;
    const { error } = await supabase.from("kb_categories").delete().eq("id", id);
    if (error) return toast.error(error.message);
    if (activeCat === id) setActiveCat(null);
    toast.success("Category deleted");
    load();
  };

  // ---------- Reorder ----------
  const reorderCategories = async (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const list = [...categories];
    const fi = list.findIndex((c) => c.id === fromId);
    const ti = list.findIndex((c) => c.id === toId);
    if (fi < 0 || ti < 0) return;
    const [moved] = list.splice(fi, 1);
    list.splice(ti, 0, moved);
    const updated = list.map((c, i) => ({ ...c, sort_order: (i + 1) * 10 }));
    queryClient.setQueryData<typeof kbQuery.data>(["kb-data"], (prev) => prev ? { ...prev, categories: updated } : prev);
    await Promise.all(updated.map((c) =>
      supabase.from("kb_categories").update({ sort_order: c.sort_order }).eq("id", c.id)
    ));
  };

  const reorderArticles = async (fromId: string, toId: string) => {
    if (fromId === toId || !activeCat) return;
    const inCat = articles.filter((a) => a.category_id === activeCat);
    const others = articles.filter((a) => a.category_id !== activeCat);
    const fi = inCat.findIndex((a) => a.id === fromId);
    const ti = inCat.findIndex((a) => a.id === toId);
    if (fi < 0 || ti < 0) return;
    const [moved] = inCat.splice(fi, 1);
    inCat.splice(ti, 0, moved);
    const updated = inCat.map((a, i) => ({ ...a, sort_order: (i + 1) * 10 }));
    queryClient.setQueryData<typeof kbQuery.data>(["kb-data"], (prev) => prev ? { ...prev, articles: [...others, ...updated] } : prev);
    await Promise.all(updated.map((a) =>
      supabase.from("kb_articles").update({ sort_order: a.sort_order }).eq("id", a.id)
    ));
  };

  // ---------- Welcome ----------
  const saveWelcome = async () => {
    if (!welcomeDraft) return;
    setSavingWelcome(true);
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: "kb_welcome", value: welcomeDraft as never, updated_by: user?.id ?? null });
    setSavingWelcome(false);
    if (error) return toast.error(error.message);
    setWelcome(welcomeDraft);
    setWelcomeDraft(null);
    toast.success("Welcome message saved");
  };

  // ---------- Reading view ----------
  if (reading) {
    const stats = ratingStats[reading.id];
    const mine = myRatingFor(reading.id);
    return (
      <main className="flex-1 overflow-y-auto bg-background">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <button onClick={() => setReading(null)} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
            <ArrowLeft className="size-4" /> Back to knowledge base
          </button>
          {reading.image_url && (
            <img src={reading.image_url} alt={reading.title} className="w-full h-64 object-cover rounded-2xl mb-6 border border-border" />
          )}
          <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
            <span>{categories.find((c) => c.id === reading.category_id)?.name ?? "Knowledge Base"}</span>
            {reading.badge && <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">{reading.badge}</span>}
            {!reading.published && <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">Draft</span>}
          </div>
          <h1 className="font-display text-3xl font-bold mb-3">{reading.title}</h1>
          {reading.excerpt && <p className="text-lg text-muted-foreground mb-4">{reading.excerpt}</p>}

          <div className="flex flex-wrap items-center gap-3 mb-6 p-3 rounded-xl border border-border bg-surface-2/40">
            <div className="flex items-center gap-2">
              <StarRating value={Math.round(stats?.avg ?? 0)} readOnly size={16} />
              <span className="text-sm text-muted-foreground">
                {stats ? `${stats.avg.toFixed(1)} · ${stats.count} rating${stats.count === 1 ? "" : "s"}` : "No ratings yet"}
              </span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Your rating:</span>
              <StarRating value={mine} onChange={(n) => rateArticle(reading.id, n)} size={20} />
            </div>
          </div>

          {reading.body ? (
            <article
              className="prose prose-invert max-w-none text-foreground/90 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(reading.body) }}
            />
          ) : (
            <article className="prose prose-invert max-w-none text-foreground/90 leading-relaxed">
              <em className="text-muted-foreground">No content yet.</em>
            </article>
          )}
          {isMod && (
            <div className="mt-8 flex gap-2 border-t border-border pt-4">
              <Button variant="secondary" onClick={() => { setEditing(reading); setReading(null); }}>
                <Pencil className="size-4 mr-1.5" /> Edit
              </Button>
              <Button variant="destructive" onClick={() => deleteArticle(reading.id)}>
                <Trash2 className="size-4 mr-1.5" /> Delete
              </Button>
            </div>
          )}
        </div>
        {editing && <ArticleEditor editing={editing} setEditing={setEditing} categories={categories} onSave={saveArticle} />}
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto bg-background">
      <header className="px-8 pt-8 pb-6 border-b border-border bg-surface-2/40 backdrop-blur">
        <h1 className="font-display text-3xl font-bold" style={{ backgroundImage: "var(--gradient-primary)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
          Knowledge Base
        </h1>
        <p className="text-muted-foreground mt-1">Guides, answers and how-tos — all in one place.</p>
      </header>

      <div className="px-8 py-6">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <TabsList className={`grid ${isMod ? "grid-cols-3" : "grid-cols-2"} max-w-2xl bg-surface-2/60 border border-border`}>
              <TabsTrigger value="welcome">Welcome</TabsTrigger>
              <TabsTrigger value="guides">Guides</TabsTrigger>
              {isMod && <TabsTrigger value="categories">Categories</TabsTrigger>}
            </TabsList>
            {isMod && tab === "guides" && (
              <Button onClick={openNewArticle} className="gap-1.5">
                <Plus className="size-4" /> New article
              </Button>
            )}
          </div>

          {/* WELCOME */}
          <TabsContent value="welcome" className="mt-0">
            <div
              className="relative overflow-hidden rounded-2xl border border-border p-10 shadow-lg grid md:grid-cols-[1fr_auto] gap-8 items-center"
              style={{ background: "var(--gradient-primary)" }}
            >
              <div className="relative z-10">
                <h2 className="font-display text-3xl md:text-4xl font-bold text-primary-foreground">{welcome.title}</h2>
                <p className="mt-3 text-lg text-primary-foreground/90 max-w-xl">{welcome.body}</p>
                <div className="mt-6 flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => setTab("guides")}>
                    Browse guides
                  </Button>
                  {isMod && (
                    <Button variant="outline" className="bg-white/10 border-white/30 text-primary-foreground hover:bg-white/20" onClick={() => setWelcomeDraft(welcome)}>
                      <Pencil className="size-4 mr-1.5" /> Edit message
                    </Button>
                  )}
                </div>
              </div>
              <img
                src={kbHero}
                alt="Knowledge base illustration"
                width={420}
                height={420}
                className="relative z-10 w-56 md:w-80 h-auto rounded-2xl shadow-xl ring-1 ring-white/20 justify-self-end"
              />
            </div>

            {!loading && categories.length > 0 && (
              <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {categories.map((c) => {
                  const list = articles.filter((a) => a.category_id === c.id && (isMod || a.published));
                  return (
                    <button
                      key={c.id}
                      onClick={() => { setActiveCat(c.id); setTab("guides"); }}
                      className="text-left rounded-2xl border border-border bg-surface-2/40 hover:bg-surface-2/70 hover:border-primary/50 hover:shadow-glow p-5 transition-all"
                    >
                      <div className="size-11 rounded-xl grid place-items-center mb-4" style={{ background: "var(--gradient-primary)" }}>
                        <BookOpen className="size-5 text-primary-foreground" />
                      </div>
                      <h3 className="font-display font-bold text-lg mb-1">{c.name}</h3>
                      <p className="text-xs text-muted-foreground">{list.length} {list.length === 1 ? "article" : "articles"}</p>
                    </button>
                  );
                })}
              </div>
            )}

            {isMod && welcomeDraft && (
              <div className="mt-6 rounded-2xl border border-border bg-surface-2/40 p-6 max-w-2xl">
                <h3 className="font-display text-lg font-bold mb-1">Edit welcome message</h3>
                <p className="text-sm text-muted-foreground mb-4">Shown in the hero above.</p>
                <div className="space-y-3">
                  <Label>Title</Label>
                  <Input value={welcomeDraft.title} onChange={(e) => setWelcomeDraft({ ...welcomeDraft, title: e.target.value })} />
                  <Label>Body</Label>
                  <Textarea rows={4} value={welcomeDraft.body} onChange={(e) => setWelcomeDraft({ ...welcomeDraft, body: e.target.value })} />
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <Button variant="outline" onClick={() => setWelcomeDraft(null)}>Cancel</Button>
                  <Button onClick={saveWelcome} disabled={savingWelcome} className="gap-1.5">
                    {savingWelcome ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* GUIDES */}
          <TabsContent value="guides" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
              <aside className="rounded-2xl border border-border bg-surface-2/40 p-3 h-fit">
                <div className="flex items-center justify-between px-2 pb-2">
                  <h3 className="font-display font-semibold text-sm">Categories</h3>
                  {isMod && (
                    <button onClick={openNewCategory} className="text-xs text-primary hover:underline inline-flex items-center gap-1"><FolderPlus className="size-3.5" /> New</button>
                  )}
                </div>
                <div className="space-y-1">
                  {categories.map((c) => {
                    const active = c.id === activeCat;
                    const n = counts[c.id] ?? 0;
                    return (
                      <div
                        key={c.id}
                        draggable={isMod}
                        onDragStart={() => { dragCatId.current = c.id; }}
                        onDragOver={(e) => { if (isMod) e.preventDefault(); }}
                        onDrop={(e) => { if (!isMod) return; e.preventDefault(); if (dragCatId.current) reorderCategories(dragCatId.current, c.id); dragCatId.current = null; }}
                        className={cn("group flex items-center gap-1 rounded-lg", active ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
                      >
                        {isMod && <GripVertical className="size-3.5 opacity-40 group-hover:opacity-80 cursor-grab shrink-0 ml-1" />}
                        <button onClick={() => setActiveCat(c.id)} className="flex-1 flex items-center justify-between px-2 py-2 text-sm text-left min-w-0">
                          <span className="truncate">{c.name}</span>
                          {n > 0 && <span className={cn("text-xs px-1.5 py-0.5 rounded-full", active ? "bg-white/20" : "bg-muted")}>{n}</span>}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </aside>

              <section>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search articles…"
                      className="pl-9"
                    />
                  </div>
                  {isMod && activeCategory && (
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" onClick={() => { setEditingCat(activeCategory); setShowCatEditor(true); }}>
                        <Pencil className="size-3.5 mr-1" /> Edit category
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => deleteCategory(activeCategory.id)} className="text-destructive hover:text-destructive">
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  )}
                </div>

                {activeCategory && !search && (
                  <h2 className="font-display text-2xl font-bold mb-4">{activeCategory.name}</h2>
                )}

                {loading ? (
                  <div className="py-16 grid place-items-center text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
                ) : filtered.length === 0 ? (
                  <EmptyState text={search ? "No articles match your search." : "No articles in this category yet."} cta={isMod ? { label: "Add article", onClick: openNewArticle } : undefined} />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {filtered.map((a) => {
                      const stats = ratingStats[a.id];
                      const mine = myRatingFor(a.id);
                      return (
                        <article
                          key={a.id}
                          draggable={isMod}
                          onDragStart={() => { dragArtId.current = a.id; }}
                          onDragOver={(e) => { if (isMod) e.preventDefault(); }}
                          onDrop={(e) => { if (!isMod) return; e.preventDefault(); if (dragArtId.current) reorderArticles(dragArtId.current, a.id); dragArtId.current = null; }}
                          className="rounded-2xl border border-border bg-surface-2/40 overflow-hidden flex flex-col group hover:border-primary/50 hover:shadow-glow transition-all"
                        >
                          {a.image_url && <img src={a.image_url} alt="" className="h-36 w-full object-cover" />}
                          <div className="p-4 flex-1 flex flex-col">
                            <div className="flex items-center gap-2 mb-1.5 text-[11px]">
                              {a.badge && <span className="px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">{a.badge}</span>}
                              {!a.published && <span className="px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border inline-flex items-center gap-1"><EyeOff className="size-3" /> Draft</span>}
                            </div>
                            <h3 className="font-display font-bold leading-tight mb-1">{a.title}</h3>
                            {a.excerpt && <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{a.excerpt}</p>}

                            <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                              <div className="flex items-center gap-1.5">
                                <StarRating value={Math.round(stats?.avg ?? 0)} readOnly size={14} />
                                <span className="text-muted-foreground">
                                  {stats ? `${stats.avg.toFixed(1)} (${stats.count})` : "No ratings"}
                                </span>
                              </div>
                              <div className="flex items-center gap-1" title="Your rating">
                                <StarRating value={mine} onChange={(n) => rateArticle(a.id, n)} size={14} />
                              </div>
                            </div>

                            <div className="mt-3 flex items-center justify-between pt-2 border-t border-border">
                              <button onClick={() => setReading(a)} className="text-sm font-medium text-primary inline-flex items-center gap-1 hover:underline">
                                Read <ChevronRight className="size-3.5" />
                              </button>
                              {isMod && (
                                <div className="flex gap-0.5 items-center">
                                  <GripVertical className="size-3.5 text-muted-foreground cursor-grab self-center" />
                                  <button onClick={() => setEditing(a)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"><Pencil className="size-3.5" /></button>
                                  <button onClick={() => deleteArticle(a.id)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive"><Trash2 className="size-3.5" /></button>
                                </div>
                              )}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </TabsContent>

          {/* CATEGORIES admin */}
          {isMod && (
            <TabsContent value="categories" className="mt-0">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-xl font-bold">Manage categories</h2>
                <Button onClick={openNewCategory} className="gap-1.5"><FolderPlus className="size-4" /> New category</Button>
              </div>
              <div className="rounded-2xl border border-border bg-surface-2/40 divide-y divide-border">
                {categories.map((c) => (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={() => { dragCatId.current = c.id; }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); if (dragCatId.current) reorderCategories(dragCatId.current, c.id); dragCatId.current = null; }}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <GripVertical className="size-4 text-muted-foreground cursor-grab" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">/{c.slug} · {counts[c.id] ?? 0} articles</div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => { setEditingCat(c); setShowCatEditor(true); }}><Pencil className="size-3.5" /></Button>
                    <Button variant="outline" size="sm" onClick={() => deleteCategory(c.id)} className="text-destructive hover:text-destructive"><Trash2 className="size-3.5" /></Button>
                  </div>
                ))}
                {categories.length === 0 && <div className="px-4 py-8 text-center text-sm text-muted-foreground">No categories yet.</div>}
              </div>
            </TabsContent>
          )}

        </Tabs>
      </div>

      {editing && <ArticleEditor editing={editing} setEditing={setEditing} categories={categories} onSave={saveArticle} />}

      <Dialog open={showCatEditor} onOpenChange={(o) => { if (!o) { setShowCatEditor(false); setEditingCat(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingCat?.id ? "Edit category" : "New category"}</DialogTitle></DialogHeader>
          {editingCat && (
            <div className="space-y-3">
              <Label>Name</Label>
              <Input value={editingCat.name} onChange={(e) => setEditingCat({ ...editingCat, name: e.target.value })} />
              <Label>Slug (optional)</Label>
              <Input value={editingCat.slug} placeholder="auto" onChange={(e) => setEditingCat({ ...editingCat, slug: e.target.value })} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCatEditor(false); setEditingCat(null); }}>Cancel</Button>
            <Button onClick={saveCategory}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function EmptyState({ text, cta }: { text: string; cta?: { label: string; onClick: () => void } }) {
  return (
    <div className="rounded-2xl border border-dashed border-border p-12 text-center">
      <p className="text-muted-foreground mb-4">{text}</p>
      {cta && <Button onClick={cta.onClick}><Plus className="size-4 mr-1" /> {cta.label}</Button>}
    </div>
  );
}

function ArticleEditor({
  editing, setEditing, categories, onSave,
}: {
  editing: Article;
  setEditing: (a: Article | null) => void;
  categories: Category[];
  onSave: () => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => { if (!o) setEditing(null); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing.id ? "Edit article" : "New article"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <select
                value={editing.category_id}
                onChange={(e) => setEditing({ ...editing, category_id: e.target.value })}
                className="w-full h-10 px-3 rounded-md border border-border bg-background text-sm"
              >
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <Label>Badge (optional)</Label>
              <Input value={editing.badge ?? ""} onChange={(e) => setEditing({ ...editing, badge: e.target.value })} placeholder="New, Updated…" />
            </div>
          </div>
          <Label>Title</Label>
          <Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
          <Label>Slug (optional)</Label>
          <Input value={editing.slug} placeholder="auto" onChange={(e) => setEditing({ ...editing, slug: e.target.value })} />
          <Label>Excerpt</Label>
          <Textarea rows={2} value={editing.excerpt ?? ""} onChange={(e) => setEditing({ ...editing, excerpt: e.target.value })} />
          <Label>Body</Label>
          <HtmlEditor
            value={editing.body ?? ""}
            onChange={(html) => setEditing({ ...editing, body: html })}
            placeholder="Write the article. Use the YouTube button to embed a video."
          />
          <Label>Cover image URL (optional)</Label>
          <Input value={editing.image_url ?? ""} onChange={(e) => setEditing({ ...editing, image_url: e.target.value })} />
          <label className="flex items-center gap-2 text-sm pt-2">
            <input type="checkbox" checked={editing.published} onChange={(e) => setEditing({ ...editing, published: e.target.checked })} />
            {editing.published ? <span className="inline-flex items-center gap-1"><Eye className="size-3.5" /> Published</span> : <span className="inline-flex items-center gap-1"><EyeOff className="size-3.5" /> Draft</span>}
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setEditing(null)}><X className="size-4 mr-1" /> Cancel</Button>
          <Button onClick={onSave}><Save className="size-4 mr-1" /> Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
