import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, X, Pencil, Trash2, ImageIcon, GripVertical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_approved/sports-guides")({
  component: SportsGuidesPage,
});

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
};

function SportsGuidesPage() {
  const { isMod, user } = useAuth();
  const [tab, setTab] = useState("welcome");
  const [categories, setCategories] = useState<Category[]>([]);
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [reading, setReading] = useState<Blog | null>(null);
  const [editing, setEditing] = useState<Blog | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [addingCat, setAddingCat] = useState(false);
  const dragCatId = useRef<string | null>(null);
  const dragBlogId = useRef<string | null>(null);

  const load = async () => {
    const [{ data: cats }, { data: bs }] = await Promise.all([
      supabase.from("sports_categories").select("*").order("sort_order"),
      supabase.from("sports_blogs").select("*").order("sort_order").order("created_at", { ascending: false }),
    ]);
    setCategories((cats ?? []) as Category[]);
    setBlogs((bs ?? []) as Blog[]);
    if (!activeCat && cats?.length) setActiveCat(cats[0].id);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const openNew = () => {
    setEditing({
      id: "",
      category_id: activeCat ?? categories[0]?.id ?? "",
      title: "",
      excerpt: "",
      body: "",
      image_url: "",
      badge: "",
      published: true,
      created_at: "",
    });
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
      badge: editing.badge?.trim() || null,
      published: editing.published,
    };
    const { error } = editing.id
      ? await supabase.from("sports_blogs").update(payload).eq("id", editing.id)
      : await supabase.from("sports_blogs").insert({ ...payload, created_by: user?.id ?? null });
    if (error) return toast.error(error.message);
    toast.success(editing.id ? "Blog updated" : "Blog added");
    setShowEditor(false);
    setEditing(null);
    load();
  };

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
    setCategories(updated);
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
    setBlogs([...others, ...updated]);
    await Promise.all(
      updated.map((b) => supabase.from("sports_blogs").update({ sort_order: b.sort_order }).eq("id", b.id))
    );
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="px-8 pt-8 pb-6 border-b border-border">
        <h1 className="font-display text-3xl font-bold">Sports Guide</h1>
        <p className="text-muted-foreground mt-1">Explore guides and news from all major sports</p>
      </header>

      <div className="px-8 py-6">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid grid-cols-3 max-w-2xl bg-surface-2">
            <TabsTrigger value="welcome">Welcome</TabsTrigger>
            <TabsTrigger value="guides">Guides</TabsTrigger>
            <TabsTrigger value="categories">Categories</TabsTrigger>
          </TabsList>

          <TabsContent value="welcome" className="mt-6">
            <div className="rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 border border-border p-10">
              <h2 className="font-display text-3xl font-bold">Welcome to Sports Guide</h2>
              <p className="mt-3 text-lg text-muted-foreground max-w-2xl">
                Dive into the world of sports with comprehensive guides, insights, and news from your favorite games.
              </p>
              <p className="mt-4 text-muted-foreground max-w-2xl">
                Whether you're a fan of football, basketball, soccer, tennis, baseball, hockey, or golf — we've got you covered with expert analysis and up-to-date information.
              </p>
              <Button className="mt-6" onClick={() => setTab("guides")}>Browse guides</Button>
            </div>
          </TabsContent>

          <TabsContent value="guides" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
              <aside className="rounded-2xl bg-surface border border-border p-4 h-fit">
                <h3 className="font-display font-semibold mb-3 px-2">Categories</h3>
                <div className="space-y-1">
                  {categories.map((c) => {
                    const active = c.id === activeCat;
                    const n = counts[c.id] ?? 0;
                    return (
                      <button
                        key={c.id}
                        onClick={() => setActiveCat(c.id)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition ${
                          active ? "bg-primary text-primary-foreground" : "hover:bg-surface-2"
                        }`}
                      >
                        <span className="text-left">{c.name}</span>
                        {n > 0 && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${active ? "bg-primary-foreground/20" : "bg-surface-2"}`}>{n}</span>
                        )}
                      </button>
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
                      placeholder="Search sports guides..."
                      className="pl-9"
                    />
                  </div>
                  {isMod && (
                    <Button onClick={openNew}>
                      <Plus className="size-4 mr-1" /> Add Blog
                    </Button>
                  )}
                </div>

                {activeCategory && (
                  <h2 className="font-display text-2xl font-bold mb-4">{activeCategory.name} Guides</h2>
                )}

                {filtered.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
                    No blogs in this category yet.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {filtered.map((b) => (
                      <article
                        key={b.id}
                        className="rounded-2xl bg-surface border border-border overflow-hidden flex flex-col group"
                      >
                        <div className="aspect-[16/10] bg-surface-2 relative overflow-hidden">
                          {b.image_url ? (
                            <img src={b.image_url} alt={b.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                          ) : (
                            <div className="w-full h-full grid place-items-center text-muted-foreground">
                              <ImageIcon className="size-10" />
                            </div>
                          )}
                        </div>
                        <div className="p-4 flex-1 flex flex-col gap-2">
                          <div className="flex flex-wrap gap-2">
                            <span className="text-xs px-2 py-1 rounded-md bg-primary/15 text-primary font-medium">
                              {categories.find((c) => c.id === b.category_id)?.name}
                            </span>
                            {b.badge && (
                              <span className="text-xs px-2 py-1 rounded-md bg-accent/20 text-accent-foreground font-medium">{b.badge}</span>
                            )}
                          </div>
                          <h3 className="font-display font-semibold text-lg leading-snug">{b.title}</h3>
                          {b.excerpt && <p className="text-sm text-muted-foreground line-clamp-2">{b.excerpt}</p>}
                          <div className="mt-auto pt-3 flex items-center gap-2">
                            <Button size="sm" className="flex-1" onClick={() => setReading(b)}>Click to Read</Button>
                            {isMod && (
                              <>
                                <Button size="icon" variant="ghost" onClick={() => { setEditing(b); setShowEditor(true); }}>
                                  <Pencil className="size-4" />
                                </Button>
                                <Button size="icon" variant="ghost" onClick={() => deleteBlog(b.id)}>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { setActiveCat(c.id); setTab("guides"); }}
                  className="rounded-2xl bg-surface border border-border p-5 text-left hover:border-primary transition"
                >
                  <div className="font-display font-semibold text-lg">{c.name}</div>
                  <div className="text-sm text-muted-foreground mt-1">{counts[c.id] ?? 0} guide{(counts[c.id] ?? 0) === 1 ? "" : "s"}</div>
                </button>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Reader */}
      <Dialog open={!!reading} onOpenChange={(o) => !o && setReading(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {reading && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-2xl">{reading.title}</DialogTitle>
              </DialogHeader>
              {reading.image_url && (
                <img src={reading.image_url} alt={reading.title} className="w-full rounded-lg" />
              )}
              <div className="flex flex-wrap gap-2">
                <span className="text-xs px-2 py-1 rounded-md bg-primary/15 text-primary font-medium">
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
        </DialogContent>
      </Dialog>

      {/* Editor */}
      <Dialog open={showEditor} onOpenChange={(o) => { if (!o) { setShowEditor(false); setEditing(null); } }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit blog" : "Add blog"}</DialogTitle>
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
                <Label>Image URL</Label>
                <Input value={editing.image_url ?? ""} onChange={(e) => setEditing({ ...editing, image_url: e.target.value })} placeholder="https://…" />
              </div>
              <div>
                <Label>Badge (optional)</Label>
                <Input value={editing.badge ?? ""} onChange={(e) => setEditing({ ...editing, badge: e.target.value })} placeholder="e.g. Updated with New Listings" />
              </div>
              <div>
                <Label>Excerpt</Label>
                <Textarea rows={2} value={editing.excerpt ?? ""} onChange={(e) => setEditing({ ...editing, excerpt: e.target.value })} />
              </div>
              <div>
                <Label>Body</Label>
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
