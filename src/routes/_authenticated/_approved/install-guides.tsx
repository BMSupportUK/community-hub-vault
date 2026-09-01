import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, X, Pencil, Trash2, ImageIcon, GripVertical, FileText, Play, Film, Copy, Check, Upload, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AccessRequestPanel } from "@/components/app/AccessRequestPanel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HeaderImageUpload } from "@/components/ui/header-image-upload";
import { HeaderVideoUpload } from "@/components/ui/header-video-upload";
import {
  GuideVaultCardActions,
  GuideLockBadge,
  GuideAccessCodeBox,
  GuidePasscodeAdmin,
  GuideAccessTimer,
  useGuideAccess,
} from "@/components/app/GuideVaultCardActions";
import { useGuideVideoUrl } from "@/hooks/use-guide-video-url";
import { AppTransferPanel } from "@/components/app/AppTransferPanel";
import { AppBuildAdmin } from "@/components/app/AppBuildAdmin";
import { AppTransfersAdmin } from "@/components/app/AppTransfersAdmin";
import { useServerFn } from "@tanstack/react-start";
import { getMyAppTransfer } from "@/lib/app-transfer.functions";

import { toast } from "sonner";
import installHero from "@/assets/install-guides-bg.jpg";


export const Route = createFileRoute("/_authenticated/_approved/install-guides")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
  }),
  component: InstallGuidesPage,
});

const DRAFT_KEY = "install-guide-new-draft";
const IG_TAB_KEY = "install-guides-active-tab";
const IG_CAT_KEY = "install-guides-active-cat";
const IG_EDIT_KEY = "install-guides-editing";
const IG_READ_KEY = "install-guides-reading";
const IG_SHOW_EDITOR_KEY = "install-guides-show-editor";

/** Pulls the guide password out of text like "Enter e2n4Zq to view guide". */
function extractGuideCode(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(/enter\s+([^\s]{3,64}?)\s+to\s+(?:view|open|read)/i);
  return m ? m[1].replace(/[.,;:]$/, "") : null;
}

function CopyPasswordButton({ code, className = "" }: { code: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          toast.success("Password copied");
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("Couldn't copy — long-press the password to copy it.");
        }
      }}
      title="Copy password"
      aria-label={`Copy password ${code}`}
      className={`inline-flex items-center gap-1.5 shrink-0 rounded-md border border-primary/40 bg-primary/15 px-2 py-1 text-xs font-medium text-foreground hover:bg-primary/25 transition ${className}`}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      <span className="font-mono select-all">{code}</span>
    </button>
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
  pdf_url: string | null;
  video_url: string | null;
  badge: string | null;
  published: boolean;
  created_at: string;
  sort_order: number;
  file_path?: string | null;
  file_name?: string | null;
  file_mime?: string | null;
  file_size?: number | null;
};

/** Unlocked view of a stored guide, returned after a valid passcode. */
type UnlockedGuide = {
  blog: Blog;
  url: string | null;
  viewUrl: string | null;
  fileName: string | null;
  body: string | null;
};


