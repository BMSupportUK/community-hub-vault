import { createFileRoute, useNavigate, Outlet, useChildMatches } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Pencil, Trash2, ImageIcon, GripVertical, X, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_approved/sports-guides")({
  component: SportsGuidesRoute,
  validateSearch: (search: Record<string, unknown>): { cat?: string } => ({
    cat: typeof search.cat === "string" ? search.cat : undefined,
  }),
});

function SportsGuidesRoute() {
  const childMatches = useChildMatches();
  if (childMatches.length > 0) return <Outlet />;
  return <SportsGuidesPage />;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, "gi"));
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === q.toLowerCase() ? (
          <mark key={i} className="bg-yellow-300/90 text-black rounded-sm px-0.5">{p}</mark>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

type Category = { id: string; name: string; slug: string; sort_order: number };
type Blog = {
  id: string;
  category_id: string;
  title: string;
  excerpt: string | null;
  body: string | null;
  image_url: string | null;
  badge: string | null;
  published: boolean;
  created_at: string;
  sort_order: number;
  updated_at?: string;
};

function SportsGuidesPage() {
  const { isMod, user, hasAny } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { cat: catFromUrl } = Route.useSearch();
  const canManageCategories = hasAny(["admin", "management", "staff"]);
  const [tab, setTab] = useState<string>(() => {
    try { return sessionStorage.getItem("sports-guides-active-tab") || "welcome"; } catch { return "welcome"; }
  });
  const [activeCat, setActiveCat] = useState<string | null>(() => {
    try { return sessionStorage.getItem("sports-guides-active-cat"); } catch { return null; }
  });
  const [search, setSearch] = useState("");
  const [resultsOpen, setResultsOpen] = useState(true);
  const [newCatName, setNewCatName] = useState("");
  const [addingCat, setAddingCat] = useState(false);
  const dragCatId = useRef<string | null>(null);
  const dragBlogId = useRef<string | null>(null);

  // Persist UI state across screen swaps (route remounts).
  useEffect(() => { try { sessionStorage.setItem("sports-guides-active-tab", tab); } catch { /* ignore */ } }, [tab]);
  useEffect(() => {
    try {
      if (activeCat) sessionStorage.setItem("sports-guides-active-cat", activeCat);
      else sessionStorage.removeItem("sports-guides-active-cat");
    } catch { /* ignore */ }
  }, [activeCat]);

  const queryKey = ["sports-guides-data", user?.id ?? "anon"] as const;
  const dataQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const [{ data: cats }, { data: bs }, { data: rs }, { data: prof }] = await Promise.all([
        supabase.from("sports_categories").select("*").order("sort_order"),
        supabase.from("sports_blogs").select("*").order("sort_order").order("created_at", { ascending: false }),
        user?.id
          ? supabase.from("sports_blog_reads").select("blog_id, read_at").eq("user_id", user.id)
          : Promise.resolve({ data: [] as { blog_id: string; read_at: string }[] }),
        user?.id
          ? supabase.from("profiles").select("sports_blogs_baseline_at").eq("id", user.id).maybeSingle()
          : Promise.resolve({ data: null as { sports_blogs_baseline_at: string | null } | null }),
      ]);
      const map: Record<string, string> = {};
      for (const r of (rs ?? []) as { blog_id: string; read_at: string }[]) map[r.blog_id] = r.read_at;
      let baseline = (prof as { sports_blogs_baseline_at: string | null } | null)?.sports_blogs_baseline_at ?? null;
      if (user?.id && !baseline) {
        baseline = new Date().toISOString();
        const { error } = await supabase
          .from("profiles")
          .update({ sports_blogs_baseline_at: baseline })
          .eq("id", user.id);
        if (error) baseline = null;
      }
      return {
        categories: (cats ?? []) as Category[],
        blogs: (bs ?? []) as Blog[],
        reads: map,
        baselineAt: baseline,
      };
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const categories = dataQuery.data?.categories ?? [];
  const blogs = dataQuery.data?.blogs ?? [];
  const reads = dataQuery.data?.reads ?? {};
  const baselineAt = dataQuery.data?.baselineAt ?? null;
  const load = () => queryClient.invalidateQueries({ queryKey });

  useEffect(() => {
    if (categories.length) setActiveCat((cur) => cur ?? catFromUrl ?? categories[0].id);
  }, [categories, catFromUrl]);

  // If we arrived back here from new/edit/read, jump straight to the category.
  useEffect(() => {
    if (catFromUrl) {
      setActiveCat(catFromUrl);
      setTab("guides");
    }
  }, [catFromUrl]);

  const isUnread = (b: Blog) => {
    const upd = new Date(b.updated_at ?? b.created_at).getTime();
    // Anything from before the user's baseline is considered already-seen.
    if (baselineAt && upd <= new Date(baselineAt).getTime()) return false;
    const r = reads[b.id];
    if (!r) return true;
    return new Date(r).getTime() < upd;
  };

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const b of blogs) m[b.category_id] = (m[b.category_id] ?? 0) + 1;
    return m;
  }, [blogs]);

  const unreadCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const b of blogs) if (isUnread(b)) m[b.category_id] = (m[b.category_id] ?? 0) + 1;
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blogs, reads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return blogs.filter((b) => {
      if (!q && activeCat && b.category_id !== activeCat) return false;
      if (!q) return true;
      return (
        b.title.toLowerCase().includes(q) ||
        (b.excerpt ?? "").toLowerCase().includes(q) ||
        (b.body ?? "").toLowerCase().includes(q)
      );
    });
  }, [blogs, activeCat, search]);

  // Global search results (across ALL categories) shown in the right panel,
  // Discord-style. Includes a snippet of where the term was matched.
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [] as { blog: Blog; snippet: string }[];
    const out: { blog: Blog; snippet: string }[] = [];
    for (const b of blogs) {
      const title = b.title ?? "";
      const excerpt = b.excerpt ?? "";
      const bodyText = (b.body ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const haystacks = [title, excerpt, bodyText];
      let snippet = "";
      for (const h of haystacks) {
        const i = h.toLowerCase().indexOf(q);
        if (i >= 0) {
          const start = Math.max(0, i - 40);
          const end = Math.min(h.length, i + q.length + 60);
          snippet = (start > 0 ? "…" : "") + h.slice(start, end) + (end < h.length ? "…" : "");
          break;
        }
      }
      if (snippet) out.push({ blog: b, snippet });
    }
    return out;
  }, [blogs, search]);

  const activeCategory = categories.find((c) => c.id === activeCat);

  const openNew = () =>
    navigate({ to: "/sports-guides/new", search: { cat: activeCat ?? undefined } });
  const openEdit = (id: string) =>
    navigate({
      to: "/sports-guides/$id/edit",
      params: { id },
      search: { cat: activeCat ?? undefined },
    });

  const deleteBlog = async (id: string) => {
    if (!confirm("Delete this blog?")) return;
    const { error } = await supabase.from("sports_blogs").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  };

  const addCategory = async () => {
    const name = newCatName.trim();
    if (!name) return;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `cat-${Date.now()}`;
    const nextOrder = (categories[categories.length - 1]?.sort_order ?? 0) + 10;
    const { error } = await supabase.from("sports_categories").insert({ name, slug, sort_order: nextOrder });
    if (error) return toast.error(error.message);
    setNewCatName("");
    setAddingCat(false);
    toast.success("Category added");
    load();
  };

  const deleteCategory = async (id: string) => {
    if ((counts[id] ?? 0) > 0) return toast.error("Move or delete blogs in this category first");
    if (!confirm("Delete this category?")) return;
    const { error } = await supabase.from("sports_categories").delete().eq("id", id);
    if (error) return toast.error(error.message);
    if (activeCat === id) setActiveCat(null);
    toast.success("Category deleted");
    load();
  };

  const reorderCategories = async (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const list = [...categories];
    const fromIdx = list.findIndex((c) => c.id === fromId);
    const toIdx = list.findIndex((c) => c.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    const updated = list.map((c, i) => ({ ...c, sort_order: (i + 1) * 10 }));
    queryClient.setQueryData<typeof dataQuery.data>(queryKey, (prev) => prev ? { ...prev, categories: updated } : prev);
    await Promise.all(
      updated.map((c) => supabase.from("sports_categories").update({ sort_order: c.sort_order }).eq("id", c.id))
    );
  };

  const reorderBlogs = async (fromId: string, toId: string) => {
    if (fromId === toId || !activeCat) return;
    // Reorder only within the active category
    const inCat = blogs.filter((b) => b.category_id === activeCat);
    const others = blogs.filter((b) => b.category_id !== activeCat);
    const fromIdx = inCat.findIndex((b) => b.id === fromId);
    const toIdx = inCat.findIndex((b) => b.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = inCat.splice(fromIdx, 1);
    inCat.splice(toIdx, 0, moved);
    const updated = inCat.map((b, i) => ({ ...b, sort_order: (i + 1) * 10 }));
    queryClient.setQueryData<typeof dataQuery.data>(queryKey, (prev) => prev ? { ...prev, blogs: [...others, ...updated] } : prev);
    await Promise.all(
      updated.map((b) => supabase.from("sports_blogs").update({ sort_order: b.sort_order }).eq("id", b.id))
    );
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-br from-[#1a0b2e] via-[#2d1b4e] to-[#1a0b2e]">
      <header className="px-8 pt-8 pb-6 border-b border-purple-500/30 bg-purple-950/40 backdrop-blur">
        <h1 className="font-display text-3xl font-bold bg-gradient-to-r from-violet-600 via-fuchsia-600 to-blue-600 bg-clip-text text-transparent">Sports Guide</h1>
        <p className="text-purple-200/80 mt-1">Explore guides and news from all major sports</p>
      </header>

      <div className="px-8 py-6">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className={`grid ${canManageCategories ? "grid-cols-3" : "grid-cols-2"} max-w-2xl bg-purple-950/60 border border-purple-500/30`}>
            <TabsTrigger value="welcome" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-fuchsia-600 data-[state=active]:to-purple-600 data-[state=active]:text-white">Welcome</TabsTrigger>
            <TabsTrigger value="guides" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-fuchsia-600 data-[state=active]:to-purple-600 data-[state=active]:text-white">Guides</TabsTrigger>
            {canManageCategories && (
              <TabsTrigger value="categories" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-fuchsia-600 data-[state=active]:to-purple-600 data-[state=active]:text-white">Categories</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="welcome" className="mt-6">
            <div className="rounded-2xl bg-gradient-to-br from-fuchsia-600/30 via-purple-600/30 to-violet-700/30 border border-purple-500/40 p-10 shadow-[0_0_60px_-15px_rgba(168,85,247,0.5)]">
              <h2 className="font-display text-3xl font-bold bg-gradient-to-r from-violet-600 to-blue-600 bg-clip-text text-transparent">Welcome to Sports Guide</h2>
              <p className="mt-3 text-lg text-purple-100/90 max-w-2xl">
                Dive into the world of sports with comprehensive guides, insights, and news from your favorite games.
              </p>
              <p className="mt-4 text-purple-200/70 max-w-2xl">
                Whether you're a fan of football, basketball, soccer, tennis, baseball, hockey, or golf — we've got you covered with expert analysis and up-to-date information.
              </p>
              <Button className="mt-6 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white border-0 shadow-lg shadow-purple-900/50" onClick={() => setTab("guides")}>Browse guides</Button>
            </div>
          </TabsContent>

          <TabsContent value="guides" className="mt-6">
            <div className={`grid grid-cols-1 gap-6 ${search.trim() ? "lg:grid-cols-[280px_1fr_340px]" : "lg:grid-cols-[280px_1fr]"}`}>
              <aside className="rounded-2xl bg-purple-950/50 border border-purple-500/30 p-4 h-fit backdrop-blur">
                <h3 className="font-display font-semibold mb-3 px-2 text-purple-100">Categories</h3>
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
                        onDrop={(e) => {
                          if (!isMod) return;
                          e.preventDefault();
                          if (dragCatId.current) reorderCategories(dragCatId.current, c.id);
                          dragCatId.current = null;
                        }}
                        className={`group flex items-center gap-1 px-1 rounded-lg ${active ? "bg-gradient-to-r from-violet-600 to-blue-600 text-white shadow-md shadow-purple-900/40" : "text-purple-100/80 hover:bg-purple-800/40"}`}
                      >
                        {isMod && (
                          <GripVertical className="size-3.5 opacity-40 group-hover:opacity-80 cursor-grab shrink-0" />
                        )}
                        <button
                          onClick={() => setActiveCat(c.id)}
                          className="flex-1 flex items-center justify-between px-2 py-2 text-sm text-left"
                        >
                          <span className="flex items-center gap-2">
                            {(unreadCounts[c.id] ?? 0) > 0 && (
                              <span className="size-2 rounded-full bg-fuchsia-400 shadow-[0_0_8px_rgba(232,121,249,0.9)]" />
                            )}
                            {c.name}
                          </span>
                          <span className="flex items-center gap-1">
                            {(unreadCounts[c.id] ?? 0) > 0 && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-fuchsia-500 text-white font-semibold">{unreadCounts[c.id]}</span>
                            )}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </aside>

              <section>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-purple-300" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search sports guides..."
                      className="pl-9 bg-purple-950/50 border-purple-500/30 text-purple-50 placeholder:text-purple-300/50 focus-visible:ring-fuchsia-500"
                    />
                  </div>
                  {isMod && (
                    <Button onClick={openNew} className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white border-0">
                      <Plus className="size-4 mr-1" /> Add Blog
                    </Button>
                  )}
                </div>

                {activeCategory && (
                  <h2 className="font-display text-2xl font-bold mb-4 bg-gradient-to-r from-violet-600 to-blue-600 bg-clip-text text-transparent">{activeCategory.name} Guides</h2>
                )}

                {filtered.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-purple-500/40 p-12 text-center text-purple-200/70 bg-purple-950/30">
                    No blogs in this category yet.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {filtered.map((b) => (
                      <article
                        key={b.id}
                        draggable={isMod}
                        onDragStart={() => { dragBlogId.current = b.id; }}
                        onDragOver={(e) => { if (isMod) e.preventDefault(); }}
                        onDrop={(e) => {
                          if (!isMod) return;
                          e.preventDefault();
                          if (dragBlogId.current) reorderBlogs(dragBlogId.current, b.id);
                          dragBlogId.current = null;
                        }}
                        className={`rounded-2xl bg-purple-950/50 border overflow-hidden flex flex-col group hover:shadow-[0_0_30px_-10px_rgba(217,70,239,0.6)] transition-all ${isUnread(b) ? "border-fuchsia-500/70 shadow-[0_0_20px_-10px_rgba(232,121,249,0.8)]" : "border-purple-500/30 hover:border-fuchsia-500/60"}`}
                      >
                        <div className="aspect-[16/10] bg-purple-900/50 relative overflow-hidden">
                          {b.image_url ? (
                            <img src={b.image_url} alt={b.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                          ) : (
                            <div className="w-full h-full grid place-items-center text-purple-300/60">
                              <ImageIcon className="size-10" />
                            </div>
                          )}
                          {isMod && (
                            <div className="absolute top-2 left-2 size-8 rounded-md bg-black/60 backdrop-blur grid place-items-center text-white cursor-grab">
                              <GripVertical className="size-4" />
                            </div>
                          )}
                          {isUnread(b) && (
                            <div className="absolute top-2 right-2 px-2 py-1 rounded-md bg-fuchsia-500 text-white text-[10px] font-bold uppercase tracking-wide shadow-lg">
                              New
                            </div>
                          )}
                        </div>
                        <div className="p-4 flex-1 flex flex-col gap-2">
                          <div className="flex flex-wrap gap-2">
                            <span className="text-xs px-2 py-1 rounded-md bg-fuchsia-500/20 text-fuchsia-200 font-medium border border-fuchsia-500/30">
                              {categories.find((c) => c.id === b.category_id)?.name}
                            </span>
                            {b.badge && (
                              <span className="text-xs px-2 py-1 rounded-md bg-violet-500/20 text-violet-200 font-medium border border-violet-500/30">{b.badge}</span>
                            )}
                          </div>
                          <h3 className="font-display font-semibold text-lg leading-snug text-purple-50 flex items-center gap-2">
                            {isUnread(b) && (
                              <span className="size-2 rounded-full bg-fuchsia-400 shadow-[0_0_8px_rgba(232,121,249,0.9)] shrink-0" title="Unread" />
                            )}
                            <span>{b.title}</span>
                          </h3>
                          {b.excerpt && <p className="text-sm text-purple-200/70 line-clamp-2">{b.excerpt}</p>}
                          <div className="mt-auto pt-3 flex items-center gap-2">
                            <Button size="sm" className="flex-1 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white border-0" onClick={() => navigate({ to: "/sports-guides/read/$id", params: { id: b.id }, search: { cat: b.category_id } })}>Click to Read</Button>
                            <span
                              aria-label={isUnread(b) ? "Unread" : "Read"}
                              title={isUnread(b) ? "Unread" : "Read"}
                              className={
                                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wide border " +
                                (isUnread(b)
                                  ? "border-fuchsia-400/60 bg-fuchsia-500/20 text-fuchsia-100 animate-pulse shadow-[0_0_12px_rgba(232,121,249,0.55)]"
                                  : "border-purple-500/40 bg-purple-900/40 text-purple-200/80")
                              }
                            >
                              <span
                                className={
                                  "size-2 rounded-full " +
                                  (isUnread(b)
                                    ? "bg-fuchsia-400 shadow-[0_0_8px_rgba(232,121,249,0.9)]"
                                    : "bg-purple-400/60")
                                }
                              />
                              {isUnread(b) ? "Unread" : "Read"}
                            </span>
                            {isMod && (
                              <>
                                <Button size="icon" variant="ghost" className="text-purple-200 hover:text-white hover:bg-purple-800/60" onClick={() => openEdit(b.id)}>
                                  <Pencil className="size-4" />
                                </Button>
                                <Button size="icon" variant="ghost" className="text-purple-200 hover:text-white hover:bg-purple-800/60" onClick={() => deleteBlog(b.id)}>
                                  <Trash2 className="size-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              {search.trim() && (
                <aside className="rounded-2xl bg-purple-950/60 border border-purple-500/30 backdrop-blur h-fit lg:sticky lg:top-4 overflow-hidden">
                  <button
                    onClick={() => setResultsOpen((v) => !v)}
                    className="w-full flex items-center justify-between gap-2 px-4 py-3 border-b border-purple-500/30 bg-purple-900/40 text-purple-100 hover:bg-purple-900/60"
                  >
                    <span className="flex items-center gap-2 font-semibold text-sm">
                      {resultsOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      {searchResults.length} Result{searchResults.length === 1 ? "" : "s"}
                    </span>
                    <span
                      role="button"
                      onClick={(e) => { e.stopPropagation(); setSearch(""); }}
                      className="p-1 rounded hover:bg-purple-800/60 text-purple-200"
                      title="Clear search"
                    >
                      <X className="size-4" />
                    </span>
                  </button>
                  {resultsOpen && (
                    <div className="max-h-[70vh] overflow-y-auto divide-y divide-purple-500/20">
                      {searchResults.length === 0 ? (
                        <div className="px-4 py-6 text-sm text-purple-200/70 text-center">No matches</div>
                      ) : (
                        searchResults.map(({ blog, snippet }) => {
                          const cat = categories.find((c) => c.id === blog.category_id);
                          return (
                            <button
                              key={blog.id}
                              onClick={() => navigate({ to: "/sports-guides/read/$id", params: { id: blog.id }, search: { cat: blog.category_id } })}
                              className="w-full text-left px-4 py-3 hover:bg-purple-900/50 transition-colors block"
                            >
                              <div className="text-[10px] uppercase tracking-wider text-fuchsia-300/80 mb-1">
                                {cat?.name ?? "Guide"}
                              </div>
                              <div className="font-semibold text-sm text-purple-50 leading-snug">
                                <Highlight text={blog.title} query={search} />
                              </div>
                              <div className="mt-1 text-xs text-purple-200/80 leading-relaxed">
                                <Highlight text={snippet} query={search} />
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </aside>
              )}
            </div>
          </TabsContent>

          <TabsContent value="categories" className="mt-6">
            {isMod && (
              <div className="mb-4 flex items-center gap-2">
                {addingCat ? (
                  <>
                    <Input
                      autoFocus
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      placeholder="New category name"
                      onKeyDown={(e) => { if (e.key === "Enter") addCategory(); if (e.key === "Escape") { setAddingCat(false); setNewCatName(""); } }}
                      className="max-w-xs bg-purple-950/50 border-purple-500/30 text-purple-50 placeholder:text-purple-300/50 focus-visible:ring-fuchsia-500"
                    />
                    <Button onClick={addCategory} className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white border-0">Add</Button>
                    <Button variant="ghost" className="text-purple-200 hover:text-white hover:bg-purple-800/60" onClick={() => { setAddingCat(false); setNewCatName(""); }}>Cancel</Button>
                  </>
                ) : (
                  <Button onClick={() => setAddingCat(true)} className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white border-0">
                    <Plus className="size-4 mr-1" /> Add Category
                  </Button>
                )}
                <span className="text-xs text-purple-200/60 ml-2">Drag cards to reorder — order is saved for everyone.</span>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {categories.map((c) => (
                <div
                  key={c.id}
                  draggable={isMod}
                  onDragStart={() => { dragCatId.current = c.id; }}
                  onDragOver={(e) => { if (isMod) e.preventDefault(); }}
                  onDrop={(e) => {
                    if (!isMod) return;
                    e.preventDefault();
                    if (dragCatId.current) reorderCategories(dragCatId.current, c.id);
                    dragCatId.current = null;
                  }}
                  className="rounded-2xl bg-purple-950/50 border border-purple-500/30 p-5 hover:border-fuchsia-500/70 hover:shadow-[0_0_30px_-10px_rgba(217,70,239,0.6)] transition relative backdrop-blur"
                >
                  {isMod && (
                    <div className="absolute top-2 right-2 flex items-center gap-1">
                      <GripVertical className="size-4 text-purple-300/70 cursor-grab" />
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteCategory(c.id); }}
                        className="text-purple-300/70 hover:text-destructive p-1 rounded-md"
                        title="Delete category"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  )}
                  <button onClick={() => { setActiveCat(c.id); setTab("guides"); }} className="text-left w-full">
                    <div className="font-display font-semibold text-lg text-purple-50">{c.name}</div>
                    <div className="text-sm text-purple-200/70 mt-1">{counts[c.id] ?? 0} guide{(counts[c.id] ?? 0) === 1 ? "" : "s"}</div>
                  </button>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

    </div>
  );
}
