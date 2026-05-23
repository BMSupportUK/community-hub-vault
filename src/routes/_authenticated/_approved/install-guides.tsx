import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, X, Pencil, Trash2, ImageIcon, GripVertical, FileText, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HeaderImageUpload } from "@/components/ui/header-image-upload";
import { toast } from "sonner";
import installHero from "@/assets/install-guides-bg.jpg";

export const Route = createFileRoute("/_authenticated/_approved/install-guides")({
  component: InstallGuidesPage,
});

const DRAFT_KEY = "install-guide-new-draft";
const IG_TAB_KEY = "install-guides-active-tab";
const IG_CAT_KEY = "install-guides-active-cat";
const IG_EDIT_KEY = "install-guides-editing";
const IG_READ_KEY = "install-guides-reading";
const IG_SHOW_EDITOR_KEY = "install-guides-show-editor";

type Category = { id: string; name: string; slug: string; sort_order: number };
type Blog = {
  id: string;
  category_id: string;
  title: string;
  excerpt: string | null;
  body: string | null;
  image_url: string | null;
  pdf_url: string | null;
  badge: string | null;
  published: boolean;
  created_at: string;
  sort_order: number;
};

function InstallGuidesPage() {
  const { isMod, user, hasAny } = useAuth();
  const queryClient = useQueryClient();
  const canManageCategories = hasAny(["admin", "management", "staff"]);
  const [tab, setTab] = useState<string>(() => {
    try { return sessionStorage.getItem(IG_TAB_KEY) || "welcome"; } catch { return "welcome"; }
  });
  const [activeCat, setActiveCat] = useState<string | null>(() => {
    try { return sessionStorage.getItem(IG_CAT_KEY); } catch { return null; }
  });
  const [search, setSearch] = useState("");
  const [reading, setReading] = useState<Blog | null>(() => {
    try { const raw = sessionStorage.getItem(IG_READ_KEY); return raw ? JSON.parse(raw) as Blog : null; } catch { return null; }
  });
  const [editing, setEditing] = useState<Blog | null>(() => {
    try { const raw = sessionStorage.getItem(IG_EDIT_KEY); return raw ? JSON.parse(raw) as Blog : null; } catch { return null; }
  });
  const [showEditor, setShowEditor] = useState<boolean>(() => {
    try { return sessionStorage.getItem(IG_SHOW_EDITOR_KEY) === "1"; } catch { return false; }
  });
  const [newCatName, setNewCatName] = useState("");
  const [addingCat, setAddingCat] = useState(false);
  const dragCatId = useRef<string | null>(null);
  const dragBlogId = useRef<string | null>(null);

  // Persist UI state across screen swaps (route remounts).
  useEffect(() => { try { sessionStorage.setItem(IG_TAB_KEY, tab); } catch { /* ignore */ } }, [tab]);
  useEffect(() => {
    try {
      if (activeCat) sessionStorage.setItem(IG_CAT_KEY, activeCat);
      else sessionStorage.removeItem(IG_CAT_KEY);
    } catch { /* ignore */ }
  }, [activeCat]);
  useEffect(() => {
    try {
      if (editing) sessionStorage.setItem(IG_EDIT_KEY, JSON.stringify(editing));
      else sessionStorage.removeItem(IG_EDIT_KEY);
    } catch { /* ignore */ }
  }, [editing]);
  useEffect(() => {
    try {
      if (reading) sessionStorage.setItem(IG_READ_KEY, JSON.stringify(reading));
      else sessionStorage.removeItem(IG_READ_KEY);
    } catch { /* ignore */ }
  }, [reading]);
  useEffect(() => {
    try {
      if (showEditor) sessionStorage.setItem(IG_SHOW_EDITOR_KEY, "1");
      else sessionStorage.removeItem(IG_SHOW_EDITOR_KEY);
    } catch { /* ignore */ }
  }, [showEditor]);

  const dataQuery = useQuery({
    queryKey: ["install-guides-data"],
    queryFn: async () => {
      const [{ data: cats }, { data: bs }] = await Promise.all([
        supabase.from("install_categories").select("*").order("sort_order"),
        supabase.from("install_blogs").select("*").order("sort_order").order("created_at", { ascending: false }),
      ]);
      return {
        categories: (cats ?? []) as Category[],
        blogs: (bs ?? []) as Blog[],
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
  const load = () => queryClient.invalidateQueries({ queryKey: ["install-guides-data"] });

  useEffect(() => {
    if (!activeCat && categories.length) setActiveCat(categories[0].id);
  }, [categories, activeCat]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const b of blogs) m[b.category_id] = (m[b.category_id] ?? 0) + 1;
    return m;
  }, [blogs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return blogs.filter((b) => {
      if (activeCat && b.category_id !== activeCat) return false;
      if (!q) return true;
      return (
        b.title.toLowerCase().includes(q) ||
        (b.excerpt ?? "").toLowerCase().includes(q) ||
        (b.body ?? "").toLowerCase().includes(q)
      );
    });
  }, [blogs, activeCat, search]);

  const activeCategory = categories.find((c) => c.id === activeCat);

  // Persist new-guide draft so it survives closing the dialog or leaving the page.
  useEffect(() => {
    if (!editing || editing.id) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(editing));
    } catch {
      /* ignore quota errors */
    }
  }, [editing]);

  const openNew = () => {
    let draft: Partial<Blog> | null = null;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) draft = JSON.parse(raw) as Partial<Blog>;
    } catch {
      draft = null;
    }
    setEditing({
      id: "",
      category_id: draft?.category_id || activeCat || categories[0]?.id || "",
      title: draft?.title ?? "",
      excerpt: draft?.excerpt ?? "",
      body: draft?.body ?? "",
      image_url: draft?.image_url ?? "",
      pdf_url: draft?.pdf_url ?? "",
      badge: draft?.badge ?? "",
      published: draft?.published ?? true,
      created_at: "",
      sort_order: 0,
    });
    if (draft && (draft.title || draft.body || draft.excerpt || draft.image_url || draft.pdf_url)) {
      toast.message("Draft restored");
    }
    setShowEditor(true);
  };

  const saveBlog = async () => {
    if (!editing) return;
    if (!editing.title.trim() || !editing.category_id) {
      toast.error("Title and category are required");
      return;
    }
    const payload = {
      category_id: editing.category_id,
      title: editing.title.trim(),
      excerpt: editing.excerpt?.trim() || null,
      body: editing.body?.trim() || null,
      image_url: editing.image_url?.trim() || null,
      pdf_url: editing.pdf_url?.trim() || null,
      badge: editing.badge?.trim() || null,
      published: editing.published,
    };
    const { error } = editing.id
      ? await supabase.from("install_blogs").update(payload).eq("id", editing.id)
      : await supabase.from("install_blogs").insert({ ...payload, created_by: user?.id ?? null });
    if (error) return toast.error(error.message);
    if (!editing.id) {
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    }
    toast.success(editing.id ? "Guide updated" : "Guide added");
    setShowEditor(false);
    setEditing(null);
    load();
  };

  const deleteBlog = async (id: string) => {
    if (!confirm("Delete this guide?")) return;
    const { error } = await supabase.from("install_blogs").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  };

  const addCategory = async () => {
    const name = newCatName.trim();
    if (!name) return;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `cat-${Date.now()}`;
    const nextOrder = (categories[categories.length - 1]?.sort_order ?? 0) + 10;
    const { error } = await supabase.from("install_categories").insert({ name, slug, sort_order: nextOrder });
    if (error) return toast.error(error.message);
    setNewCatName("");
    setAddingCat(false);
    toast.success("Category added");
    load();
  };

  const deleteCategory = async (id: string) => {
    if ((counts[id] ?? 0) > 0) return toast.error("Move or delete guides in this category first");
    if (!confirm("Delete this category?")) return;
    const { error } = await supabase.from("install_categories").delete().eq("id", id);
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
    queryClient.setQueryData<typeof dataQuery.data>(["install-guides-data"], (prev) => prev ? { ...prev, categories: updated } : prev);
    await Promise.all(
      updated.map((c) => supabase.from("install_categories").update({ sort_order: c.sort_order }).eq("id", c.id))
    );
  };

  const reorderBlogs = async (fromId: string, toId: string) => {
    if (fromId === toId || !activeCat) return;
    const inCat = blogs.filter((b) => b.category_id === activeCat);
    const others = blogs.filter((b) => b.category_id !== activeCat);
    const fromIdx = inCat.findIndex((b) => b.id === fromId);
    const toIdx = inCat.findIndex((b) => b.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = inCat.splice(fromIdx, 1);
    inCat.splice(toIdx, 0, moved);
    const updated = inCat.map((b, i) => ({ ...b, sort_order: (i + 1) * 10 }));
    queryClient.setQueryData<typeof dataQuery.data>(["install-guides-data"], (prev) => prev ? { ...prev, blogs: [...others, ...updated] } : prev);
    await Promise.all(
      updated.map((b) => supabase.from("install_blogs").update({ sort_order: b.sort_order }).eq("id", b.id))
    );
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-br from-[#1a0b2e] via-[#2d1b4e] to-[#1a0b2e] text-violet-50">
      <header className="px-8 pt-8 pb-6 border-b border-violet-500/30 bg-violet-950/40 backdrop-blur">
        <h1 className="font-display text-3xl font-bold text-violet-50">Install Guides</h1>
        <p className="text-violet-200/80 mt-1">Step-by-step installation walkthroughs and PDF docs</p>
      </header>

      <div className="px-8 py-6">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className={`grid ${canManageCategories ? "grid-cols-3" : "grid-cols-2"} max-w-2xl bg-violet-950/60 border border-violet-500/30`}>
            <TabsTrigger value="welcome" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-600 data-[state=active]:to-purple-600 data-[state=active]:text-white">Welcome</TabsTrigger>
            <TabsTrigger value="guides" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-600 data-[state=active]:to-purple-600 data-[state=active]:text-white">Guides</TabsTrigger>
            {canManageCategories && (
              <TabsTrigger value="categories" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-600 data-[state=active]:to-purple-600 data-[state=active]:text-white">Categories</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="welcome" className="mt-6">
            <div className="relative overflow-hidden rounded-2xl border border-violet-500/30 shadow-[0_0_60px_-15px_rgba(139,92,246,0.5)] min-h-[60vh] lg:min-h-[70vh]">
              <img
                src={installHero}
                alt="Couple watching an install guide on TV from their sofa"
                width={1920}
                height={1080}
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#1a0b2e]/95 via-[#1a0b2e]/70 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#1a0b2e]/80 via-transparent to-transparent" />
              <div className="relative p-6 sm:p-10 md:p-14 max-w-2xl">
                <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold text-violet-50 leading-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]">
                  Welcome to Install Guides
                </h2>
                <p className="mt-4 text-base sm:text-lg text-violet-100/90 drop-shadow">
                  Everything you need to get up and running — written walkthroughs and downloadable PDF references.
                </p>
                <p className="mt-3 text-violet-100/80 drop-shadow">
                  Browse by category, search for what you need, and open PDFs directly in your browser.
                </p>
                <Button className="mt-6 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-violet-500 text-white shadow-lg shadow-violet-900/40" onClick={() => setTab("guides")}>Browse guides</Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="guides" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
              <aside className="rounded-2xl bg-violet-950/50 border border-violet-500/30 p-4 h-fit">
                <h3 className="font-display font-semibold mb-3 px-2 text-violet-50">Categories</h3>
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
                        className={`group flex items-center gap-1 px-1 rounded-lg ${active ? "bg-gradient-to-r from-violet-600 to-blue-600 text-white" : "text-violet-100 hover:bg-violet-900/50"}`}
                      >
                        {isMod && (
                          <GripVertical className="size-3.5 opacity-40 group-hover:opacity-80 cursor-grab shrink-0" />
                        )}
                        <button
                          onClick={() => setActiveCat(c.id)}
                          className="flex-1 flex items-center justify-between px-2 py-2 text-sm text-left"
                        >
                          <span>{c.name}</span>
                          {n > 0 && (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${active ? "bg-white/20" : "bg-violet-900/60"}`}>{n}</span>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </aside>

              <section>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-violet-300/70" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search install guides..."
                      className="pl-9 bg-violet-950/50 border-violet-500/30 text-violet-50 placeholder:text-violet-300/50"
                    />
                  </div>
                  {isMod && (
                    <Button onClick={openNew} className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white">
                      <Plus className="size-4 mr-1" /> Add Guide
                    </Button>
                  )}
                </div>

                {activeCategory && (
                  <h2 className="font-display text-2xl font-bold mb-4 text-violet-50">{activeCategory.name} Guides</h2>
                )}

                {filtered.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-violet-500/30 p-12 text-center text-violet-200/70">
                    No guides in this category yet.
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
                        className="rounded-2xl bg-violet-950/50 border border-violet-500/30 overflow-hidden flex flex-col group hover:shadow-[0_0_40px_-10px_rgba(139,92,246,0.6)] transition-shadow"
                      >
                        <div className="aspect-[16/10] bg-violet-900/50 relative overflow-hidden">
                          {b.image_url ? (
                            <img src={b.image_url} alt={b.title} className="w-full h-full object-contain group-hover:scale-105 transition-transform" />
                          ) : (
                            <div className="w-full h-full grid place-items-center text-violet-300/70">
                              {b.pdf_url ? <FileText className="size-10" /> : <ImageIcon className="size-10" />}
                            </div>
                          )}
                          {b.pdf_url && (
                            <span className="absolute top-2 right-2 text-[10px] uppercase tracking-wider px-2 py-1 rounded-md bg-fuchsia-500/90 text-white font-semibold flex items-center gap-1">
                              <FileText className="size-3" /> PDF
                            </span>
                          )}
                          {isMod && (
                            <div className="absolute top-2 left-2 size-8 rounded-md bg-black/60 backdrop-blur grid place-items-center text-white cursor-grab">
                              <GripVertical className="size-4" />
                            </div>
                          )}
                        </div>
                        <div className="p-4 flex-1 flex flex-col gap-2">
                          <div className="flex flex-wrap gap-2">
                            <span className="text-xs px-2 py-1 rounded-md bg-fuchsia-500/30 text-white font-semibold border border-fuchsia-400/50">
                              {categories.find((c) => c.id === b.category_id)?.name}
                            </span>
                            {b.badge && (
                              <span className="text-xs px-2 py-1 rounded-md bg-fuchsia-500/20 text-fuchsia-200 font-medium">{b.badge}</span>
                            )}
                          </div>
                          <h3 className="font-display font-semibold text-lg leading-snug text-violet-50">{b.title}</h3>
                          {b.excerpt && <p className="text-sm text-violet-200/70 line-clamp-2">{b.excerpt}</p>}
                          <div className="mt-auto pt-3 flex items-center gap-2">
                            {b.pdf_url ? (
                              <Button asChild size="sm" className="flex-1 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white">
                                <a
                                  href={b.pdf_url}
                                  download={`${b.title}.pdf`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  Download PDF
                                </a>
                              </Button>
                            ) : (
                              <Button size="sm" className="flex-1 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white" onClick={() => setReading(b)}>
                                Click to Read
                              </Button>
                            )}
                            {isMod && (
                              <>
                                <Button size="icon" variant="ghost" className="text-violet-200 hover:bg-violet-900/60 hover:text-white" onClick={() => { setEditing(b); setShowEditor(true); }}>
                                  <Pencil className="size-4" />
                                </Button>
                                <Button size="icon" variant="ghost" className="text-violet-200 hover:bg-violet-900/60 hover:text-white" onClick={() => deleteBlog(b.id)}>
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
                      className="max-w-xs bg-violet-950/50 border-violet-500/30 text-violet-50 placeholder:text-violet-300/50"
                    />
                    <Button onClick={addCategory} className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white">Add</Button>
                    <Button variant="ghost" className="text-violet-200 hover:bg-violet-900/60 hover:text-white" onClick={() => { setAddingCat(false); setNewCatName(""); }}>Cancel</Button>
                  </>
                ) : (
                  <Button onClick={() => setAddingCat(true)} className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white">
                    <Plus className="size-4 mr-1" /> Add Category
                  </Button>
                )}
                <span className="text-xs text-violet-200/70 ml-2">Drag cards to reorder — order is saved for everyone.</span>
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
                  className="rounded-2xl bg-violet-950/50 border border-violet-500/30 p-5 hover:border-violet-400 transition relative"
                >
                  {isMod && (
                    <div className="absolute top-2 right-2 flex items-center gap-1">
                      <GripVertical className="size-4 text-violet-300/70 cursor-grab" />
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteCategory(c.id); }}
                        className="text-violet-300/70 hover:text-white p-1 rounded-md"
                        title="Delete category"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  )}
                  <button onClick={() => { setActiveCat(c.id); setTab("guides"); }} className="text-left w-full">
                    <div className="font-display font-semibold text-lg text-violet-50">{c.name}</div>
                    <div className="text-sm text-violet-200/70 mt-1">{counts[c.id] ?? 0} guide{(counts[c.id] ?? 0) === 1 ? "" : "s"}</div>
                  </button>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Reader */}
      <Dialog open={!!reading} onOpenChange={(o) => !o && setReading(null)}>
        <DialogContent className={reading?.pdf_url ? "max-w-5xl h-[90vh] flex flex-col" : "max-w-2xl max-h-[85vh] overflow-y-auto"}>
          {reading && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-2xl flex items-center gap-3 text-white">
                  <span className="flex-1">{reading.title}</span>
                  {reading.pdf_url && (
                    <a
                      href={reading.pdf_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-normal inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <ExternalLink className="size-4" /> Open in new tab
                    </a>
                  )}
                </DialogTitle>
              </DialogHeader>
              {reading.pdf_url ? (
                <iframe
                  src={reading.pdf_url}
                  title={reading.title}
                  className="flex-1 w-full rounded-lg border border-border bg-white"
                />
              ) : (
                <>
                  {reading.image_url && (
                    <img src={reading.image_url} alt={reading.title} className="max-h-48 md:max-h-64 w-auto mx-auto rounded-2xl border border-purple-500/30 object-contain" />
                  )}
                  <div className="flex flex-wrap gap-2">
                    <span className="text-xs px-2 py-1 rounded-md bg-fuchsia-500/30 text-white font-semibold border border-fuchsia-400/50">
                      {categories.find((c) => c.id === reading.category_id)?.name}
                    </span>
                    {reading.badge && (
                      <span className="text-xs px-2 py-1 rounded-md bg-accent/20 text-accent-foreground font-medium">{reading.badge}</span>
                    )}
                  </div>
                  {reading.excerpt && <p className="text-muted-foreground">{reading.excerpt}</p>}
                  {reading.body && <div className="whitespace-pre-wrap text-sm leading-relaxed">{reading.body}</div>}
                </>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Editor */}
      <Dialog open={showEditor} onOpenChange={(o) => { if (!o) { setShowEditor(false); setEditing(null); } }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit guide" : "Add guide"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Category</Label>
                <select
                  className="mt-1 w-full bg-surface-2 border border-border rounded-md px-3 py-2 text-sm"
                  value={editing.category_id}
                  onChange={(e) => setEditing({ ...editing, category_id: e.target.value })}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Title</Label>
                <Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
              </div>
              <div>
                <Label>PDF URL (optional — opens inline in browser)</Label>
                <Input
                  value={editing.pdf_url ?? ""}
                  onChange={(e) => setEditing({ ...editing, pdf_url: e.target.value })}
                  placeholder="https://…/guide.pdf"
                />
              </div>
              <div>
                <Label>Header image</Label>
                <HeaderImageUpload
                  value={editing.image_url}
                  onChange={(url) => setEditing({ ...editing, image_url: url })}
                  folder="install-guides"
                />
              </div>
              <div>
                <Label>Badge (optional)</Label>
                <Input value={editing.badge ?? ""} onChange={(e) => setEditing({ ...editing, badge: e.target.value })} placeholder="e.g. New" />
              </div>
              <div>
                <Label>Excerpt</Label>
                <Textarea rows={2} value={editing.excerpt ?? ""} onChange={(e) => setEditing({ ...editing, excerpt: e.target.value })} />
              </div>
              <div>
                <Label>Body (used when no PDF is set)</Label>
                <Textarea rows={6} value={editing.body ?? ""} onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.published}
                  onChange={(e) => setEditing({ ...editing, published: e.target.checked })}
                />
                Published
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setShowEditor(false); setEditing(null); }}>
              <X className="size-4 mr-1" /> Cancel
            </Button>
            <Button onClick={saveBlog}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