function InstallGuidesPage() {
  const { user, hasAny } = useAuth();
  const queryClient = useQueryClient();
  const canManageGuides = hasAny(["admin", "management"]);
  const canViewGuides = hasAny(["subscriber", "admin", "management", "staff"]);
  const canManageCategories = canManageGuides;
  const canManagePasscodes = canManageGuides;
  const canSeeTransfers = hasAny(["admin", "management", "staff"]);

  const { tab: tabParam } = Route.useSearch();
  const [tab, setTab] = useState<string>(() => {
    if (tabParam) return tabParam;
    try { return sessionStorage.getItem(IG_TAB_KEY) || "welcome"; } catch { return "welcome"; }
  });
  useEffect(() => {
    if (tabParam) setTab(tabParam);
  }, [tabParam]);
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
  const [playingVideo, setPlayingVideo] = useState<Blog | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  // Guide vault: which stored guides this member currently holds a live
  // passcode for, plus the guide they just unlocked for viewing.
  const accessQuery = useGuideAccess();
  const unlockedIds = useMemo(
    () => new Set((accessQuery.data ?? []).map((a) => a.blogId)),
    [accessQuery.data],
  );
  const accessExpiry = useMemo(
    () => new Map((accessQuery.data ?? []).map((a) => [a.blogId, a.expiresAt])),
    [accessQuery.data],
  );
  // The download-link tab only appears once the member holds a live guide
  // passcode (staff who manage passcodes always see it).
  const hasLivePasscode = (accessQuery.data?.length ?? 0) > 0;
  const canSeeAppTab = hasLivePasscode || canManagePasscodes;

  // Live transfer state drives the tab label, flipping back on expiry.
  const fetchMyTransfer = useServerFn(getMyAppTransfer);
  const myTransferQuery = useQuery({
    queryKey: ["app-transfer"],
    queryFn: () => fetchMyTransfer(),
    enabled: canSeeAppTab,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const hasLiveTransfer =
    !!myTransferQuery.data?.expiresAt &&
    new Date(myTransferQuery.data.expiresAt).getTime() > nowTick;

  useEffect(() => {
    const isRestrictedAdminTab = tab === "categories" || tab === "passcodes" || tab === "app-apk";
    if (
      (tab === "get-app" && !canSeeAppTab) ||
      (tab === "transfers" && !canSeeTransfers) ||
      (isRestrictedAdminTab && !canManageGuides)
    ) {
      setTab("welcome");
    }
  }, [tab, canSeeAppTab, canManageGuides, canSeeTransfers]);
  const [unlocked, setUnlocked] = useState<UnlockedGuide | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  // Remembers which guide card the user came from so save/cancel returns there
  // instead of dumping them at the top of the list.
  const focusGuideId = useRef<string | null>(null);
  const scrollBackToGuide = () => {
    const id = focusGuideId.current;
    focusGuideId.current = null;
    if (!id) return;
    window.setTimeout(() => {
      document
        .querySelector(`[data-guide-id="${id}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 80);
  };
  const closeEditor = () => {
    setShowEditor(false);
    setEditing(null);
    scrollBackToGuide();
  };

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
    if (!activeCat && categories.length) {
      const amazon = categories.find(
        (c) => c.slug === "amazon" || c.name.toLowerCase() === "amazon",
      );
      setActiveCat((amazon ?? categories[0]).id);
    }
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
      video_url: draft?.video_url ?? "",
      badge: draft?.badge ?? "",
      published: draft?.published ?? true,
      created_at: "",
      sort_order: 0,
      file_path: draft?.file_path ?? null,
      file_name: draft?.file_name ?? null,
      file_mime: draft?.file_mime ?? null,
      file_size: draft?.file_size ?? null,
    });
    if (draft && (draft.title || draft.body || draft.excerpt || draft.image_url || draft.pdf_url || draft.video_url)) {
      toast.message("Draft restored");
    }
    setShowEditor(true);
  };

  /** Uploads a guide file into the private vault bucket (admin/management). */
  const uploadGuideFile = async (file: File) => {
    if (!editing) return;
    setUploadingFile(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("guide-files")
        .upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (error) throw error;
      setEditing({
        ...editing,
        file_path: path,
        file_name: file.name,
        file_mime: file.type || null,
        file_size: file.size,
      });
      toast.success("Guide file uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingFile(false);
    }
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
      video_url: editing.video_url?.trim() || null,
      badge: editing.badge?.trim() || null,
      published: editing.published,
      file_path: editing.file_path || null,
      file_name: editing.file_name || null,
      file_mime: editing.file_mime || null,
      file_size: editing.file_size ?? null,
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
    scrollBackToGuide();
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

  const renameCategory = async (id: string, currentName: string) => {
    const name = window.prompt("Rename category", currentName)?.trim();
    if (!name || name === currentName) return;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `cat-${Date.now()}`;
    const { error } = await supabase
      .from("install_categories")
      .update({ name, slug })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Category renamed");
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
    <div className="flex-1 overflow-y-auto bg-background text-foreground">
       <header className="px-4 sm:px-8 pt-8 pb-6 border-b border-border bg-surface/60 backdrop-blur">
        <h1 className="font-display text-3xl font-bold text-foreground">Install Guides</h1>
        <p className="text-muted-foreground mt-1">Step-by-step installation walkthroughs and PDF docs</p>
      </header>

        <div className="px-4 sm:px-8 py-6">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
           <TabsList className="flex h-auto w-full flex-wrap gap-1 border border-border bg-surface/70 p-1 sm:flex-nowrap">
             <TabsTrigger value="welcome" className="min-w-0 flex-1 px-2 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground lg:text-sm">Welcome</TabsTrigger>
             <TabsTrigger value="guides" className="min-w-0 flex-1 px-2 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground lg:text-sm">Guides</TabsTrigger>
            {canSeeAppTab && (
               <TabsTrigger value="get-app" className="min-w-fit flex-[2.35] px-2 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground lg:text-sm">{hasLiveTransfer ? "View Your Download URL" : "Download BM Support Apps"}</TabsTrigger>
            )}
            {canManageCategories && (
               <TabsTrigger value="categories" className="min-w-0 flex-1 px-2 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground lg:text-sm">Categories</TabsTrigger>
            )}
            {canManagePasscodes && (
               <TabsTrigger value="passcodes" className="min-w-0 flex-1 px-2 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground lg:text-sm">Passcodes</TabsTrigger>
            )}
            {canSeeTransfers && (
               <TabsTrigger value="transfers" className="min-w-0 flex-1 px-2 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground lg:text-sm">Transfers</TabsTrigger>
            )}
            {canManagePasscodes && (
               <TabsTrigger value="app-apk" className="min-w-0 flex-1 px-2 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground lg:text-sm">App APK</TabsTrigger>
            )}
          </TabsList>

          {canSeeAppTab && (
            <TabsContent value="get-app" className="mt-6">
              <div className="max-w-4xl">
                <AppTransferPanel onUploadClick={canManagePasscodes ? () => setTab("app-apk") : undefined} />
              </div>
            </TabsContent>
          )}

          {canManagePasscodes && (
            <TabsContent value="passcodes" className="mt-6">
              <div className="space-y-8">
                <GuidePasscodeAdmin />
              </div>
            </TabsContent>
          )}

          {canSeeTransfers && (
            <TabsContent value="transfers" className="mt-6">
              <div className="max-w-5xl">
                <AppTransfersAdmin />
              </div>
            </TabsContent>
          )}

          {canManagePasscodes && (
            <TabsContent value="app-apk" className="mt-6">
              <div className="max-w-5xl">
                <AppBuildAdmin />
              </div>
            </TabsContent>
          )}



          <TabsContent value="welcome" className="mt-6">
            <div className="relative overflow-hidden rounded-2xl border border-border shadow-glow min-h-[60vh] lg:min-h-[70vh]">
              <img
                src={installHero}
                alt="Couple watching an install guide on TV from their sofa"
                width={1920}
                height={1080}
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/70 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
              <div className="relative p-6 sm:p-10 md:p-14 max-w-2xl">
                <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold text-foreground leading-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]">
                  Welcome to Install Guides
                </h2>
                <p className="mt-4 text-base sm:text-lg text-foreground/90 drop-shadow">
                  Everything you need to get up and running — written walkthroughs and PDF references, viewable securely in-app.
                </p>
                <p className="mt-3 text-foreground/80 drop-shadow">
                  Browse by category, search for what you need, and open PDFs directly in your browser.
                </p>
                <Button className="mt-6 bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90" onClick={() => setTab("guides")}>Browse guides</Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="guides" className="mt-6">
            {!canViewGuides ? (
              <AccessRequestPanel
                section="guides"
                title="Install guides are for subscribers"
                description="The install guides are available to subscribers. Request access and an admin will be notified straight away."
              />
            ) : (
            <div
              className="relative rounded-2xl border border-border overflow-hidden p-4 sm:p-6 shadow-glow bg-cover bg-center"
              style={{ backgroundImage: `url(${installHero})` }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-background/70 via-background/50 to-surface/70 pointer-events-none" />
              <div className="relative grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
              <aside className="rounded-2xl bg-surface/70 border border-border p-4 h-fit">
                <h3 className="font-display font-semibold mb-3 px-2 text-foreground">Categories</h3>
                <div className="space-y-1">
                  {categories.map((c) => {
                    const active = c.id === activeCat;
                    const n = counts[c.id] ?? 0;
                    return (
                      <div
                        key={c.id}
                        draggable={canManageGuides}
                        onDragStart={() => { dragCatId.current = c.id; }}
                        onDragOver={(e) => { if (canManageGuides) e.preventDefault(); }}
                        onDrop={(e) => {
                          if (!canManageGuides) return;
                          e.preventDefault();
                          if (dragCatId.current) reorderCategories(dragCatId.current, c.id);
                          dragCatId.current = null;
                        }}
                        className={`group flex items-center gap-1 px-1 rounded-lg ${active ? "bg-gradient-primary text-primary-foreground" : "text-foreground/85 hover:bg-surface-2/70"}`}
                      >
                        {canManageGuides && (
                          <GripVertical className="size-3.5 opacity-40 group-hover:opacity-80 cursor-grab shrink-0" />
                        )}
                        <button
                          onClick={() => setActiveCat(c.id)}
                          className="flex-1 flex items-center justify-between px-2 py-2 text-sm text-left"
                        >
                          <span>{c.name}</span>
                          {n > 0 && (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${active ? "bg-white/20" : "bg-surface-2/80"}`}>{n}</span>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
                <GuideAccessCodeBox />
              </aside>

              <section>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search install guides..."
                      className="pl-9 bg-violet-950/50 border-violet-500/30 text-foreground placeholder:text-violet-300/50"
                    />
                  </div>
                  {canManageGuides && (
                    <Button onClick={openNew} className="bg-gradient-primary text-primary-foreground hover:opacity-90">
                      <Plus className="size-4 mr-1" /> Add Guide
                    </Button>
                  )}
                </div>

                {activeCategory && (
                  <h2 className="font-display text-2xl font-bold mb-4 text-foreground">{activeCategory.name} Guides</h2>
                )}

                {filtered.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-violet-500/30 p-12 text-center text-muted-foreground">
                    No guides in this category yet.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {filtered.map((b) => (
                      <article
                        key={b.id}
                        data-guide-id={b.id}
                        draggable={canManageGuides}
                        onDragStart={() => { dragBlogId.current = b.id; }}
                        onDragOver={(e) => { if (canManageGuides) e.preventDefault(); }}
                        onDrop={(e) => {
                          if (!canManageGuides) return;
                          e.preventDefault();
                          if (dragBlogId.current) reorderBlogs(dragBlogId.current, b.id);
                          dragBlogId.current = null;
                        }}
                        className="rounded-2xl bg-surface/70 border border-border overflow-hidden flex flex-col group hover:shadow-[0_0_40px_-10px_rgba(139,92,246,0.6)] transition-shadow"
                      >
                        <div className="aspect-[16/10] bg-surface-2/70 relative overflow-hidden">
                          {b.image_url ? (
                            <img src={b.image_url} alt={b.title} className="w-full h-full object-contain group-hover:scale-105 transition-transform" />
                          ) : b.video_url ? (
                            <div className="w-full h-full grid place-items-center bg-gradient-to-br from-violet-900/60 to-black text-white/70">
                              <Film className="size-10" />
                            </div>
                          ) : (
                            <div className="w-full h-full grid place-items-center text-muted-foreground">
                              {b.pdf_url ? <FileText className="size-10" /> : <ImageIcon className="size-10" />}
                            </div>
                          )}
                          {b.video_url && (
                            <button
                              type="button"
                              onClick={() => setPlayingVideo(b)}
                              className="absolute inset-0 grid place-items-center bg-black/30 hover:bg-black/50 transition"
                              aria-label="Play video"
                            >
                              <span className="size-16 rounded-full bg-white/90 grid place-items-center shadow-2xl group-hover:scale-110 transition-transform">
                                <Play className="size-7 text-violet-700 fill-violet-700 ml-1" />
                              </span>
                            </button>
                          )}
                          {b.video_url && (
                            <span className="absolute top-2 left-2 text-[10px] uppercase tracking-wider px-2 py-1 rounded-md bg-primary text-primary-foreground font-semibold flex items-center gap-1">
                              <Film className="size-3" /> Video
                            </span>
                          )}
                          {(b.file_path || b.pdf_url) && (
                            <GuideLockBadge unlocked={unlockedIds.has(b.id)} />
                          )}

                          {canManageGuides && (
                            <div className="absolute bottom-2 left-2 size-8 rounded-md bg-background/70 backdrop-blur grid place-items-center text-foreground cursor-grab">
                              <GripVertical className="size-4" />
                            </div>
                          )}
                        </div>
                        <div className="p-4 flex-1 flex flex-col gap-2">
                          <div className="flex flex-wrap gap-2">
                            <span className="text-xs px-2 py-1 rounded-md bg-primary/25 text-foreground font-semibold border border-primary/40">
                              {categories.find((c) => c.id === b.category_id)?.name}
                            </span>
                            {b.badge && (
                              <span className="text-xs px-2 py-1 rounded-md bg-primary/15 text-primary-glow font-medium">{b.badge}</span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-display font-semibold text-lg leading-snug text-foreground">{b.title}</h3>
                            {unlockedIds.has(b.id) && (
                              <GuideAccessTimer blogId={b.id} expiresAt={accessExpiry.get(b.id)} />
                            )}
                          </div>
                          {b.excerpt && (
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm text-muted-foreground line-clamp-2">{b.excerpt}</p>
                              {extractGuideCode(b.excerpt) && (
                                <CopyPasswordButton code={extractGuideCode(b.excerpt)!} />
                              )}
                            </div>
                          )}
                          <div className="mt-auto pt-3 flex items-center gap-2">
                            {b.file_path || b.pdf_url ? (
                              <GuideVaultCardActions
                                blogId={b.id}
                                title={b.title}
                                hasAccess={unlockedIds.has(b.id) || (accessQuery.data?.length ?? 0) > 0}
                                onOpen={(res) => {
                                  focusGuideId.current = b.id;
                                  setUnlocked({ blog: b, ...res });
                                }}
                              />
                            ) : (
                              <Button size="sm" className="flex-1 bg-gradient-primary text-primary-foreground hover:opacity-90" onClick={() => { focusGuideId.current = b.id; setReading(b); }}>
                                Click to Read
                              </Button>
                            )}

                            {canManageGuides && (
                              <>
                                <Button size="icon" variant="ghost" className="text-violet-200 hover:bg-surface-2/80 hover:text-foreground" onClick={() => { focusGuideId.current = b.id; setEditing(b); setShowEditor(true); }}>
                                  <Pencil className="size-4" />
                                </Button>
                                <Button size="icon" variant="ghost" className="text-violet-200 hover:bg-surface-2/80 hover:text-foreground" onClick={() => deleteBlog(b.id)}>
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
            </div>
            )}
          </TabsContent>

          {canManageCategories && <TabsContent value="categories" className="mt-6">
            <div
              className="relative rounded-2xl border border-border overflow-hidden p-4 sm:p-6 shadow-glow bg-cover bg-center"
              style={{ backgroundImage: `url(${installHero})` }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-background/70 via-background/50 to-surface/70 pointer-events-none" />
              <div className="relative">
            {canManageGuides && (
              <div className="mb-4 flex items-center gap-2">
                {addingCat ? (
                  <>
                    <Input
                      autoFocus
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      placeholder="New category name"
                      onKeyDown={(e) => { if (e.key === "Enter") addCategory(); if (e.key === "Escape") { setAddingCat(false); setNewCatName(""); } }}
                      className="max-w-xs bg-violet-950/50 border-violet-500/30 text-foreground placeholder:text-violet-300/50"
                    />
                    <Button onClick={addCategory} className="bg-gradient-primary text-primary-foreground hover:opacity-90">Add</Button>
                    <Button variant="ghost" className="text-violet-200 hover:bg-surface-2/80 hover:text-foreground" onClick={() => { setAddingCat(false); setNewCatName(""); }}>Cancel</Button>
                  </>
                ) : (
                  <Button onClick={() => setAddingCat(true)} className="bg-gradient-primary text-primary-foreground hover:opacity-90">
                    <Plus className="size-4 mr-1" /> Add Category
                  </Button>
                )}
                <span className="text-xs text-muted-foreground ml-2">Drag cards to reorder — order is saved for everyone.</span>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {categories.map((c) => (
                <div
                  key={c.id}
                  draggable={canManageGuides}
                  onDragStart={() => { dragCatId.current = c.id; }}
                  onDragOver={(e) => { if (canManageGuides) e.preventDefault(); }}
                  onDrop={(e) => {
                    if (!canManageGuides) return;
                    e.preventDefault();
                    if (dragCatId.current) reorderCategories(dragCatId.current, c.id);
                    dragCatId.current = null;
                  }}
                  className="rounded-2xl bg-surface/70 border border-border p-5 hover:border-violet-400 transition relative"
                >
                  {canManageGuides && (
                    <div className="absolute top-2 right-2 flex items-center gap-1">
                      <GripVertical className="size-4 text-muted-foreground cursor-grab" />
                      <button
                        onClick={(e) => { e.stopPropagation(); renameCategory(c.id, c.name); }}
                        className="text-muted-foreground hover:text-foreground p-1 rounded-md"
                        title="Rename category"
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteCategory(c.id); }}
                        className="text-muted-foreground hover:text-foreground p-1 rounded-md"
                        title="Delete category"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  )}
                  <button onClick={() => { setActiveCat(c.id); setTab("guides"); }} className="text-left w-full">
                    <div className="font-display font-semibold text-lg text-foreground">{c.name}</div>
                    <div className="text-sm text-muted-foreground mt-1">{counts[c.id] ?? 0} guide{(counts[c.id] ?? 0) === 1 ? "" : "s"}</div>
                  </button>
                </div>
              ))}
            </div>
              </div>
            </div>
          </TabsContent>}
        </Tabs>
      </div>

      {/* Unlocked guide viewer — link is short-lived and only issued after a valid passcode */}
      <Dialog open={!!unlocked} onOpenChange={(o) => { if (!o) { setUnlocked(null); scrollBackToGuide(); } }}>
        <DialogContent className="max-w-5xl h-[90vh] flex flex-col">
          {unlocked && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-2xl flex flex-wrap items-center gap-3 text-white">
                  <span className="flex-1">{unlocked.blog.title}</span>
                  <GuideAccessTimer blogId={unlocked.blog.id} expiresAt={accessExpiry.get(unlocked.blog.id)} />
                </DialogTitle>
              </DialogHeader>
              {unlocked.viewUrl ? (
                <iframe
                  src={`${unlocked.viewUrl}#toolbar=0&navpanes=0`}
                  title={unlocked.blog.title}
                  className="flex-1 w-full rounded-lg border border-border bg-white"
                />
              ) : (
                <div className="whitespace-pre-wrap text-sm leading-relaxed overflow-y-auto">
                  {unlocked.body || "This guide has no readable content yet."}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Reader */}

      <Dialog open={!!reading} onOpenChange={(o) => { if (!o) { setReading(null); scrollBackToGuide(); } }}>
        <DialogContent className={reading?.pdf_url ? "max-w-5xl h-[90vh] flex flex-col" : "max-w-2xl max-h-[85vh] overflow-y-auto"}>
          {reading && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-2xl flex items-center gap-3 text-white">
                  <span className="flex-1">{reading.title}</span>
                </DialogTitle>
              </DialogHeader>
              {reading.pdf_url ? (
                <iframe
                  src={`${reading.pdf_url}#toolbar=0&navpanes=0`}
                  title={reading.title}
                  className="flex-1 w-full rounded-lg border border-border bg-white"
                />
              ) : (
                <>
                  {reading.image_url && (
                    <img src={reading.image_url} alt={reading.title} className="max-h-48 md:max-h-64 w-auto mx-auto rounded-2xl border border-purple-500/30 object-contain" />
                  )}
                  <div className="flex flex-wrap gap-2">
                    <span className="text-xs px-2 py-1 rounded-md bg-primary/25 text-foreground font-semibold border border-primary/40">
                      {categories.find((c) => c.id === reading.category_id)?.name}
                    </span>
                    {reading.badge && (
                      <span className="text-xs px-2 py-1 rounded-md bg-accent/20 text-accent-foreground font-medium">{reading.badge}</span>
                    )}
                  </div>
                  {reading.excerpt && (
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-muted-foreground">{reading.excerpt}</p>
                      {extractGuideCode(reading.excerpt) && (
                        <CopyPasswordButton code={extractGuideCode(reading.excerpt)!} />
                      )}
                    </div>
                  )}
                  {reading.body && <div className="whitespace-pre-wrap text-sm leading-relaxed">{reading.body}</div>}
                </>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Fullscreen video player (view-only, short-lived signed link) */}
      <Dialog open={!!playingVideo} onOpenChange={(o) => { if (!o) setPlayingVideo(null); }}>
        <DialogContent className="max-w-6xl p-0 bg-black border-violet-500/30">
          {playingVideo?.video_url && (
            <>
              <DialogHeader className="px-4 pt-3 pb-2">
                <DialogTitle className="text-white font-display text-lg">{playingVideo.title}</DialogTitle>
              </DialogHeader>
              <SecureGuideVideo
                blogId={playingVideo.id}
                ref_={playingVideo.video_url}
                onEl={(el) => { videoElRef.current = el; }}
              />
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Editor */}
      <Dialog open={showEditor} onOpenChange={(o) => { if (!o) closeEditor(); }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
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
                <Label>Guide file (stored in the app — members need a passcode)</Label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    id="guide-file-input"
                    type="file"
                    accept=".pdf,.zip,image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) uploadGuideFile(f);
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={uploadingFile}
                    onClick={() => document.getElementById("guide-file-input")?.click()}
                  >
                    {uploadingFile ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Upload className="size-4 mr-1" />}
                    {editing.file_path ? "Replace file" : "Upload file"}
                  </Button>
                  {editing.file_path && (
                    <>
                      <span className="text-xs text-muted-foreground truncate max-w-[14rem]">
                        {editing.file_name ?? editing.file_path}
                      </span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        title="Remove file"
                        onClick={() =>
                          setEditing({ ...editing, file_path: null, file_name: null, file_mime: null, file_size: null })
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <div>
                <Label>Legacy PDF URL (optional — also passcode protected)</Label>
                <Input
                  value={editing.pdf_url ?? ""}
                  onChange={(e) => setEditing({ ...editing, pdf_url: e.target.value })}
                  placeholder="https://…/guide.pdf"
                />
              </div>

              <div>
                <Label>Video (optional — shows a play button on the card)</Label>
                <HeaderVideoUpload
                  value={editing.video_url}
                  onChange={(url) => setEditing({ ...editing, video_url: url })}
                  folder="install-guides"
                  secure
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
            <Button variant="ghost" onClick={closeEditor}>
              <X className="size-4 mr-1" /> Cancel
            </Button>
            <Button onClick={saveBlog}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Plays a guide video from a short-lived signed URL; downloads are disabled. */
function SecureGuideVideo({
  blogId,
  ref_,
  onEl,
}: {
  blogId: string;
  ref_: string;
  onEl?: (el: HTMLVideoElement | null) => void;
}) {
  const src = useGuideVideoUrl(ref_, blogId);

  if (!src) {
    return (
      <div className="w-full aspect-video grid place-items-center bg-black text-white/70">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  return (
    <video
      ref={(el) => {
        onEl?.(el);
        if (el) {
          el.play().catch(() => { /* autoplay may be blocked */ });
          const req = (el as any).requestFullscreen
            || (el as any).webkitRequestFullscreen
            || (el as any).webkitEnterFullscreen;
          if (req) {
            try { req.call(el); } catch { /* user gesture required on some browsers */ }
          }
        }
      }}
      src={src}
      controls
      controlsList="nodownload noremoteplayback noplaybackrate"
      disablePictureInPicture
      onContextMenu={(e) => e.preventDefault()}
      playsInline
      className="w-full max-h-[80vh] bg-black"
    />
  );
}
