import { createFileRoute, useNavigate, Outlet, useChildMatches } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { pruneStaleSportsGuides } from "@/lib/sports-guide-prune.functions";
import { findEarliestEventUtcMs } from "@/lib/parse-event-times";
import { Plus, Search, Pencil, Trash2, ImageIcon, GripVertical, X, ChevronDown, ChevronRight, ArrowUp, ArrowDown, ArrowLeft, Home } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import AdSenseSlot from "@/components/app/AdSenseSlot";
import sportsBgAsset from "@/assets/sports-bg.jpg.asset.json";
const sportsBg = sportsBgAsset.url;
const SG_FOCUS_KEY = "sports-guides-focus-id";


export const Route = createFileRoute("/_authenticated/_approved/sports-guides")({
  component: SportsGuidesRoute,
  validateSearch: (search: Record<string, unknown>): { cat?: string; sub?: string; reset?: string } => ({
    cat: typeof search.cat === "string" ? search.cat : undefined,
    sub: typeof search.sub === "string" ? search.sub : undefined,
    reset: typeof search.reset === "string" ? search.reset : undefined,
  }),
});

function SportsGuidesRoute() {
  const childMatches = useChildMatches();
  const { reset } = Route.useSearch();
  if (childMatches.length > 0) return <Outlet />;
  return <SportsGuidesPage key={reset ?? "default"} />;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SG_MIN_SEARCH = 3;


function guideSearchText(value: string | null | undefined) {
  if (!value) return "";
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value
    .replace(/<\s*br\s*\/?>/gi, " ")
    .replace(/<\s*\/(div|p|li|h[1-6])\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return textarea.value
    .replace(/\u00a0/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** A guide card and its category only appear when the body has a timed event. */
function guideHasListings(body: string | null | undefined) {
  if (!body) return false;
  return findEarliestEventUtcMs(body) !== null;
}

function matchesGuideSearch(text: string, query: string) {
  const haystack = text.toLocaleLowerCase();
  const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return terms.length > 0 && terms.every((term) => haystack.includes(term));
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

type Category = { id: string; name: string; slug: string; sort_order: number; parent_id?: string | null };
type Subcategory = { id: string; category_id: string; name: string; sort_order: number; is_default: boolean };
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
  refresh_notice?: string | null;
  not_guaranteed?: boolean | null;
  subcategory?: string | null;
};

function SportsGuidesPage() {
  const { isMod, user, hasAny } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { cat: catFromUrl, sub: subFromUrl, reset: resetFromUrl } = Route.useSearch();
  const canManageCategories = hasAny(["admin", "management", "staff"]);
  // Admin & management see every category, sub-category and guide — even ones
  // with no listings — so they can update guides that are currently empty.
  const showAllGuides = hasAny(["admin", "management"]);
  // Always open on Welcome with no category picked. Guides only appear once the
  // visitor clicks a category (returning from a guide uses the ?cat= param).
  const [tab, setTab] = useState<string>("welcome");
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // Search only kicks in from three letters up, and only looks at event
  // listings inside guide bodies (never guide names/descriptions).
  const searchQuery = search.trim();
  const activeSearch = searchQuery.length >= SG_MIN_SEARCH ? searchQuery : "";
  const [resultsOpen, setResultsOpen] = useState(true);
  const [subFilter, setSubFilter] = useState<string | null>(null);
  const [openSubcategoryPopupFor, setOpenSubcategoryPopupFor] = useState<string | null>(null);
  // Category whose sub-categories are shown in the centre dialog (null = closed).
  const [subDialogFor, setSubDialogFor] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState("");
  const [addingCat, setAddingCat] = useState(false);
  const [newSubName, setNewSubName] = useState<Record<string, string>>({});
  const [headingDialogOpen, setHeadingDialogOpen] = useState(false);
  const [headingName, setHeadingName] = useState("");
  const [headingPicks, setHeadingPicks] = useState<string[]>([]);
  const dragCatId = useRef<string | null>(null);
  const dragBlogId = useRef<string | null>(null);
  const skipDefaultSubOnce = useRef(false);
  const [draggingBlog, setDraggingBlog] = useState(false);
  const [dropCatId, setDropCatId] = useState<string | null>(null);
  const listingsTopRef = useRef<HTMLElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [showBackTop, setShowBackTop] = useState(false);
  // Which main category headings are open in the sidebar. Start closed on load.
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const toggleGroup = (id: string) =>
    setOpenGroups((cur) => (cur.includes(id) ? [] : [id]));


  // (sub-filter default effect moved below subsByCat declaration)

  // Persist UI state across screen swaps (route remounts).
  useEffect(() => { try { sessionStorage.setItem("sports-guides-active-tab", tab); } catch { /* ignore */ } }, [tab]);
  // The Guides tab must stay hidden until a category is picked — for everyone, including admins.
  useEffect(() => {
    if (!activeCat && tab === "guides") {
      setTab("welcome");
      try { sessionStorage.setItem("sports-guides-active-tab", "welcome"); } catch { /* ignore */ }
    }
  }, [activeCat, tab]);
  useEffect(() => {
    try {
      if (activeCat) sessionStorage.setItem("sports-guides-active-cat", activeCat);
      else sessionStorage.removeItem("sports-guides-active-cat");
    } catch { /* ignore */ }
  }, [activeCat]);

  // A rail reset remains in the URL for this visit and is authoritative over
  // any category state left by the previous mounted guide screen.
  useEffect(() => {
    if (resetFromUrl) {
      setTab("welcome");
      setActiveCat(null);
      setSubFilter(null);
      setSearch("");
      setOpenGroups([]);
      setSubDialogFor(null);
      setOpenSubcategoryPopupFor(null);
      scrollerRef.current?.scrollTo({ top: 0, behavior: "auto" });
      try {
        sessionStorage.removeItem("sports-guides-active-tab");
        sessionStorage.removeItem("sports-guides-active-cat");
      } catch { /* ignore */ }
    }
  }, [resetFromUrl]);

  // The Guides tab only exists once a category has been picked — never auto-select one.
  const handleTabChange = (value: string) => {
    if (value === "guides" && !activeCat) return;
    setTab(value);
    setOpenSubcategoryPopupFor(null);
  };


  const scrollCardsToTop = () => {
    // Only reset the guides list scroller. Never scroll the outer page —
    // that would drag the A–Z bar up into its pinned position on open.
    window.setTimeout(() => {
      scrollerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }, 0);
  };

  // Show/hide the back-to-top arrow based on scroll position of the page
  // scroller (the guides list scrolls inside its own container, not window).
  useEffect(() => {
    const el = scrollerRef.current;
    const onScroll = () => {
      const y = Math.max(el?.scrollTop ?? 0, window.scrollY, document.documentElement.scrollTop);
      setShowBackTop(y > 300);
    };
    onScroll();
    el?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el?.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);


  const queryKey = ["sports-guides-data", user?.id ?? "anon"] as const;
  const prune = useServerFn(pruneStaleSportsGuides);
  const dataQuery = useQuery({
    queryKey,
    queryFn: async () => {
      // Clear entries more than 10 hours past their start time before reading.
      try {
        await prune({});
      } catch {
        /* never block the guides list on the tidy-up */
      }
      const [{ data: cats }, { data: bs }, { data: subs }, { data: rs }, { data: prof }] = await Promise.all([
        supabase.from("sports_categories").select("*").order("sort_order"),
        supabase.from("sports_blogs").select("*").order("sort_order").order("created_at", { ascending: false }),
        supabase
          .from("sports_subcategories")
          .select("id, category_id, name, sort_order, is_default")
          .order("sort_order"),
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
        subcategories: (subs ?? []) as Subcategory[],
        reads: map,
        baselineAt: baseline,
      };
    },
    staleTime: 0,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const categories = dataQuery.data?.categories ?? [];
  const blogs = dataQuery.data?.blogs ?? [];
  const subcategories = dataQuery.data?.subcategories ?? [];
  const reads = dataQuery.data?.reads ?? {};
  const baselineAt = dataQuery.data?.baselineAt ?? null;
  const load = () => queryClient.invalidateQueries({ queryKey });

  // Guides without listings (empty or markup-only bodies) are invisible in the
  // member view: their cards, category rows and sub-category buttons all hide.
  const listingBlogs = useMemo(() => blogs.filter((b) => guideHasListings(b.body)), [blogs]);
  const visibleCatIds = useMemo(() => new Set(listingBlogs.map((b) => b.category_id)), [listingBlogs]);
  const listingCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const b of listingBlogs) m[b.category_id] = (m[b.category_id] ?? 0) + 1;
    return m;
  }, [listingBlogs]);
  const listingSubCounts = useMemo(() => {
    const m: Record<string, Record<string, number>> = {};
    for (const b of listingBlogs) {
      const sub = b.subcategory ?? "";
      if (!m[b.category_id]) m[b.category_id] = {};
      m[b.category_id][sub] = (m[b.category_id][sub] ?? 0) + 1;
    }
    return m;
  }, [listingBlogs]);

  // Two-level menu: main headings (no parent) and the categories grouped under them.
  const childrenByParent = useMemo(() => {
    const m: Record<string, Category[]> = {};
    for (const c of categories) {
      if (!c.parent_id) continue;
      if (!m[c.parent_id]) m[c.parent_id] = [];
      m[c.parent_id].push(c);
    }
    return m;
  }, [categories]);
  const topCategories = useMemo(() => categories.filter((c) => !c.parent_id), [categories]);
  /** Headings first, each followed by its own categories — used by the admin grid. */
  const orderedCategories = useMemo(
    () => {
      const out: Category[] = [];
      const walk = (c: Category) => {
        out.push(c);
        for (const kid of childrenByParent[c.id] ?? []) walk(kid);
      };
      topCategories.forEach(walk);
      return out;
    },
    [topCategories, childrenByParent],
  );
  /** A heading with categories under it never holds guides itself. */
  const isGroupHeading = (c: Category) => (childrenByParent[c.id]?.length ?? 0) > 0;
  const leafCategories = useMemo(
    () => orderedCategories.filter((c) => !isGroupHeading(c)),
    [orderedCategories, childrenByParent],
  );
  /**
   * Opening a heading shows its sub-categories in the centre dialog. The user
   * then picks one and is taken straight to that guide list.
   */
  const openHeading = (id: string) => {
    setOpenGroups([id]);
    setSubDialogFor(id);
  };


  // Keep the heading of the open category expanded. If the selected category has
  // just become a heading (categories were moved under it), drop down to its
  // first category so the guides list still shows something.
  useEffect(() => {
    if (!activeCat) return;
    const current = categories.find((c) => c.id === activeCat);
    if (!current) return;
    const kids = childrenByParent[activeCat] ?? [];
    if (kids.length) {
      setOpenGroups([activeCat]);
      setActiveCat(kids[0].id);
      return;
    }
    setOpenGroups(current.parent_id ? [current.parent_id] : []);
  }, [activeCat, categories, childrenByParent]);

  // Resolve catFromUrl as either category id or slug.
  const resolvedCatFromUrl = useMemo(() => {
    if (!catFromUrl) return null;
    const byId = categories.find((c) => c.id === catFromUrl);
    if (byId) return byId.id;
    const bySlug = categories.find((c) => c.slug === catFromUrl);
    return bySlug?.id ?? null;
  }, [catFromUrl, categories]);

  // Only honour an explicit category from the URL. Do NOT auto-select a default
  // category: the Guides tab must stay hidden until the visitor picks one on Welcome.
  useEffect(() => {
    if (!resetFromUrl && resolvedCatFromUrl) setActiveCat((cur) => cur ?? resolvedCatFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, resolvedCatFromUrl, resetFromUrl]);


  // If we arrived back here from new/edit/read, jump straight to the category.
  useEffect(() => {
    if (!resetFromUrl && catFromUrl && resolvedCatFromUrl) {
      setActiveCat(resolvedCatFromUrl);
      setTab("guides");
      if (subFromUrl !== undefined) {
        skipDefaultSubOnce.current = true;
        setSubFilter(subFromUrl || null);
      }
      // Consume the URL params so future category clicks use defaults.
      // resetScroll: false — without it the router snaps the page back to the
      // top and wipes out the return-to-card scroll.
      navigate({ to: "/sports-guides", search: {}, replace: true, resetScroll: false });
    }
  }, [catFromUrl, resolvedCatFromUrl, subFromUrl, resetFromUrl, navigate]);

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
    for (const b of listingBlogs) if (isUnread(b)) m[b.category_id] = (m[b.category_id] ?? 0) + 1;
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingBlogs, reads, baselineAt]);

  const unreadSubCounts = useMemo(() => {
    const m: Record<string, Record<string, number>> = {};
    for (const b of listingBlogs) {
      if (!isUnread(b)) continue;
      const sub = b.subcategory ?? "";
      if (!m[b.category_id]) m[b.category_id] = {};
      m[b.category_id][sub] = (m[b.category_id][sub] ?? 0) + 1;
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingBlogs, reads, baselineAt]);

  // Unread count including every nested sub-category below a category, so a
  // parent row still flags an unread guide that lives further down the tree.
  const unreadDeep = useMemo(() => {
    const kidsOf: Record<string, string[]> = {};
    for (const c of categories) {
      if (!c.parent_id) continue;
      if (!kidsOf[c.parent_id]) kidsOf[c.parent_id] = [];
      kidsOf[c.parent_id].push(c.id);
    }
    const memo: Record<string, number> = {};
    const walk = (id: string, seen: Set<string>): number => {
      if (memo[id] !== undefined) return memo[id];
      if (seen.has(id)) return 0;
      seen.add(id);
      let total = unreadCounts[id] ?? 0;
      for (const kid of kidsOf[id] ?? []) total += walk(kid, seen);
      memo[id] = total;
      return total;
    };
    for (const c of categories) walk(c.id, new Set());
    return memo;
  }, [categories, unreadCounts]);

  const subsByCat = useMemo(() => {
    const m: Record<string, Subcategory[]> = {};
    for (const s of subcategories) {
      if (!m[s.category_id]) m[s.category_id] = [];
      m[s.category_id].push(s);
    }
    return m;
  }, [subcategories]);

  /**
   * Category navigation is deliberately staged. A category with another set of
   * choices opens that set first; only the final choice opens the guide list.
   */
  const chooseCategory = (categoryId: string) => {
    const categoryChildren = childrenByParent[categoryId] ?? [];
    const guideSubcategories = subsByCat[categoryId] ?? [];
    if (categoryChildren.length > 0 || guideSubcategories.length > 0) {
      setSubDialogFor(categoryId);
      setOpenGroups([categoryId]);
      return;
    }
    setSubDialogFor(null);
    setActiveCat(categoryId);
    setTab("guides");
    scrollCardsToTop();
  };

  // When switching category, default to that category's default sub-category
  // (falling back to the first sub-category only when no default is set).
  useEffect(() => {
    if (!activeCat) { setSubFilter(null); return; }
    if (skipDefaultSubOnce.current) { skipDefaultSubOnce.current = false; return; }
    const list = subsByCat[activeCat] ?? [];
    // Only default to a sub-category that actually holds listings.
    const withListings = list.filter((s) => (listingSubCounts[activeCat]?.[s.name] ?? 0) > 0);
    const def = withListings.find((s) => s.is_default);
    setSubFilter(def?.name ?? withListings[0]?.name ?? null);
  }, [activeCat, subsByCat, listingSubCounts]);

  const filtered = useMemo(() => {
    const q = activeSearch;
    return listingBlogs.filter((b) => {
      if (!q && activeCat && b.category_id !== activeCat) return false;
      if (!q && activeCat && subsByCat[activeCat]?.length && subFilter && b.subcategory !== subFilter) return false;
      if (!q) return true;
      // Events only — guide titles/descriptions are not searched.
      return matchesGuideSearch(guideSearchText(b.body), q);
    });
  }, [listingBlogs, activeCat, activeSearch, subFilter, subsByCat]);

  // A–Z jump map: first visible guide whose title starts with each letter.
  const azMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const b of filtered) {
      const letter = (b.title?.trim()[0] ?? "").toUpperCase();
      if (letter >= "A" && letter <= "Z" && !m[letter]) m[letter] = b.id;
    }
    return m;
  }, [filtered]);

  // Letters that have at least one UNREAD guide in the current filtered view.
  const azUnread = useMemo(() => {
    const s = new Set<string>();
    for (const b of filtered) {
      if (!isUnread(b)) continue;
      const letter = (b.title?.trim()[0] ?? "").toUpperCase();
      if (letter >= "A" && letter <= "Z") s.add(letter);
    }
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, reads, baselineAt]);

  const jumpToLetter = (letter: string) => {
    const id = azMap[letter];
    if (!id) return;
    const targetIndex = filtered.findIndex((b) => b.id === id);
    if (targetIndex < 0) return;
    window.setTimeout(() => {
      document
        .querySelector<HTMLElement>(`[data-guide-id="${id}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  };

  // Remember which guide the user opened (read/edit) so coming back from the
  // editor or reader returns to that card instead of the top of the list.
  const rememberGuide = (id: string) => {
    try { sessionStorage.setItem(SG_FOCUS_KEY, id); } catch { /* ignore */ }
  };

  // Coming back from the editor/reader, always show the guide we came from —
  // even when its sub-category isn't the category's default (or is blank),
  // which previously filtered the card out of the list entirely.
  const focusTargeted = useRef(false);
  useEffect(() => {
    if (focusTargeted.current || !blogs.length) return;
    let id: string | null = null;
    try { id = sessionStorage.getItem(SG_FOCUS_KEY); } catch { /* ignore */ }
    if (!id) return;
    const target = blogs.find((b) => b.id === id);
    if (!target) return;
    focusTargeted.current = true;
    setTab("guides");
    setActiveCat(target.category_id);
    skipDefaultSubOnce.current = true;
    setSubFilter(target.subcategory || null);
  }, [blogs]);

  // Return-to-card: while the focus key is set and the target card is actually
  // rendered (guides tab + its category/sub-section applied), scroll it into
  // view on every pass until it sticks. No timers — earlier versions scheduled
  // a scroll that was lost when the list re-filtered right after mount or the
  // router reset the scroll after the navigation back from the editor.
  useEffect(() => {
    let id: string | null = null;
    try { id = sessionStorage.getItem(SG_FOCUS_KEY); } catch { /* ignore */ }
    if (!id || tab !== "guides") return;
    if (!filtered.some((b) => b.id === id)) return;
    const el = document.querySelector<HTMLElement>(`[data-guide-id="${id}"]`);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const inView = rect.top >= 0 && rect.bottom <= window.innerHeight;
    if (!inView) el.scrollIntoView({ behavior: "auto", block: "center" });
    // Keep the key for a few more passes so late layout shifts (images loading)
    // can't strand the card off-screen; clear once it's comfortably centred.
    if (inView) {
      try { sessionStorage.removeItem(SG_FOCUS_KEY); } catch { /* ignore */ }
    }
  }, [filtered, tab, blogs]);

  // Search event listings across every sports guide category (guide names and
  // descriptions are deliberately excluded) and show a snippet of the match.
  const searchResults = useMemo(() => {
    const q = activeSearch;
    if (!q) return [] as { blog: Blog; snippet: string }[];
    const out: { blog: Blog; snippet: string }[] = [];
    for (const b of listingBlogs) {
      const h = guideSearchText(b.body);
      if (!matchesGuideSearch(h, q)) continue;
      const firstTerm = q.toLocaleLowerCase().split(/\s+/).find(Boolean) ?? "";
      const i = Math.max(0, h.toLocaleLowerCase().indexOf(firstTerm));
      const start = Math.max(0, i - 40);
      const end = Math.min(h.length, i + firstTerm.length + 100);
      const snippet = (start > 0 ? "…" : "") + h.slice(start, end) + (end < h.length ? "…" : "");
      if (snippet.trim()) out.push({ blog: b, snippet });
    }
    return out;
  }, [listingBlogs, activeSearch]);

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

  const renameCategory = async (id: string, currentName: string) => {
    const next = prompt("Rename category", currentName)?.trim();
    if (!next || next === currentName) return;
    const dupe = categories.some((c) => c.id !== id && c.name.toLowerCase() === next.toLowerCase());
    if (dupe) return toast.error("A category with that name already exists");
    const { error } = await supabase.from("sports_categories").update({ name: next }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Category renamed");
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

  const addSubcategory = async (categoryId: string) => {
    const name = (newSubName[categoryId] ?? "").trim();
    if (!name) return;
    const existing = subsByCat[categoryId] ?? [];
    const nextOrder = ((existing[existing.length - 1]?.sort_order ?? 0) as number) + 10;
    const { error } = await supabase
      .from("sports_subcategories")
      .insert({ category_id: categoryId, name, sort_order: nextOrder, is_default: existing.length === 0 });
    if (error) return toast.error(error.message);
    setNewSubName((m) => ({ ...m, [categoryId]: "" }));
    toast.success("Sub-category added");
    load();
  };

  const deleteSubcategory = async (id: string) => {
    if (!confirm("Delete this sub-category?")) return;
    const { error } = await supabase.from("sports_subcategories").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Sub-category deleted");
    load();
  };

  const renameSubcategory = async (categoryId: string, subId: string, currentName: string) => {
    const next = prompt("Rename sub-category", currentName)?.trim();
    if (!next || next === currentName) return;
    const dupe = (subsByCat[categoryId] ?? []).some(
      (s) => s.id !== subId && s.name.toLowerCase() === next.toLowerCase(),
    );
    if (dupe) return toast.error("A sub-category with that name already exists");
    const { error } = await supabase
      .from("sports_subcategories")
      .update({ name: next })
      .eq("id", subId);
    if (error) return toast.error(error.message);
    // Keep existing blogs in sync so the filter pills still match.
    const { error: updErr } = await supabase
      .from("sports_blogs")
      .update({ subcategory: next })
      .eq("category_id", categoryId)
      .eq("subcategory", currentName);
    if (updErr) return toast.error(updErr.message);
    toast.success("Sub-category renamed");
    load();
  };

  const setDefaultSubcategory = async (categoryId: string, subId: string) => {
    // Clear any existing default first (unique partial index allows only one).
    const { error: clearErr } = await supabase
      .from("sports_subcategories")
      .update({ is_default: false })
      .eq("category_id", categoryId)
      .eq("is_default", true);
    if (clearErr) return toast.error(clearErr.message);
    const { error } = await supabase
      .from("sports_subcategories")
      .update({ is_default: true })
      .eq("id", subId);
    if (error) return toast.error(error.message);
    toast.success("Default sub-category updated");
    load();
  };

  const moveSubcategory = async (categoryId: string, subId: string, dir: -1 | 1) => {
    const list = [...(subsByCat[categoryId] ?? [])];
    const idx = list.findIndex((s) => s.id === subId);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= list.length) return;
    [list[idx], list[next]] = [list[next], list[idx]];
    const updated = list.map((s, i) => ({ ...s, sort_order: (i + 1) * 10 }));
    queryClient.setQueryData<typeof dataQuery.data>(queryKey, (prev) => {
      if (!prev) return prev;
      const otherSubs = prev.subcategories.filter((s) => s.category_id !== categoryId);
      return { ...prev, subcategories: [...otherSubs, ...updated] };
    });
    const { error } = await supabase
      .from("sports_subcategories")
      .upsert(updated.map((s) => ({ id: s.id, category_id: s.category_id, name: s.name, sort_order: s.sort_order, is_default: s.is_default })));
    if (error) toast.error(error.message);
  };

  const reorderCategories = async (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const from = categories.find((c) => c.id === fromId);
    const to = categories.find((c) => c.id === toId);
    // Only reorder within the same level (same heading, or both headings).
    if (!from || !to || (from.parent_id ?? null) !== (to.parent_id ?? null)) return;
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

  /** Add a sub-category directly beneath a main category (turns it into a heading). */
  const addChildCategory = async (parentId: string) => {
    const name = prompt("New sub-category name")?.trim();
    if (!name) return;
    if (categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      return toast.error("A category with that name already exists");
    }
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${Date.now().toString(36)}`;
    const siblings = childrenByParent[parentId] ?? [];
    const nextOrder = (siblings[siblings.length - 1]?.sort_order ?? categories[categories.length - 1]?.sort_order ?? 0) + 10;
    const { error } = await supabase
      .from("sports_categories")
      .insert({ name, slug, sort_order: nextOrder, parent_id: parentId } as never);
    if (error) return toast.error(error.message);
    setOpenGroups((cur) => (cur.includes(parentId) ? cur : [...cur, parentId]));
    toast.success("Sub-category added");
    load();
  };

  /** Open the new-heading dialog (name + pick which categories file under it). */
  const openHeadingDialog = () => {
    setHeadingName("");
    setHeadingPicks([]);
    setHeadingDialogOpen(true);
  };

  /** Create a brand-new main heading and file the picked categories under it. */
  const addTopCategory = async () => {
    const name = headingName.trim();
    if (!name) return toast.error("Enter a heading name");
    if (categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      return toast.error("A category with that name already exists");
    }
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${Date.now().toString(36)}`;
    const nextOrder = (categories[categories.length - 1]?.sort_order ?? 0) + 10;
    const { data: created, error } = await supabase
      .from("sports_categories")
      .insert({ name, slug, sort_order: nextOrder } as never)
      .select("id")
      .single();
    if (error) return toast.error(error.message);
    const newId = (created as { id: string } | null)?.id;
    if (newId && headingPicks.length > 0) {
      const { error: moveErr } = await supabase
        .from("sports_categories")
        .update({ parent_id: newId } as never)
        .in("id", headingPicks);
      if (moveErr) return toast.error(moveErr.message);
      setOpenGroups((cur) => (cur.includes(newId) ? cur : [...cur, newId]));
    }
    setHeadingDialogOpen(false);
    toast.success(headingPicks.length > 0 ? `Heading added with ${headingPicks.length} categor${headingPicks.length === 1 ? "y" : "ies"}` : "Heading added");
    load();
  };

  /** Move a category under a main heading, or back out to the top level. */
  const setCategoryParent = async (id: string, parentId: string | null) => {
    const { error } = await supabase.from("sports_categories").update({ parent_id: parentId } as never).eq("id", id);
    if (error) return toast.error(error.message);
    // Keep the moved category selected and its new heading open so the guides
    // list keeps showing the category you just moved.
    setOpenGroups(parentId ? [parentId] : []);
    setActiveCat(id);
    setTab("guides");
    toast.success(parentId ? "Category grouped" : "Category moved to top level");
    load();
  };


  /**
   * Dropping one category onto another.
   * - Two main categories: always reorder (so you can drag a category above
   *   Football or any other heading).
   * - A sub-category dropped on a main category: file it under that category.
   */
  const dropCategoryOnCategory = (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;
    const dragged = categories.find((c) => c.id === draggedId);
    const target = categories.find((c) => c.id === targetId);
    if (!dragged || !target) return;
    const draggedParent = dragged.parent_id ?? null;
    const targetParent = target.parent_id ?? null;
    if (draggedParent && !targetParent && !isGroupHeading(dragged) && draggedParent !== target.id) {
      void setCategoryParent(draggedId, target.id);
      return;
    }
    if (draggedParent !== targetParent) return;
    void reorderCategories(draggedId, targetId);
  };



  const reorderBlogs = async (fromId: string, toId: string) => {
    if (fromId === toId || !activeCat) return;
    // Swap two blogs within the active category — swap their sort_order so
    // dragging from page 2 onto a card on page 1 exchanges their positions.
    const inCat = blogs.filter((b) => b.category_id === activeCat);
    const others = blogs.filter((b) => b.category_id !== activeCat);
    const fromIdx = inCat.findIndex((b) => b.id === fromId);
    const toIdx = inCat.findIndex((b) => b.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const swapped = [...inCat];
    [swapped[fromIdx], swapped[toIdx]] = [swapped[toIdx], swapped[fromIdx]];
    const updated = swapped.map((b, i) => ({ ...b, sort_order: (i + 1) * 10 }));
    queryClient.setQueryData<typeof dataQuery.data>(queryKey, (prev) => prev ? { ...prev, blogs: [...others, ...updated] } : prev);
    await Promise.all(
      updated.map((b) => supabase.from("sports_blogs").update({ sort_order: b.sort_order }).eq("id", b.id))
    );
  };

  /** Drag a guide card onto a category/heading in the sidebar to file it there. */
  const moveBlogToCategory = async (blogId: string, categoryId: string) => {
    const blog = blogs.find((b) => b.id === blogId);
    if (!blog || blog.category_id === categoryId) return;
    const subs = subsByCat[categoryId] ?? [];
    const nextSub = subs.some((s) => s.name === blog.subcategory)
      ? blog.subcategory
      : (subs.find((s) => s.is_default)?.name ?? subs[0]?.name ?? null);
    queryClient.setQueryData<typeof dataQuery.data>(queryKey, (prev) =>
      prev
        ? {
            ...prev,
            blogs: prev.blogs.map((b) =>
              b.id === blogId ? { ...b, category_id: categoryId, subcategory: nextSub } : b,
            ),
          }
        : prev,
    );
    const { error } = await supabase
      .from("sports_blogs")
      .update({ category_id: categoryId, subcategory: nextSub })
      .eq("id", blogId);
    if (error) { toast.error(error.message); load(); return; }
    const name = categories.find((c) => c.id === categoryId)?.name ?? "category";
    toast.success(`Moved to ${name}`);
  };

  /** Drop-target props that accept a dragged guide card for a given category. */
  const guideDropProps = (categoryId: string) =>
    isMod
      ? {
          onDragOver: (e: ReactDragEvent) => {
            if (!dragBlogId.current) return;
            e.preventDefault();
            setDropCatId(categoryId);
          },
          onDragLeave: () => setDropCatId((cur) => (cur === categoryId ? null : cur)),
          onDrop: (e: ReactDragEvent) => {
            if (!dragBlogId.current) return;
            e.preventDefault();
            e.stopPropagation();
            void moveBlogToCategory(dragBlogId.current, categoryId);
            dragBlogId.current = null;
            setDraggingBlog(false);
            setDropCatId(null);
          },
        }
      : {};



  const renderBlogCard = (b: Blog) => (
    <article
      key={b.id}
      data-guide-id={b.id}
      draggable={isMod}
      onDragStart={() => { dragBlogId.current = b.id; setDraggingBlog(true); }}
      onDragEnd={() => { dragBlogId.current = null; setDraggingBlog(false); }}
      onDragOver={(e) => { if (isMod) e.preventDefault(); }}
      onDrop={(e) => {
        if (!isMod) return;
        e.preventDefault();
        if (dragBlogId.current) reorderBlogs(dragBlogId.current, b.id);
        dragBlogId.current = null;
        setDraggingBlog(false);
      }}
      className={`rounded-2xl bg-purple-950/50 border overflow-hidden flex flex-col group hover:shadow-[0_0_30px_-10px_rgba(217,70,239,0.6)] transition-all ${isUnread(b) ? "border-fuchsia-500/70 shadow-[0_0_20px_-10px_rgba(232,121,249,0.8)]" : "border-purple-500/30 hover:border-fuchsia-500/60"}`}
    >
      <div className="aspect-[16/10] bg-purple-900/50 relative overflow-hidden">
        {b.image_url ? (
          <>
            <img src={b.image_url} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-60" />
            <div className="absolute inset-0 bg-purple-950/35" />
            <img src={b.image_url} alt={b.title} className="relative z-10 w-full h-full object-contain group-hover:scale-[1.02] transition-transform" />
          </>
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
        {isMod && !b.published && (
          <div className="absolute bottom-2 right-2 rounded-md border border-amber-400/60 bg-amber-950/90 px-2 py-1 text-[10px] font-bold uppercase text-amber-100 shadow-lg">
            Draft · not public
          </div>
        )}
      </div>
      <div className="p-4 flex-1 flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <span className="text-xs px-2 py-1 rounded-md bg-fuchsia-500/30 text-white font-semibold border border-fuchsia-400/50">
            {categories.find((c) => c.id === b.category_id)?.name}
          </span>
          {b.badge && (
            <span className="text-xs px-2 py-1 rounded-md bg-violet-500/20 text-violet-200 font-medium border border-violet-500/30">{b.badge}</span>
          )}
        </div>
        <h3 className="font-display font-semibold text-lg leading-snug text-purple-50 flex items-center gap-2">
          {isUnread(b) && (
            <span className="size-2 rounded-full bg-fuchsia-400 shadow-[0_0_8px_rgba(232,121,249,0.9)] shrink-0 animate-pulse" title="Unread" />
          )}
          <span>{b.title}</span>
        </h3>
        <div className="text-[11px] text-purple-300/70">
          Last edited:{" "}
          <time dateTime={b.updated_at ?? b.created_at}>
            {new Date(b.updated_at ?? b.created_at).toLocaleString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
        </div>
        {b.refresh_notice && (
          <div className="rounded-md border border-amber-400/50 bg-amber-500/15 text-amber-100 px-3 py-2 text-xs leading-snug">
            {b.refresh_notice}
          </div>
        )}
        {b.not_guaranteed && (
          <div className="rounded-md border border-red-400/50 bg-red-500/15 text-red-100 px-3 py-2 text-xs leading-snug">
            These are not guaranteed and no reports allowed to source.
          </div>
        )}
        {b.excerpt && <p className="text-sm text-purple-200/70 line-clamp-2">{b.excerpt}</p>}
        <div className="mt-auto pt-3 flex items-center gap-2">
          <Button size="sm" className="flex-1 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white border-0" onClick={() => { rememberGuide(b.id); navigate({ to: "/sports-guides/read/$id", params: { id: b.id }, search: { cat: b.category_id } }); }}>Click to Read</Button>
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
              <Button size="icon" variant="ghost" className="text-purple-200 hover:text-white hover:bg-purple-800/60" onClick={() => { rememberGuide(b.id); openEdit(b.id); }}>
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
  );

  const categoryNav = (
    <>
              <aside className="relative z-20 rounded-2xl bg-purple-950/50 border border-purple-500/30 p-4 h-fit backdrop-blur">
                <div className="flex items-center justify-between mb-3 px-2 gap-2">
                  <h3 className="font-display font-semibold text-purple-100 flex items-center gap-1">
                    Categories
                    {canManageCategories && (
                      <button
                        type="button"
                        onClick={openHeadingDialog}
                        title="Add heading"
                        className="p-1 rounded-md text-purple-200/70 hover:text-white hover:bg-fuchsia-600/60"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    )}
                  </h3>
                  {user && listingBlogs.some(isUnread) && (
                    <button
                      onClick={async () => {
                        const unread = listingBlogs.filter(isUnread);
                        if (!unread.length) return;
                        const nowIso = new Date().toISOString();
                        queryClient.setQueryData<typeof dataQuery.data>(queryKey, (prev) => {
                          if (!prev) return prev;
                          const next = { ...prev.reads };
                          for (const b of unread) next[b.id] = nowIso;
                          return { ...prev, reads: next };
                        });
                        const { error } = await supabase
                          .from("sports_blog_reads")
                          .upsert(
                            unread.map((b) => ({ user_id: user.id, blog_id: b.id, read_at: nowIso })),
                            { onConflict: "user_id,blog_id" },
                          );
                        if (error) { toast.error(error.message); load(); return; }
                        toast.success("Marked all as read");
                      }}
                      className="text-[10px] font-semibold px-2 py-1 rounded-md bg-fuchsia-600/80 hover:bg-fuchsia-500 text-white shadow-sm transition-colors"
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                {isMod && draggingBlog && (
                  <div className="mb-2 rounded-lg border border-emerald-400/50 bg-emerald-500/15 px-3 py-2 text-[11px] font-semibold text-emerald-100">
                    Drop the guide on a heading or category to move it there
                  </div>
                )}
                <div className={subDialogFor ? "hidden" : "space-y-1"}>
                  {topCategories.map((top) => {
                    const kids = childrenByParent[top.id] ?? [];
                    // Only show a row when it (or, for a heading, one of its
                    // categories) holds a guide with listings.
                    const visibleKids = kids.filter((k) => visibleCatIds.has(k.id));
                    if (visibleKids.length === 0 && !visibleCatIds.has(top.id)) return null;
                    const heading = kids.length > 0;
                    const open = openGroups.includes(top.id);
                    const headingUnread = heading
                      ? kids.reduce((sum, k) => sum + (unreadDeep[k.id] ?? 0), 0)
                      : unreadDeep[top.id] ?? 0;
                    const renderRow = (c: Category) => {
                      const active = c.id === activeCat;
                      const unread = unreadDeep[c.id] ?? 0;
                      return (
                        <div
                          key={c.id}
                          draggable={isMod}
                          onDragStart={() => { dragCatId.current = c.id; }}
                          onDragOver={(e) => {
                            if (!isMod) return;
                            e.preventDefault();
                            if (dragBlogId.current || dragCatId.current) setDropCatId(c.id);
                          }}
                          onDragLeave={() => setDropCatId((cur) => (cur === c.id ? null : cur))}
                          onDrop={(e) => {
                            if (!isMod) return;
                            e.preventDefault();
                            if (dragBlogId.current) {
                              void moveBlogToCategory(dragBlogId.current, c.id);
                              dragBlogId.current = null;
                              setDraggingBlog(false);
                              setDropCatId(null);
                              return;
                            }
                            if (dragCatId.current) dropCategoryOnCategory(dragCatId.current, c.id);
                            dragCatId.current = null;
                            setDropCatId(null);
                          }}
                          className={`group flex items-center gap-1 px-1 rounded-lg ${dropCatId === c.id ? "ring-2 ring-emerald-400 bg-emerald-500/20" : ""} ${active ? "bg-gradient-to-r from-violet-600 to-blue-600 text-white shadow-md shadow-purple-900/40" : "text-purple-100/80 hover:bg-purple-800/40"}`}
                        >
                          {isMod && (
                            <GripVertical className="size-3.5 opacity-40 group-hover:opacity-80 cursor-grab shrink-0" />
                          )}
                          <button
                            onClick={() => chooseCategory(c.id)}
                            className="flex-1 flex items-center justify-between px-2 py-2 text-sm text-left"
                          >
                            <span className="flex items-center gap-2">
                              {unread > 0 && (
                                <span className="size-2 rounded-full bg-fuchsia-400 shadow-[0_0_8px_rgba(232,121,249,0.9)]" />
                              )}
                              {c.name}
                            </span>
                            <span className="flex items-center gap-1">
                              {unread > 0 && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-fuchsia-500 text-white font-semibold">{unread}</span>
                              )}
                            </span>
                           </button>
                          {canManageCategories && !c.parent_id && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); addChildCategory(c.id); }}
                              title="Add sub-category"
                              className="shrink-0 mr-1 p-1 rounded-md text-purple-200/70 hover:text-white hover:bg-fuchsia-600/60"
                            >
                              <Plus className="size-3.5" />
                            </button>
                          )}
                          {canManageCategories && c.parent_id && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setCategoryParent(c.id, null); }}
                              title="Make this a heading (move to top level)"
                              className="shrink-0 mr-1 p-1 rounded-md text-purple-200/70 hover:text-white hover:bg-fuchsia-600/60"
                            >
                              <ArrowUp className="size-3.5" />
                            </button>
                          )}
                         </div>
                       );
                     };

                    if (!heading) return renderRow(top);

                    return (
                      <div key={top.id} className="space-y-1">
                        <div
                          draggable={isMod}
                          onDragStart={() => { dragCatId.current = top.id; }}
                          onDragOver={(e) => {
                            if (!isMod) return;
                            e.preventDefault();
                            if (dragBlogId.current || dragCatId.current) setDropCatId(top.id);
                          }}
                          onDragLeave={() => setDropCatId((cur) => (cur === top.id ? null : cur))}
                          onDrop={(e) => {
                            if (!isMod) return;
                            e.preventDefault();
                            if (dragBlogId.current) {
                              // Headings hold sub-categories, so file the guide in the
                              // heading's default (or first) sub-category and open it.
                              const target = kids.find((k) => k.id === activeCat) ?? kids[0];
                              if (target) {
                                void moveBlogToCategory(dragBlogId.current, target.id);
                                setOpenGroups((cur) => (cur.includes(top.id) ? cur : [top.id]));
                              }
                              dragBlogId.current = null;
                              setDraggingBlog(false);
                              setDropCatId(null);
                              return;
                            }
                            if (dragCatId.current) dropCategoryOnCategory(dragCatId.current, top.id);
                            dragCatId.current = null;
                            setDropCatId(null);
                          }}
                          className={`group flex items-center gap-1 px-1 rounded-lg ${dropCatId === top.id ? "ring-2 ring-emerald-400 bg-emerald-500/20" : ""} ${open ? "bg-purple-800/60 text-white ring-1 ring-fuchsia-400/40" : "text-purple-100/80 hover:bg-purple-800/40"}`}
                        >
                          {isMod && (
                            <GripVertical className="size-3.5 opacity-40 group-hover:opacity-80 cursor-grab shrink-0" />
                          )}
                          <button
                            onClick={() => openHeading(top.id)}
                            aria-expanded={open}
                            className="flex-1 flex items-center justify-between px-2 py-2 text-sm text-left font-semibold"
                          >
                            <span className="flex items-center gap-2">
                              {headingUnread > 0 && (
                                <span className="size-2 rounded-full bg-fuchsia-400 shadow-[0_0_8px_rgba(232,121,249,0.9)]" />
                              )}
                              {top.name}
                            </span>
                            {headingUnread > 0 && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-fuchsia-500 text-white font-semibold">{headingUnread}</span>
                            )}
                           </button>
                          {canManageCategories && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); addChildCategory(top.id); }}
                              title="Add sub-category"
                              className="shrink-0 mr-1 p-1 rounded-md text-purple-200/70 hover:text-white hover:bg-fuchsia-600/60"
                            >
                              <Plus className="size-3.5" />
                            </button>
                          )}
                         </div>
                       </div>
                     );
                   })}
                </div>

              {subDialogFor && (
                <div>
                  {(() => {
                  const parent = categories.find((c) => c.id === subDialogFor);
                  const children = childrenByParent[subDialogFor ?? ""] ?? [];
                  const guideSubcategories = subsByCat[subDialogFor ?? ""] ?? [];
                  const grandParent = parent?.parent_id ? categories.find((c) => c.id === parent.parent_id) : null;
                  let root = parent;
                  while (root?.parent_id) root = categories.find((c) => c.id === root!.parent_id);
                  return (
                    <>
                      <div className="mb-2 flex items-center gap-1 text-purple-100">
                        <button
                          type="button"
                          onClick={() => setSubDialogFor(grandParent?.id ?? null)}
                          title="Back"
                          aria-label="Back"
                          className="shrink-0 rounded-md p-1.5 text-fuchsia-100 hover:bg-fuchsia-600/40"
                        >
                          <ArrowLeft className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setSubDialogFor(root && root.id !== parent?.id ? root.id : null)}
                          title={root && root.id !== parent?.id ? `Back to ${root.name}` : "All categories"}
                          aria-label="Home"
                          className="shrink-0 rounded-md p-1.5 text-fuchsia-100 hover:bg-fuchsia-600/40"
                        >
                          <Home className="size-4" />
                        </button>
                        <span className="min-w-0 flex-1 truncate px-1 text-sm font-bold">{parent?.name ?? "Sub-categories"}</span>
                        {canManageCategories && parent && (
                          <button
                            type="button"
                            onClick={() => addChildCategory(parent.id)}
                            title="Add sub-category"
                            className="p-1 rounded-md text-purple-200/70 hover:text-white hover:bg-fuchsia-600/60"
                          >
                            <Plus className="size-4" />
                          </button>
                        )}
                      </div>
                      <div className="grid max-h-[70vh] gap-1 overflow-y-auto">

                        {children.filter((child) => visibleCatIds.has(child.id)).map((child) => {
                          const active = child.id === activeCat;
                          const unread = unreadDeep[child.id] ?? 0;
                          return (
                            <div
                              key={child.id}
                              draggable={isMod}
                              onDragStart={() => { dragCatId.current = child.id; }}
                              onDragEnd={() => { dragCatId.current = null; setDropCatId(null); }}
                              {...guideDropProps(child.id)}
                              onDragOver={(e) => {
                                if (!isMod) return;
                                if (!dragBlogId.current && !dragCatId.current) return;
                                e.preventDefault();
                                setDropCatId(child.id);
                              }}
                              onDrop={(e) => {
                                if (!isMod) return;
                                e.preventDefault();
                                e.stopPropagation();
                                if (dragBlogId.current) {
                                  void moveBlogToCategory(dragBlogId.current, child.id);
                                  dragBlogId.current = null;
                                  setDraggingBlog(false);
                                } else if (dragCatId.current) {
                                  dropCategoryOnCategory(dragCatId.current, child.id);
                                  dragCatId.current = null;
                                }
                                setDropCatId(null);
                              }}
                              className={`group flex items-center gap-1 rounded-lg px-1 transition-colors ${dropCatId === child.id ? "ring-2 ring-emerald-400 bg-emerald-500/20" : ""} ${active ? "bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white shadow-md shadow-fuchsia-950/40" : "text-purple-100/80 hover:bg-purple-800/50"}`}
                            >
                              {isMod && (
                                <GripVertical className="size-3.5 shrink-0 cursor-grab opacity-40 group-hover:opacity-80" />
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  chooseCategory(child.id);
                                }}
                                className="flex flex-1 flex-col items-stretch gap-1.5 px-2 py-2.5 text-left text-sm"
                              >
                                <span className="flex min-w-0 items-start gap-2">
                                  {unread > 0 && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-fuchsia-300" />}
                                  <span className="min-w-0 break-words leading-snug">{child.name}</span>
                                </span>
                                <span className="flex flex-wrap items-center gap-1.5">
                                  {(() => {
                                    const subCount = (childrenByParent[child.id]?.length ?? 0) + (subsByCat[child.id]?.length ?? 0);
                                    return subCount > 1 ? (
                                      <span className="rounded-full border border-fuchsia-400/50 bg-fuchsia-600/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-fuchsia-100">View more categories</span>
                                    ) : (
                                      <span className="rounded-full border border-purple-400/40 bg-purple-800/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-purple-100/90">Click to read guides</span>
                                    );
                                  })()}
                                  {unread > 0 && <span className="rounded-full bg-fuchsia-500 px-2 py-0.5 text-xs font-semibold text-white">{unread}</span>}
                                </span>
                              </button>
                              {canManageCategories && (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setCategoryParent(child.id, null); }}
                                  title="Make this a heading (move to top level)"
                                  className="shrink-0 rounded-md p-1 text-purple-200/70 hover:bg-fuchsia-600/60 hover:text-white"
                                >
                                  <ArrowUp className="size-3.5" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                        {guideSubcategories.map((sub) => {
                          const count = listingSubCounts[parent?.id ?? ""]?.[sub.name] ?? 0;
                          if (count === 0) return null;
                          const unread = parent ? unreadSubCounts[parent.id]?.[sub.name] ?? 0 : 0;
                          return (
                            <button
                              key={sub.id}
                              type="button"
                              onClick={() => {
                                if (!parent) return;
                                // Only arm the skip flag when the category is
                                // actually changing, otherwise the default-sub
                                // effect never runs and the flag would swallow
                                // the next real category switch.
                                if (parent.id !== activeCat) skipDefaultSubOnce.current = true;
                                setActiveCat(parent.id);
                                setSubFilter(sub.name);
                                setSubDialogFor(null);
                                setTab("guides");
                                scrollCardsToTop();
                              }}
                              className="flex flex-col items-stretch gap-1.5 rounded-lg border border-purple-400/40 bg-purple-900/60 px-3 py-2.5 text-left text-sm font-semibold text-purple-100 transition-colors hover:border-fuchsia-400/60 hover:bg-purple-800/80"
                            >
                              <span className="min-w-0 break-words leading-snug">{sub.name}</span>
                              <span className="flex flex-wrap items-center gap-1.5">
                                <span className="rounded-full border border-purple-400/40 bg-purple-800/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-purple-100/90">Click to read guides</span>
                                {unread > 0 && <span className="size-2 rounded-full bg-fuchsia-300" />}
                                <span className="rounded-full bg-purple-950/70 px-2 py-0.5 text-xs">{count}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  );
                  })()}
                </div>
              )}
              </aside>
    </>
  );

  return (
    <div
      ref={scrollerRef}
      // Locked to the screen like Talk/Tickets: without a fixed height this
      // container grew with its content and the WINDOW scrolled instead, which
      // broke the sticky A–Z bar and let route navigations reset the scroll.
      className="flex-1 h-[calc(100dvh-3.75rem)] max-h-[calc(100dvh-3.75rem)] min-h-0 overflow-y-auto overscroll-contain relative bg-background/90 bg-cover bg-center bg-fixed bg-blend-multiply"

      style={{ backgroundImage: `url(${sportsBg})` }}
    >
      <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
        <header className="relative px-8 pt-8 pb-6 border-b border-purple-500/30 bg-purple-950/40 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="font-display text-3xl font-bold bg-gradient-to-r from-violet-600 via-fuchsia-600 to-blue-600 bg-clip-text text-transparent">Sports Guide</h1>
              <p className="text-purple-200/80 mt-1">Explore guides and news from all major sports</p>
            </div>
            <TabsList className="flex flex-none rounded-full border border-purple-500/30 bg-purple-950/60 p-1">
              <TabsTrigger value="welcome" className="rounded-full data-[state=active]:bg-gradient-to-r data-[state=active]:from-fuchsia-600 data-[state=active]:to-purple-600 data-[state=active]:text-white">Welcome</TabsTrigger>
              {activeCat && (
                <TabsTrigger value="guides" className="rounded-full data-[state=active]:bg-gradient-to-r data-[state=active]:from-fuchsia-600 data-[state=active]:to-purple-600 data-[state=active]:text-white">Guides</TabsTrigger>
              )}
              {canManageCategories && (
                <TabsTrigger value="categories" className="rounded-full data-[state=active]:bg-gradient-to-r data-[state=active]:from-fuchsia-600 data-[state=active]:to-purple-600 data-[state=active]:text-white">Categories</TabsTrigger>
              )}
            </TabsList>
          </div>
        </header>

      <div className="relative px-8 py-6">

          <TabsContent value="welcome" className="mt-6">
            <div className="relative grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="relative flex-1 group">
                  <div className="absolute -inset-0.5 rounded-xl bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500 opacity-60 blur-sm group-focus-within:opacity-100 group-focus-within:blur-md transition-all duration-300" />
                  <div className="relative flex items-center rounded-xl bg-slate-950/90 ring-1 ring-fuchsia-400/40 shadow-lg shadow-fuchsia-900/40 backdrop-blur-md">
                    <div className="pl-3 pr-2 py-2.5 grid place-items-center">
                      <Search className="size-5 text-fuchsia-300 drop-shadow-[0_0_6px_rgba(232,121,249,0.8)]" />
                    </div>
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search events (3+ letters)..."
                      className="h-11 border-0 bg-transparent text-base font-medium text-white placeholder:text-purple-200/60 focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none"
                    />
                    {search && (
                      <button
                        type="button"
                        onClick={() => setSearch("")}
                        className="mr-2 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider text-fuchsia-200 hover:text-white hover:bg-fuchsia-500/20 transition-colors"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {searchQuery.length > 0 && !activeSearch && (
                    <div className="absolute left-0 top-full mt-1 text-[11px] font-medium text-fuchsia-200/80">
                      Keep typing — enter at least {SG_MIN_SEARCH} letters to search events.
                    </div>
                  )}
                </div>
                  {isMod && (
                    <Button onClick={openNew} className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white border-0 shrink-0">
                      <Plus className="size-4 mr-1" /> Add Blog
                    </Button>
                  )}
                </div>

                {activeSearch ? (
                  <div className="rounded-2xl bg-purple-950/60 border border-purple-500/30 backdrop-blur overflow-hidden">
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
                      <div className="max-h-[60vh] overflow-y-auto divide-y divide-purple-500/20">
                        {searchResults.length === 0 ? (
                          <div className="px-4 py-6 text-sm text-purple-200/70 text-center">No matches</div>
                        ) : (
                          searchResults.map(({ blog, snippet }) => {
                            const cat = categories.find((c) => c.id === blog.category_id);
                            return (
                              <button
                                key={blog.id}
                                onClick={() => { rememberGuide(blog.id); navigate({ to: "/sports-guides/read/$id", params: { id: blog.id }, search: { cat: blog.category_id } }); }}
                                className="w-full text-left px-4 py-3 hover:bg-purple-900/50 transition-colors block"
                              >
                                <div className="text-[10px] uppercase tracking-wider text-fuchsia-300/80 mb-1">{cat?.name ?? "Guide"}</div>
                                <div className="font-semibold text-sm text-purple-50 leading-snug">
                                  <Highlight text={blog.title} query={activeSearch} />
                                </div>
                                <div className="mt-1 text-xs text-purple-200/80 leading-relaxed">
                                  <Highlight text={snippet} query={activeSearch} />
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-2xl bg-gradient-to-br from-fuchsia-600/30 via-purple-600/30 to-violet-700/30 border border-purple-500/40 p-10 shadow-[0_0_60px_-15px_rgba(168,85,247,0.5)]">
                    <h2 className="font-display text-3xl font-bold bg-gradient-to-r from-violet-600 to-blue-600 bg-clip-text text-transparent">Welcome to Sports Guide</h2>
                    <p className="mt-3 text-lg text-purple-100/90 max-w-2xl">
                      Dive into the world of sports with comprehensive guides, insights, and news from your favorite games.
                    </p>
                    <p className="mt-4 text-purple-200/70 max-w-2xl">
                      Whether you're a fan of football, basketball, soccer, tennis, baseball, hockey, or golf — we've got you covered with expert analysis and up-to-date information.
                    </p>
                    <p className="mt-6 text-sm font-semibold text-fuchsia-200">
                      Pick a category on the right to open the guides, or search above to jump straight to a guide.
                    </p>
                  </div>
                )}
                {!activeSearch && <div className="mt-6"><AdSenseSlot slot="welcome" /></div>}
              </div>
              <div className="relative lg:sticky lg:top-4 h-fit">{categoryNav}</div>
            </div>
          </TabsContent>

          <TabsContent value="guides" className="mt-6">
            <div className={`relative grid grid-cols-1 gap-6 ${activeSearch ? "lg:grid-cols-[minmax(0,1fr)_320px]" : activeCategory ? "lg:grid-cols-[minmax(0,1fr)_56px]" : ""}`}>

              {activeCategory && activeCategory.slug !== "sports-passes" && (
                <Dialog
                  open={openSubcategoryPopupFor === activeCategory.id}
                  onOpenChange={(o) => { if (!o) setOpenSubcategoryPopupFor(null); }}
                >
                  <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-2xl lg:max-w-4xl xl:max-w-6xl 2xl:max-w-7xl border-fuchsia-500/40 bg-slate-950/95 backdrop-blur">
                    <DialogHeader>
                      <DialogTitle className="text-purple-100">{activeCategory.name} sub-categories</DialogTitle>
                    </DialogHeader>
                    <div className="grid max-h-[60vh] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                      {(subsByCat[activeCategory.id] ?? []).map((sub) => {
                        const count = listingSubCounts[activeCategory.id]?.[sub.name] ?? 0;
                        if (count === 0) return null;
                        const active = subFilter === sub.name;
                        const unread = unreadSubCounts[activeCategory.id]?.[sub.name] ?? 0;
                        return (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={() => { setSubFilter(sub.name); setOpenSubcategoryPopupFor(null); scrollCardsToTop(); }}
                            className={`flex min-h-16 min-w-0 flex-col items-stretch justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-xs font-bold uppercase transition-colors ${active ? "border-fuchsia-300 bg-fuchsia-600 text-white" : "border-purple-400/40 bg-purple-900/60 text-purple-100 hover:bg-purple-800/80"}`}
                          >
                            <span className="w-full whitespace-normal break-words leading-snug">{sub.name}</span>
                            <span className="flex items-center gap-1.5 self-end">
                              {unread > 0 && <span className="size-2 rounded-full bg-fuchsia-200" />}
                              <span>{count}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </DialogContent>
                </Dialog>
              )}


              <section ref={listingsTopRef}>
                {activeCategory && !activeSearch && (
                  <div className="mb-4 flex flex-wrap items-center gap-3">
                    <h2 className="font-display text-xl font-bold text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]">
                      <span className="bg-gradient-to-r from-fuchsia-300 to-sky-300 bg-clip-text text-transparent">{activeCategory.name}</span>{" "}Guides
                    </h2>
                    {activeCategory.slug !== "sports-passes" && (subsByCat[activeCategory.id]?.length ?? 0) > 0 && openSubcategoryPopupFor !== activeCategory.id && (
                      <button
                        type="button"
                        onClick={() => setOpenSubcategoryPopupFor(activeCategory.id)}
                        className="text-[11px] font-bold uppercase tracking-wide px-3 py-1.5 rounded-full border border-fuchsia-400/50 bg-fuchsia-600/20 text-fuchsia-100 hover:bg-fuchsia-600/40 transition-colors"
                      >
                        Sub-categories
                      </button>
                    )}
                  </div>
                )}

                {activeCategory?.slug === "sports-passes" && activeCat && (subsByCat[activeCat]?.length ?? 0) > 0 && !activeSearch && (
                  <div className="mb-4 grid gap-2 rounded-xl border border-fuchsia-500/30 bg-purple-950/65 p-3 sm:grid-cols-2 xl:grid-cols-3">
                    {(subsByCat[activeCat] ?? []).map((sub) => {
                      const count = listingSubCounts[activeCat]?.[sub.name] ?? 0;
                      if (count === 0) return null;
                      const active = subFilter === sub.name;
                      const unread = unreadSubCounts[activeCat]?.[sub.name] ?? 0;
                      return (
                        <button key={sub.id} onClick={() => setSubFilter(sub.name)} className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs font-bold uppercase transition-colors ${active ? "border-fuchsia-300 bg-fuchsia-600 text-white" : "border-purple-400/40 bg-purple-900/60 text-purple-100 hover:bg-purple-800/80"}`}>
                          <span className="break-words">{sub.name}</span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            {unread > 0 && <span className="size-2 rounded-full bg-fuchsia-200" />}
                            <span>{count}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {filtered.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-purple-500/40 p-12 text-center text-purple-200/70 bg-purple-950/30">
                    No blogs in this category yet.
                  </div>
                ) : (
                  <div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                      {filtered.map((b) => renderBlogCard(b))}
                    </div>
                  </div>
                )}
              </section>

              {activeCategory && !activeSearch && (
                <aside className="sticky top-2 z-10 flex max-h-[calc(100dvh-5rem)] flex-col self-start overflow-hidden rounded-2xl border border-purple-500/30 bg-slate-950/75 p-2 backdrop-blur lg:top-4">
                  <div className="mb-2 text-center text-[10px] font-bold uppercase tracking-wider text-fuchsia-300/80">A–Z</div>
                  <div
                    className="scrollbar-hide flex min-h-0 flex-wrap justify-center gap-1 overflow-y-auto overscroll-contain lg:flex-col lg:flex-nowrap lg:items-center"
                    aria-label="Jump to guide title by letter"
                  >
                    {Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)).map((letter) => {
                      const has = !!azMap[letter];
                      const unread = azUnread.has(letter);
                      return (
                        <button
                          key={letter}
                          onClick={() => jumpToLetter(letter)}
                          disabled={!has}
                          title={
                            unread
                              ? `Unread guide starting with ${letter}`
                              : has
                                ? `Jump to first guide title starting with ${letter}`
                                : `No guide title starting with ${letter}`
                          }
                          className={`w-7 h-6 grid place-items-center rounded text-[11px] font-bold transition-colors ring-1 ${
                            unread
                              ? "bg-fuchsia-500 text-white animate-pulse ring-fuchsia-300 cursor-pointer"
                              : has
                              ? "bg-slate-900/80 text-white ring-purple-400/40 hover:bg-fuchsia-600 hover:ring-fuchsia-300 cursor-pointer"
                              : "bg-slate-900/40 text-purple-200/40 ring-purple-500/10 cursor-not-allowed"
                          }`}
                        >
                          {letter}
                        </button>
                      );
                    })}
                  </div>
                </aside>
              )}

              {activeSearch && (
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
                              onClick={() => { rememberGuide(blog.id); navigate({ to: "/sports-guides/read/$id", params: { id: blog.id }, search: { cat: blog.category_id } }); }}
                              className="w-full text-left px-4 py-3 hover:bg-purple-900/50 transition-colors block"
                            >
                              <div className="text-[10px] uppercase tracking-wider text-fuchsia-300/80 mb-1">
                                {cat?.name ?? "Guide"}
                              </div>
                              <div className="font-semibold text-sm text-purple-50 leading-snug">
                                <Highlight text={blog.title} query={activeSearch} />
                              </div>
                              <div className="mt-1 text-xs text-purple-200/80 leading-relaxed">
                                <Highlight text={snippet} query={activeSearch} />
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

            {showBackTop && (
              <Button
                type="button"
                size="icon"
                onClick={() => {
                  scrollerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="fixed bottom-6 right-6 size-11 rounded-full bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white shadow-lg shadow-purple-900/50 hover:shadow-fuchsia-500/40 hover:scale-110 transition-all z-50"
                aria-label="Back to top"
                title="Back to top"
              >
                <ArrowUp className="size-5" />
              </Button>
            )}
          </TabsContent>

          <TabsContent value="categories" className="relative mt-6">
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
                  <>
                    <Button onClick={() => setAddingCat(true)} className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white border-0">
                      <Plus className="size-4 mr-1" /> Add Category
                    </Button>
                    <Button onClick={openHeadingDialog} className="bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-500 hover:to-pink-500 text-white border-0">
                      <Plus className="size-4 mr-1" /> Add Heading
                    </Button>
                  </>
                )}
                <span className="text-xs text-purple-200/60 ml-2">Drag cards to reorder — order is saved for everyone.</span>
              </div>
            )}
            <div className="space-y-5">
              {topCategories.map((top) => {
                const descendants: Category[] = [];
                const collectChildren = (parentId: string) => {
                  for (const child of childrenByParent[parentId] ?? []) {
                    descendants.push(child);
                    collectChildren(child.id);
                  }
                };
                collectChildren(top.id);
                const groupedCategories = [top, ...descendants];
                return (
                <section key={top.id} className={`rounded-xl ${descendants.length > 0 ? "border border-fuchsia-500/35 bg-purple-950/35 p-3" : ""}`}>
                  {descendants.length > 0 && (
                    <div className="mb-3 flex items-center gap-2 border-b border-fuchsia-500/25 pb-2">
                      <span className="text-xs font-bold uppercase text-fuchsia-200">{top.name}</span>
                      <span className="text-[10px] text-purple-200/60">Main category</span>
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {groupedCategories.map((c) => (
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
                  className={`rounded-2xl border p-5 transition relative backdrop-blur hover:border-fuchsia-500/70 hover:shadow-[0_0_30px_-10px_rgba(217,70,239,0.6)] ${c.parent_id ? "ml-3 border-fuchsia-500/25 bg-purple-900/40" : "border-purple-500/30 bg-purple-950/50"}`}
                >
                  {isMod && (
                    <div className="absolute top-2 right-2 flex items-center gap-1">
                      <GripVertical className="size-4 text-purple-300/70 cursor-grab" />
                      <button
                        onClick={(e) => { e.stopPropagation(); renameCategory(c.id, c.name); }}
                        className="text-purple-300/70 hover:text-fuchsia-200 p-1 rounded-md"
                        title="Rename category"
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteCategory(c.id); }}
                        className="text-purple-300/70 hover:text-destructive p-1 rounded-md"
                        title="Delete category"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  )}
                  <button
                    onClick={() => {
                      if (isGroupHeading(c)) { openHeading(c.id); return; }
                       setActiveCat(c.id); setTab("guides"); scrollCardsToTop();
                    }}
                    className="text-left w-full"
                  >
                    <div className="font-display font-semibold text-lg text-purple-50 flex items-center gap-2">
                      {c.parent_id && <span className="text-purple-300/60 text-sm">{categories.find((p) => p.id === c.parent_id)?.name} /</span>}
                      {c.name}
                      {isGroupHeading(c) && (
                        <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-fuchsia-500/30 text-fuchsia-100 border border-fuchsia-400/40">
                          Main heading
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-purple-200/70 mt-1">
                      {isGroupHeading(c)
                        ? `${childrenByParent[c.id]?.length ?? 0} categories`
                        : `${counts[c.id] ?? 0} guide${(counts[c.id] ?? 0) === 1 ? "" : "s"}`}
                    </div>
                  </button>
                  {canManageCategories && (
                    <div className="mt-3">
                      <label className="text-[11px] uppercase tracking-wider font-semibold text-fuchsia-300/80">Group under</label>
                      <select
                        value={c.parent_id ?? ""}
                        onChange={(e) => setCategoryParent(c.id, e.target.value || null)}
                        disabled={isGroupHeading(c)}
                        className="mt-1 w-full rounded-md bg-purple-950/60 border border-purple-500/30 text-sm text-purple-50 px-2 py-1.5 disabled:opacity-40"
                      >
                        <option value="">No heading (top level)</option>
                        {orderedCategories
                          .filter((p) => {
                            if (p.id === c.id) return false;
                            // Block a fourth level: a mid-level group whose own parent is already grouped can't take children.
                            if (p.parent_id) {
                              const gp = categories.find((g) => g.id === p.parent_id);
                              if (gp?.parent_id) return false;
                            }
                            return true;
                          })
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.parent_id ? `— ${p.name} (under ${categories.find((g) => g.id === p.parent_id)?.name ?? ""})` : p.name}
                            </option>
                          ))}
                      </select>
                      {isGroupHeading(c) && (
                        <div className="text-[11px] text-purple-200/60 mt-1">Move its categories out first to regroup this heading.</div>
                      )}
                      {c.parent_id && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setCategoryParent(c.id, null); }}
                          className="mt-2 w-full rounded-md bg-fuchsia-600/80 hover:bg-fuchsia-500 text-white text-[11px] font-semibold px-2 py-1.5 transition"
                          title="Turn this sub-category into its own main heading"
                        >
                          Make this a main heading
                        </button>
                      )}
                    </div>
                  )}
                  {canManageCategories && (
                    <div className="mt-4 pt-4 border-t border-purple-500/20">
                      <div className="text-[11px] uppercase tracking-wider font-semibold text-fuchsia-300/80 mb-2">
                        Sub-categories
                      </div>
                      <div className="space-y-1.5">
                        {(subsByCat[c.id] ?? []).length === 0 && (
                          <div className="text-xs text-purple-200/60 italic">None yet.</div>
                        )}
                        {(subsByCat[c.id] ?? []).map((sub, idx, arr) => (
                          <div
                            key={sub.id}
                            className="flex items-center justify-between gap-2 rounded-md bg-purple-900/40 border border-purple-500/20 px-2 py-1.5"
                          >
                            <span className="text-sm text-purple-50 flex items-center gap-2 min-w-0">
                              <span className="truncate">{sub.name}</span>
                              {sub.is_default && (
                                <span className="shrink-0 text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-fuchsia-500/30 text-fuchsia-100 border border-fuchsia-400/40">
                                  Default
                                </span>
                              )}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={(e) => { e.stopPropagation(); moveSubcategory(c.id, sub.id, -1); }}
                                disabled={idx === 0}
                                className="text-purple-300/70 hover:text-fuchsia-200 disabled:opacity-30 disabled:hover:text-purple-300/70 p-1 rounded-md"
                                title="Move up"
                              >
                                <ArrowUp className="size-3.5" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); moveSubcategory(c.id, sub.id, 1); }}
                                disabled={idx === arr.length - 1}
                                className="text-purple-300/70 hover:text-fuchsia-200 disabled:opacity-30 disabled:hover:text-purple-300/70 p-1 rounded-md"
                                title="Move down"
                              >
                                <ArrowDown className="size-3.5" />
                              </button>
                              {!sub.is_default && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setDefaultSubcategory(c.id, sub.id); }}
                                  className="text-[10px] font-semibold px-2 py-1 rounded-md bg-purple-800/60 hover:bg-fuchsia-600 text-purple-100 hover:text-white transition"
                                  title="Make default"
                                >
                                  Set default
                                </button>
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); renameSubcategory(c.id, sub.id, sub.name); }}
                                className="text-purple-300/70 hover:text-fuchsia-200 p-1 rounded-md"
                                title="Rename sub-category"
                              >
                                <Pencil className="size-3.5" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); deleteSubcategory(sub.id); }}
                                className="text-purple-300/70 hover:text-destructive p-1 rounded-md"
                                title="Delete sub-category"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <Input
                          value={newSubName[c.id] ?? ""}
                          onChange={(e) => setNewSubName((m) => ({ ...m, [c.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSubcategory(c.id); } }}
                          placeholder="Add sub-category…"
                          className="h-8 text-xs bg-purple-950/60 border-purple-500/30 text-purple-50 placeholder:text-purple-300/50"
                        />
                        <Button
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); addSubcategory(c.id); }}
                          className="h-8 px-2 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white border-0"
                        >
                          <Plus className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
                  ))}
                  </div>
                </section>
                );
              })}
            </div>

            {showBackTop && (
              <button
                type="button"
                onClick={() => {
                  scrollerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}

                className="fixed bottom-6 right-6 size-11 rounded-full bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white shadow-lg shadow-purple-900/50 hover:shadow-fuchsia-500/40 hover:scale-110 transition-all z-50 grid place-items-center"
                aria-label="Back to top"
                title="Back to top"
              >
                <ArrowUp className="size-5" />
              </button>
            )}
          </TabsContent>
        </div>
      </Tabs>

      <Dialog open={headingDialogOpen} onOpenChange={setHeadingDialogOpen}>
        <DialogContent className="bg-slate-950 border border-fuchsia-500/40 text-purple-50 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-fuchsia-200">Add a heading</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={headingName}
              onChange={(e) => setHeadingName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addTopCategory(); } }}
              placeholder="Heading name, e.g. Fighting"
              autoFocus
              className="bg-purple-950/60 border-purple-500/30 text-purple-50 placeholder:text-purple-300/50"
            />
            <div>
              <p className="text-xs text-purple-200/70 mb-2">Pick which categories go under this heading (optional — you can drag them in later):</p>
              <div className="max-h-56 overflow-y-auto space-y-1 rounded-lg border border-purple-500/20 bg-purple-950/40 p-2">
                {orderedCategories.filter((c) => !isGroupHeading(c)).length === 0 && (
                  <p className="text-xs text-purple-300/50 px-1 py-2">No categories available to file yet.</p>
                )}
                {orderedCategories.filter((c) => !isGroupHeading(c)).map((c) => {
                  const parent = c.parent_id ? categories.find((p) => p.id === c.parent_id) : null;
                  const checked = headingPicks.includes(c.id);
                  return (
                    <label key={c.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-fuchsia-600/20 cursor-pointer text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) =>
                          setHeadingPicks((cur) => (v ? [...cur, c.id] : cur.filter((id) => id !== c.id)))
                        }
                        className="border-purple-400/50 data-[state=checked]:bg-fuchsia-600 data-[state=checked]:border-fuchsia-500"
                      />
                      <span className="text-purple-100">{c.name}</span>
                      {parent && <span className="text-[11px] text-purple-300/60">(currently in {parent.name})</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setHeadingDialogOpen(false)} className="text-purple-200 hover:text-white hover:bg-purple-800/40">Cancel</Button>
            <Button onClick={() => void addTopCategory()} className="bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-500 hover:to-pink-500 text-white border-0">
              Create heading
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
