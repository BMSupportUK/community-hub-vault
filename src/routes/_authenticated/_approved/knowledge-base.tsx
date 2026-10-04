import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Search, X, Pencil, Trash2, GripVertical, BookOpen, ChevronRight, ArrowRight,
  ArrowLeft, Save, Loader2, FolderPlus, Eye, EyeOff, Star, Home, UserRound,
  LifeBuoy, Smartphone, Settings, Zap, PlayCircle, LayoutGrid,
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
import { HeaderImageUpload } from "@/components/ui/header-image-upload";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import kbHero from "@/assets/knowledge-base-hero.jpg";

export const Route = createFileRoute("/_authenticated/_approved/knowledge-base")({
  head: () => ({
    meta: [
      { title: "Knowledge Base — BM Support" },
      { name: "description", content: "BM Support guides, answers and help articles." },
      { property: "og:title", content: "Knowledge Base — BM Support" },
      { property: "og:description", content: "BM Support guides, answers and help articles." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
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
    try { return sessionStorage.getItem(KB_TAB_KEY) || "guides"; } catch { return "welcome"; }
  });
  const [welcome, setWelcome] = useState<Welcome>({ title: "", body: "" });
  const [welcomeDraft, setWelcomeDraft] = useState<Welcome | null>(null);
  const [savingWelcome, setSavingWelcome] = useState(false);
  const [activeCat, setActiveCat] = useState<string | null>(() => {
    try { return sessionStorage.getItem(KB_CAT_KEY); } catch { return null; }
  });
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);
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
  // Remembers the article card the user opened so save/cancel/back returns there.
  const focusArticleId = useRef<string | null>(null);
  const scrollBackToArticle = () => {
    const id = focusArticleId.current;
    focusArticleId.current = null;
    if (!id) return;
    window.setTimeout(() => {
      document
        .querySelector(`[data-article-id="${id}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 80);
  };
  const closeEditor = () => {
    setEditing(null);
    scrollBackToArticle();
  };

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
    return articles
      .filter((a) => {
        if (!q && activeCat && a.category_id !== activeCat) return false;
        if (!isMod && !a.published) return false;
        if (!q) return true;
        return (
          a.title.toLowerCase().includes(q) ||
          (a.excerpt ?? "").toLowerCase().includes(q) ||
          (a.body ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.title.localeCompare(b.title));
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
    scrollBackToArticle();
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
    const inCat = articles.filter((a) => a.category_id === activeCat).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.title.localeCompare(b.title));
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

  // Arrow buttons: move a guide one place earlier/later; saved for everyone.
  const moveArticle = (id: string, dir: -1 | 1) => {
    if (!activeCat) return;
    const inCat = articles.filter((a) => a.category_id === activeCat).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.title.localeCompare(b.title));
    const i = inCat.findIndex((a) => a.id === id);
    const target = inCat[i + dir];
    if (i < 0 || !target) return;
    void reorderArticles(id, target.id);
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
    const categoryName = categories.find((c) => c.id === reading.category_id)?.name ?? "Knowledge Base";
    const ratingPanel = (
      <aside className="border-t border-border py-6 xl:sticky xl:top-6 xl:self-start xl:rounded-lg xl:border xl:bg-card xl:p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Was this guide helpful?</p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <StarRating value={mine} onChange={(n) => rateArticle(reading.id, n)} size={24} />
          <span className="text-xs text-muted-foreground">
            {stats ? `${stats.avg.toFixed(1)} · ${stats.count} rating${stats.count === 1 ? "" : "s"}` : "Be the first"}
          </span>
        </div>
      </aside>
    );
    return (
      <main className="min-h-0 flex-1 overflow-y-auto bg-background pb-24 md:pb-8">
        <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-8 lg:py-8">
          <Button type="button" variant="ghost" onClick={() => { setReading(null); scrollBackToArticle(); }} className="mb-5 -ml-3 gap-1.5 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Back to guides
          </Button>
          <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1fr)_280px] xl:gap-10">
            <div className="min-w-0">
              <div className="mb-6 border-b border-border pb-6">
                <span className="text-xs font-semibold uppercase tracking-widest text-primary">{categoryName}</span>
                <h1 className="mt-2 max-w-4xl font-display text-3xl font-bold leading-tight sm:text-4xl">{reading.title}</h1>
                <div className="mt-3 flex flex-wrap gap-2">
                  {reading.badge && <span className="rounded-md border border-primary/30 bg-primary/15 px-2 py-1 text-xs font-semibold text-primary">{reading.badge}</span>}
                  {!reading.published && <span className="rounded-md border border-border bg-muted px-2 py-1 text-xs text-muted-foreground">Draft</span>}
                </div>
                {reading.excerpt && <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground sm:text-lg">{reading.excerpt}</p>}
              </div>
              {reading.body ? (
                <article className="prose prose-invert max-w-none text-foreground/90 leading-relaxed [&_.video-embed]:relative [&_.video-embed]:aspect-video [&_.video-embed]:h-auto [&_.video-embed]:w-full [&_.video-embed]:overflow-hidden [&_.video-embed]:rounded-lg [&_.video-embed]:[padding-bottom:0!important] [&_.video-embed_iframe]:absolute [&_.video-embed_iframe]:inset-0 [&_.video-embed_iframe]:size-full [&_iframe]:max-w-full [&_video]:block [&_video]:aspect-video [&_video]:h-auto [&_video]:max-h-none [&_video]:w-full [&_video]:max-w-full [&_video]:rounded-lg [&_video]:bg-card [&_video]:object-contain"
                  ref={(el) => {
                    if (!el) return;
                    const key = `${reading.id}:${reading.body}`;
                    if (el.dataset.kbKey === key) return;
                    el.dataset.kbKey = key;
                    el.innerHTML = sanitizeRichHtml(reading.body ?? "");
                  }}
                />
              ) : <p className="text-muted-foreground">No content yet.</p>}
              <div className="mt-8 xl:hidden">{ratingPanel}</div>
              {isMod && (
                <div className="mt-8 flex gap-2 border-t border-border pt-4">
                  <Button variant="secondary" onClick={() => { focusArticleId.current = reading.id; setEditing(reading); setReading(null); }}><Pencil className="mr-1.5 size-4" /> Edit</Button>
                  <Button variant="destructive" onClick={() => deleteArticle(reading.id)}><Trash2 className="mr-1.5 size-4" /> Delete</Button>
                </div>
              )}
            </div>
            <div className="hidden xl:block">{ratingPanel}</div>
          </div>
        </div>
        <KnowledgeBottomNav onGuides={() => setReading(null)} onSearch={() => { setReading(null); window.setTimeout(() => searchRef.current?.focus(), 80); }} />
        {editing && <ArticleEditor editing={editing} setEditing={setEditing} onClose={closeEditor} categories={categories} onSave={saveArticle} userId={user?.id ?? null} />}
      </main>
    );
  }

  const featured = filtered[0] ?? null;
  const remaining = filtered.slice(1);
  const categoryTones = [
    "bg-primary/20 text-primary border-primary/35",
    "bg-success/15 text-success border-success/30",
    "bg-warning/15 text-warning border-warning/30",
    "bg-accent/20 text-accent border-accent/35",
  ];
  const categoryIcons = [LifeBuoy, Smartphone, Settings, Zap];
  const readTime = (article: Article) => {
    const words = `${article.excerpt ?? ""} ${(article.body ?? "").replace(/<[^>]+>/g, " ")}`.trim().split(/\s+/).filter(Boolean).length;
    return `${Math.max(2, Math.ceil(words / 180))} min read`;
  };
  const openArticle = (article: Article) => {
    focusArticleId.current = article.id;
    setReading(article);
  };

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-background pb-24 md:pb-8">
      <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-8 lg:py-8">
        <header className="flex items-center justify-between gap-3 border-b border-border pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-soft">
              <BookOpen className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-display text-base font-bold">BM Support</p>
              <p className="text-xs text-muted-foreground">Knowledge Base</p>
            </div>
          </div>
          <Link to="/profile" aria-label="Open profile" className="grid size-10 shrink-0 place-items-center rounded-full border border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground">
            <UserRound className="size-5" />
          </Link>
        </header>

        <section className="pt-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-display text-3xl font-bold leading-tight sm:text-4xl">How can we help?</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">{welcome.body || "Find clear answers, setup guides and fixes."}</p>
            </div>
            {isMod && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setWelcomeDraft(welcome)}><Pencil className="mr-1.5 size-4" /> Edit intro</Button>
                <Button size="sm" onClick={openNewArticle}><Plus className="mr-1.5 size-4" /> New article</Button>
              </div>
            )}
          </div>
          <div className="relative mt-5">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search articles..." className="h-12 rounded-xl border-border bg-card pl-12 text-base shadow-soft" />
            {search && <Button type="button" size="icon" variant="ghost" aria-label="Clear search" onClick={() => setSearch("")} className="absolute right-1.5 top-1/2 size-9 -translate-y-1/2"><X className="size-4" /></Button>}
          </div>
        </section>

        {isMod && (
          <div className="mt-5 flex gap-2 border-b border-border pb-4">
            <Button size="sm" variant={tab === "guides" ? "default" : "ghost"} onClick={() => setTab("guides")}><BookOpen className="mr-1.5 size-4" /> Guides</Button>
            <Button size="sm" variant={tab === "categories" ? "default" : "ghost"} onClick={() => setTab("categories")}><LayoutGrid className="mr-1.5 size-4" /> Categories</Button>
          </div>
        )}

        {isMod && welcomeDraft && (
          <section className="mt-5 border-b border-border pb-5">
            <h2 className="font-display text-lg font-bold">Edit introduction</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Input value={welcomeDraft.title} onChange={(e) => setWelcomeDraft({ ...welcomeDraft, title: e.target.value })} placeholder="Title" />
              <Input value={welcomeDraft.body} onChange={(e) => setWelcomeDraft({ ...welcomeDraft, body: e.target.value })} placeholder="Introduction" />
            </div>
            <div className="mt-3 flex justify-end gap-2"><Button variant="ghost" onClick={() => setWelcomeDraft(null)}>Cancel</Button><Button onClick={saveWelcome} disabled={savingWelcome}>{savingWelcome ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Save className="mr-1.5 size-4" />} Save</Button></div>
          </section>
        )}

        {(!isMod || tab === "guides") ? (
          <>
            <section className="mt-7">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-lg font-bold">Categories</h2>
                {isMod && <Button size="sm" variant="ghost" onClick={openNewCategory}><FolderPlus className="mr-1.5 size-4" /> New</Button>}
              </div>
              <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0">
                {categories.map((c, index) => {
                  const Icon = categoryIcons[index % categoryIcons.length];
                  const active = c.id === activeCat && !search;
                  return (
                    <Button key={c.id} variant="ghost" onClick={() => { setSearch(""); setActiveCat(c.id); }} className={cn("h-32 w-32 shrink-0 snap-start flex-col items-start justify-between rounded-xl border p-4 text-left sm:w-auto", categoryTones[index % categoryTones.length], active && "ring-2 ring-primary ring-offset-2 ring-offset-background")}>
                      <span className="grid size-10 place-items-center rounded-lg bg-background/35"><Icon className="size-5" /></span>
                      <span className="w-full"><span className="block truncate text-sm font-bold text-foreground">{c.name}</span><span className="mt-0.5 block text-xs opacity-75">{counts[c.id] ?? 0} articles</span></span>
                    </Button>
                  );
                })}
              </div>
            </section>

            <section className="mt-7">
              <div className="mb-4 flex items-end justify-between gap-3">
                <div><h2 className="font-display text-xl font-bold">{search ? "Search results" : "Featured guides"}</h2><p className="mt-1 text-xs text-muted-foreground">{activeCategory?.name ?? "All knowledge"}</p></div>
                <span className="text-xs font-medium text-primary">{filtered.length} result{filtered.length === 1 ? "" : "s"}</span>
              </div>
              {loading ? <div className="grid min-h-48 place-items-center text-muted-foreground"><Loader2 className="size-6 animate-spin" /></div> : !featured ? (
                <EmptyState text={search ? "No articles match your search." : "No articles in this category yet."} cta={isMod ? { label: "Add article", onClick: openNewArticle } : undefined} />
              ) : (
                <div className="space-y-3">
                  <article data-article-id={featured.id} className="group overflow-hidden rounded-xl border border-border bg-card shadow-soft sm:grid sm:grid-cols-[minmax(0,1.2fr)_minmax(220px,.8fr)]">
                    <div className="relative min-h-52 overflow-hidden bg-surface-2">
                      {featured.image_url ? <img src={featured.image_url} alt="" className="absolute inset-0 size-full object-cover" /> : <img src={kbHero} alt="" className="absolute inset-0 size-full object-cover opacity-70" />}
                      <div className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent" />
                      <div className="absolute inset-x-0 bottom-0 p-5">
                        <span className="rounded-md bg-primary px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-primary-foreground">Featured</span>
                        <h3 className="mt-3 max-w-xl font-display text-2xl font-bold leading-tight">{featured.title}</h3>
                      </div>
                    </div>
                    <div className="flex flex-col justify-between p-5">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-primary">{categories.find((c) => c.id === featured.category_id)?.name}</p>
                        <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-muted-foreground">{featured.excerpt || "Open this guide for clear step-by-step help."}</p>
                      </div>
                      <Button onClick={() => openArticle(featured)} className="mt-5 w-full justify-between">Read guide <ChevronRight className="size-4" /></Button>
                    </div>
                  </article>

                  <div className="grid gap-3 md:grid-cols-2">
                    {remaining.map((a) => {
                      const hasVideo = /<(?:video|iframe)\b/i.test(a.body ?? "");
                      const stats = ratingStats[a.id];
                      return (
                        <article key={a.id} data-article-id={a.id} draggable={isMod} onDragStart={() => { dragArtId.current = a.id; }} onDragOver={(e) => { if (isMod) e.preventDefault(); }} onDrop={(e) => { if (!isMod) return; e.preventDefault(); if (dragArtId.current) reorderArticles(dragArtId.current, a.id); dragArtId.current = null; }} className="group flex min-h-32 gap-3 rounded-xl border border-border bg-card p-3 hover:border-primary/45">
                          <div className="relative size-24 shrink-0 overflow-hidden rounded-lg bg-surface-2 sm:size-28">
                            {a.image_url ? <img src={a.image_url} alt="" className="size-full object-cover" /> : <div className="grid size-full place-items-center text-primary">{hasVideo ? <PlayCircle className="size-9" /> : <BookOpen className="size-9" />}</div>}
                          </div>
                          <div className="flex min-w-0 flex-1 flex-col py-1">
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground"><span>{readTime(a)}</span>{stats && <><span>•</span><span className="inline-flex items-center gap-1"><Star className="size-3 fill-warning text-warning" /> {stats.avg.toFixed(1)}</span></>}{!a.published && <span className="rounded bg-muted px-1.5 py-0.5">Draft</span>}</div>
                            <h3 className="mt-1 line-clamp-2 font-display font-bold leading-snug">{a.title}</h3>
                            <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                              <Button variant="link" onClick={() => openArticle(a)} className="h-auto p-0 text-primary">{hasVideo ? "Watch guide" : "Read guide"}<ChevronRight className="ml-1 size-3.5" /></Button>
                              {isMod && <div className="flex gap-1"><Button size="icon" variant="ghost" aria-label="Edit article" onClick={() => { focusArticleId.current = a.id; setEditing(a); }} className="size-8"><Pencil className="size-3.5" /></Button><Button size="icon" variant="ghost" aria-label="Delete article" onClick={() => deleteArticle(a.id)} className="size-8 text-destructive"><Trash2 className="size-3.5" /></Button></div>}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          </>
        ) : (
          <section className="mt-7">
            <div className="mb-4 flex items-center justify-between"><h2 className="font-display text-xl font-bold">Manage categories</h2><Button onClick={openNewCategory}><FolderPlus className="mr-1.5 size-4" /> New category</Button></div>
            <div className="divide-y divide-border border-y border-border">
              {categories.map((c) => <div key={c.id} draggable onDragStart={() => { dragCatId.current = c.id; }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (dragCatId.current) reorderCategories(dragCatId.current, c.id); dragCatId.current = null; }} className="flex items-center gap-3 py-3"><GripVertical className="size-4 cursor-grab text-muted-foreground" /><div className="min-w-0 flex-1"><p className="font-medium">{c.name}</p><p className="text-xs text-muted-foreground">{counts[c.id] ?? 0} articles</p></div><Button size="icon" variant="ghost" aria-label="Edit category" onClick={() => { setEditingCat(c); setShowCatEditor(true); }}><Pencil className="size-4" /></Button><Button size="icon" variant="ghost" aria-label="Delete category" onClick={() => deleteCategory(c.id)} className="text-destructive"><Trash2 className="size-4" /></Button></div>)}
            </div>
          </section>
        )}
      </div>

      <KnowledgeBottomNav onGuides={() => { setTab("guides"); window.scrollTo({ top: 0, behavior: "smooth" }); }} onSearch={() => searchRef.current?.focus()} />
      {editing && <ArticleEditor editing={editing} setEditing={setEditing} onClose={closeEditor} categories={categories} onSave={saveArticle} userId={user?.id ?? null} />}
      <Dialog open={showCatEditor} onOpenChange={(o) => { if (!o) { setShowCatEditor(false); setEditingCat(null); } }}>
        <DialogContent><DialogHeader><DialogTitle>{editingCat?.id ? "Edit category" : "New category"}</DialogTitle></DialogHeader>{editingCat && <div className="space-y-3"><Label>Name</Label><Input value={editingCat.name} onChange={(e) => setEditingCat({ ...editingCat, name: e.target.value })} /><Label>Slug (optional)</Label><Input value={editingCat.slug} placeholder="auto" onChange={(e) => setEditingCat({ ...editingCat, slug: e.target.value })} /></div>}<DialogFooter><Button variant="outline" onClick={() => { setShowCatEditor(false); setEditingCat(null); }}>Cancel</Button><Button onClick={saveCategory}>Save</Button></DialogFooter>
      </Dialog>
    </main>
  );
}

function KnowledgeBottomNav({ onGuides, onSearch }: { onGuides: () => void; onSearch: () => void }) {
  return (
    <nav aria-label="Knowledge Base navigation" className="fixed inset-x-0 bottom-0 z-40 grid h-18 grid-cols-4 border-t border-border bg-card/95 px-2 pb-[env(safe-area-inset-bottom)] shadow-soft backdrop-blur md:hidden">
      <Link to="/home" className="flex flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground"><Home className="size-5" />Home</Link>
      <Button variant="ghost" onClick={onGuides} className="h-full flex-col gap-1 rounded-none text-[11px] text-primary"><BookOpen className="size-5" />Guides</Button>
      <Button variant="ghost" onClick={onSearch} className="h-full flex-col gap-1 rounded-none text-[11px] text-muted-foreground"><Search className="size-5" />Search</Button>
      <Link to="/profile" className="flex flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground"><UserRound className="size-5" />Profile</Link>
    </nav>
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
  editing, setEditing, onClose, categories, onSave, userId,
}: {
  editing: Article;
  setEditing: (a: Article | null) => void;
  onClose: () => void;
  categories: Category[];
  onSave: () => void;
  userId: string | null;
}) {
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
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
            placeholder="Write the article. Use the YouTube button to embed a video, or the film icon to upload one."
            videoUpload={{ userId, folder: "articles" }}
          />
          <Label>Header image (optional)</Label>
          <HeaderImageUpload
            value={editing.image_url}
            onChange={(url) => setEditing({ ...editing, image_url: url })}
            folder="knowledge-base"
          />
          <label className="flex items-center gap-2 text-sm pt-2">
            <input type="checkbox" checked={editing.published} onChange={(e) => setEditing({ ...editing, published: e.target.checked })} />
            {editing.published ? <span className="inline-flex items-center gap-1"><Eye className="size-3.5" /> Published</span> : <span className="inline-flex items-center gap-1"><EyeOff className="size-3.5" /> Draft</span>}
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}><X className="size-4 mr-1" /> Cancel</Button>
          <Button onClick={onSave}><Save className="size-4 mr-1" /> Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
