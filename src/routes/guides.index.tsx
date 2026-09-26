import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LandingHeader } from "@/components/LandingHeader";
import { BmSplash } from "@/components/app/BmSplash";
import {
  listPublicGuides,
  type PublicGuidesData,
  type PublicGuideSummary,
  type PublicGuideCategory,
} from "@/lib/public-guides.functions";
import AdSenseSlot from "@/components/app/AdSenseSlot";
import { BackToTopButton } from "@/components/app/BackToTopButton";
import { ArrowLeft, Home, ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import sportsBgAsset from "@/assets/sports-bg.jpg.asset.json";
const sportsBg = sportsBgAsset.url;
const PUBLIC_GUIDE_READS_KEY = "bm-public-sports-guide-reads";

function loadPublicGuideReads(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const value = JSON.parse(localStorage.getItem(PUBLIC_GUIDE_READS_KEY) ?? "{}");
    return value && typeof value === "object" ? value as Record<string, string> : {};
  } catch {
    return {};
  }
}

export const Route = createFileRoute("/guides/")({
  loader: () => listPublicGuides(),
  head: () => ({
    meta: [
      { title: "Sports Guides & TV Listings | BM Support" },
      {
        name: "description",
        content:
          "Free public sports guides from BM Support — upcoming fixtures, dates and start times across football, boxing, F1, NFL and more.",
      },
      { property: "og:title", content: "Sports Guides & TV Listings | BM Support" },
      {
        property: "og:description",
        content:
          "Upcoming fixtures, dates and start times across football, boxing, F1, NFL and more.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://bmsupport.uk/guides" },
      { rel: "canonical", href: "https://bmsupport.uk/guides" },
    ],
  }),
  pendingComponent: () => <BmSplash label="Loading sports guides…" />,
  pendingMs: 0,
  component: PublicGuidesPage,
});

function PublicGuidesPage() {
  const loaderData = Route.useLoaderData() as PublicGuidesData;
  const queryClient = useQueryClient();
  const queryKey = ["public-sports-guides"] as const;
  const dataQuery = useQuery({
    queryKey,
    queryFn: () => listPublicGuides(),
    initialData: loaderData,
    staleTime: 0,
    refetchInterval: 15_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  const data = dataQuery.data;
  const { categories, subcategories, guides } = data;
  const [publicReads, setPublicReads] = useState<Record<string, string>>({});

  useEffect(() => {
    const refreshReads = () => setPublicReads(loadPublicGuideReads());
    refreshReads();
    window.addEventListener("focus", refreshReads);
    window.addEventListener("storage", refreshReads);
    window.addEventListener("bm-public-guide-read", refreshReads);
    return () => {
      window.removeEventListener("focus", refreshReads);
      window.removeEventListener("storage", refreshReads);
      window.removeEventListener("bm-public-guide-read", refreshReads);
    };
  }, []);

  useEffect(() => {
    const refresh = () => queryClient.invalidateQueries({ queryKey });
    const channel = supabase
      .channel("public-sports-guides-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "sports_blogs" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "sports_categories" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "sports_subcategories" }, refresh)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [queryClient]);

  const isUnread = (guide: PublicGuideSummary) => {
    const readAt = publicReads[guide.id];
    if (!readAt) return true;
    return new Date(readAt).getTime() < new Date(guide.updated_at ?? guide.created_at).getTime();
  };

  // Same staged navigation as the signed-in sports guide: the page always
  // opens on Welcome with no category picked; guides appear once a category
  // is chosen from the sidebar.
  const [tab, setTab] = useState<"welcome" | "guides">("welcome");
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [subFilter, setSubFilter] = useState<string | null>(null);
  const [subDialogFor, setSubDialogFor] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<string[]>([]);

  const childrenByParent = useMemo(() => {
    const m: Record<string, PublicGuideCategory[]> = {};
    for (const c of categories) {
      if (!c.parent_id) continue;
      if (!m[c.parent_id]) m[c.parent_id] = [];
      m[c.parent_id].push(c);
    }
    return m;
  }, [categories]);
  // The server only returns guides holding at least one real timed event,
  // so every guide here counts as having listings.
  const listingBlogs = guides;

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    const parentOf = new Map(
      categories.map((c) => [c.id, c.parent_id ?? null] as const),
    );
    for (const g of listingBlogs) {
      m[g.category_id] = (m[g.category_id] ?? 0) + 1;
      // Roll child-category guides up to the top-level badge.
      const parent = parentOf.get(g.category_id);
      if (parent) m[parent] = (m[parent] ?? 0) + 1;
    }
    return m;
  }, [listingBlogs, categories]);

  const topCategories = useMemo(
    () => categories.filter((c) => !c.parent_id && (counts[c.id] ?? 0) > 0),
    [categories, counts],
  );
  const subsByCat = useMemo(() => {
    const m: Record<string, typeof subcategories> = {};
    for (const s of subcategories) {
      if (!m[s.category_id]) m[s.category_id] = [];
      m[s.category_id].push(s);
    }
    return m;
  }, [subcategories]);

  const unreadCounts = useMemo(() => {
    const direct: Record<string, number> = {};
    for (const guide of listingBlogs) {
      if (isUnread(guide)) direct[guide.category_id] = (direct[guide.category_id] ?? 0) + 1;
    }
    const kids: Record<string, string[]> = {};
    for (const category of categories) {
      if (!category.parent_id) continue;
      if (!kids[category.parent_id]) kids[category.parent_id] = [];
      kids[category.parent_id].push(category.id);
    }
    const totals: Record<string, number> = {};
    const walk = (id: string, seen: Set<string>): number => {
      if (totals[id] !== undefined) return totals[id];
      if (seen.has(id)) return 0;
      seen.add(id);
      let total = direct[id] ?? 0;
      for (const child of kids[id] ?? []) total += walk(child, seen);
      totals[id] = total;
      return total;
    };
    for (const category of categories) walk(category.id, new Set());
    return totals;
  }, [listingBlogs, categories, publicReads]);

  // Categories and sub-categories only appear when they hold a guide with
  // listings, mirroring the signed-in sports guide.
  const visibleCategories = useMemo(
    () => categories.filter((c) => (counts[c.id] ?? 0) > 0),
    [categories, counts],
  );

  const activeCategory = categories.find((c) => c.id === activeCat);

  const chooseCategory = (categoryId: string) => {
    const categoryChildren = (childrenByParent[categoryId] ?? []).filter(
      (child) => (counts[child.id] ?? 0) > 0,
    );
    const guideSubcategories = (subsByCat[categoryId] ?? []).filter((sub) =>
      listingBlogs.some(
        (guide) =>
          guide.category_id === categoryId && guide.subcategory === sub.name,
      ),
    );
    if (categoryChildren.length > 0 || guideSubcategories.length > 0) {
      setSubDialogFor(categoryId);
      setOpenGroups([categoryId]);
      return;
    }
    setSubDialogFor(null);
    setActiveCat(categoryId);
    setSubFilter(null);
    setTab("guides");
  };

  // Mirror the signed-in page: when a category opens, default to its default
  // sub-category (or the first one) so its guides show straight away.
  useEffect(() => {
    if (!activeCat) { setSubFilter(null); return; }
    const list = subsByCat[activeCat] ?? [];
    if (!list.length) { setSubFilter(null); return; }
    const hasGuides = (name: string) =>
      listingBlogs.some((g) => g.category_id === activeCat && g.subcategory === name);
    const def = list.find((s) => s.is_default);
    // Prefer the default sub, but fall back to the first sub that actually
    // has public guides so visitors never land on an empty list.
    const pick =
      (def && hasGuides(def.name) ? def : undefined) ??
      list.find((s) => hasGuides(s.name)) ??
      def ??
      list[0];
    setSubFilter(pick?.name ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCat, subsByCat, guides]);

  const openHeading = (id: string) => {
    setOpenGroups([id]);
    setSubDialogFor(id);
  };

  const filtered = useMemo(
    () =>
      listingBlogs.filter((g) => {
        if (!activeCat || g.category_id !== activeCat) return false;
        if (subsByCat[activeCat]?.length && subFilter && g.subcategory !== subFilter)
          return false;
        return true;
      }),
    [listingBlogs, activeCat, subFilter, subsByCat],
  );

  const renderGuideCard = (g: PublicGuideSummary) => (
    <article
      key={g.id}
      className={`relative rounded-2xl bg-purple-950/50 overflow-hidden flex flex-col group transition-all ${
        isUnread(g)
          ? "border-2 border-fuchsia-400 shadow-[0_0_30px_-8px_rgba(217,70,239,0.85)]"
          : "border border-purple-500/30 hover:border-fuchsia-500/60 hover:shadow-[0_0_30px_-10px_rgba(217,70,239,0.6)]"
      }`}
    >
      {isUnread(g) && (
        <span className="absolute top-3 right-3 z-20 inline-flex items-center gap-1.5 rounded-full bg-fuchsia-500 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-lg">
          <span className="size-2 rounded-full bg-white animate-pulse" /> Unread
        </span>
      )}
      <div className="aspect-[16/10] bg-purple-900/50 relative overflow-hidden">
        {g.image_url ? (
          <>
            <img
              src={g.image_url}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-60"
            />
            <div className="absolute inset-0 bg-purple-950/35" />
            <img
              src={g.image_url}
              alt={g.title}
              className="relative z-10 w-full h-full object-contain group-hover:scale-[1.02] transition-transform"
            />
          </>
        ) : (
          <div className="w-full h-full grid place-items-center text-purple-300/60">
            <ImageIcon className="size-10" />
          </div>
        )}
      </div>
      <div className="p-4 flex-1 flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <span className="text-xs px-2 py-1 rounded-md bg-fuchsia-500/30 text-white font-semibold border border-fuchsia-400/50">
            {categories.find((c) => c.id === g.category_id)?.name}
          </span>
          {g.badge && (
            <span className="text-xs px-2 py-1 rounded-md bg-violet-500/20 text-violet-200 font-medium border border-violet-500/30">
              {g.badge}
            </span>
          )}
        </div>
        <h3 className="font-display font-semibold text-lg leading-snug text-purple-50">
          {g.title}
        </h3>
        <div className="text-[11px] text-purple-300/70">
          Updated:{" "}
          <time dateTime={g.updated_at ?? g.created_at}>
            {new Date(g.updated_at ?? g.created_at).toLocaleString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
        </div>
        <div className="mt-auto pt-3">
          <Link
            to="/guides/$id"
            params={{ id: g.id }}
            className="block w-full rounded-md bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white text-center text-sm font-semibold px-4 py-2 transition"
          >
            Click to Read
          </Link>
        </div>
      </div>
    </article>
  );

  const categoryNav = (
    <aside className="relative z-20 rounded-2xl bg-purple-950/50 border border-purple-500/30 p-4 h-fit backdrop-blur">
      <div className="flex items-center justify-between mb-3 px-2 gap-2">
        <h3 className="font-display font-semibold text-purple-100">Categories</h3>
      </div>
      <div className={subDialogFor ? "hidden" : "space-y-1"}>
        {topCategories.map((top) => {
          const kids = (childrenByParent[top.id] ?? []).filter(
            (k) => (counts[k.id] ?? 0) > 0,
          );
          const heading = kids.length > 0;
          const open = openGroups.includes(top.id);
          const renderRow = (c: PublicGuideCategory) => {
            const active = c.id === activeCat;
            return (
              <div
                key={c.id}
                className={`group flex items-center gap-1 px-1 rounded-lg ${active ? "bg-gradient-to-r from-violet-600 to-blue-600 text-white shadow-md shadow-purple-900/40" : "text-purple-100/80 hover:bg-purple-800/40"}`}
              >
                <button
                  onClick={() => chooseCategory(c.id)}
                  className="flex-1 flex flex-col items-start px-2 py-2 text-sm text-left"
                >
                  <span>{c.name}</span>
                  <span className={`mt-0.5 text-[11px] ${active ? "text-white/80" : "text-purple-200/60"}`}>
                    {counts[c.id] ?? 0} {(counts[c.id] ?? 0) === 1 ? "guide" : "guides"}
                    {(unreadCounts[c.id] ?? 0) > 0 && (
                      <span className={`ml-1.5 inline-flex items-center gap-1 font-semibold ${active ? "text-white" : "text-fuchsia-300"}`}>
                        · <span className="size-1.5 rounded-full bg-fuchsia-400" />
                        {unreadCounts[c.id]} unread
                      </span>
                    )}
                  </span>
                </button>
              </div>
            );
          };

          if (!heading) return renderRow(top);

          return (
            <div key={top.id} className="space-y-1">
              <div
                className={`group flex items-center gap-1 px-1 rounded-lg ${open ? "bg-purple-800/60 text-white ring-1 ring-fuchsia-400/40" : "text-purple-100/80 hover:bg-purple-800/40"}`}
              >
                <button
                  onClick={() => openHeading(top.id)}
                  aria-expanded={open}
                  className="flex-1 flex flex-col items-start px-2 py-2 text-sm text-left font-semibold"
                >
                  <span>{top.name}</span>
                  <span className={`mt-0.5 text-[11px] font-normal ${open ? "text-white/80" : "text-purple-200/60"}`}>
                    {counts[top.id] ?? 0} {(counts[top.id] ?? 0) === 1 ? "guide" : "guides"}
                    {(unreadCounts[top.id] ?? 0) > 0 && (
                      <span className={`ml-1.5 inline-flex items-center gap-1 font-semibold ${open ? "text-white" : "text-fuchsia-300"}`}>
                        · <span className="size-1.5 rounded-full bg-fuchsia-400" />
                        {unreadCounts[top.id]} unread
                      </span>
                    )}
                  </span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {subDialogFor && (
        <div>
          {(() => {
            const parent = categories.find((c) => c.id === subDialogFor);
            const children = (childrenByParent[subDialogFor ?? ""] ?? []).filter(
              (c) => (counts[c.id] ?? 0) > 0,
            );
            const guideSubcategories = (
              subsByCat[subDialogFor ?? ""] ?? []
            ).filter((sub) =>
              listingBlogs.some(
                (guide) =>
                  guide.category_id === parent?.id &&
                  guide.subcategory === sub.name,
              ),
            );
            const grandParent = parent?.parent_id
              ? categories.find((c) => c.id === parent.parent_id)
              : null;
            let root = parent;
            while (root?.parent_id)
              root = categories.find((c) => c.id === root!.parent_id);
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
                    onClick={() =>
                      setSubDialogFor(root && root.id !== parent?.id ? root.id : null)
                    }
                    title={
                      root && root.id !== parent?.id
                        ? `Back to ${root.name}`
                        : "All categories"
                    }
                    aria-label="Home"
                    className="shrink-0 rounded-md p-1.5 text-fuchsia-100 hover:bg-fuchsia-600/40"
                  >
                    <Home className="size-4" />
                  </button>
                  <span className="min-w-0 flex-1 truncate px-1 text-sm font-bold">
                    {parent?.name ?? "Sub-categories"}
                  </span>
                </div>
                <div className="grid max-h-[70vh] gap-1 overflow-y-auto">
                  {children.map((child) => {
                    const active = child.id === activeCat;
                    return (
                      <div
                        key={child.id}
                        className={`group flex items-center gap-1 rounded-lg px-1 transition-colors ${active ? "bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white shadow-md shadow-fuchsia-950/40" : "text-purple-100/80 hover:bg-purple-800/50"}`}
                      >
                        <button
                          type="button"
                          onClick={() => chooseCategory(child.id)}
                          className="flex flex-1 flex-col items-stretch gap-1.5 px-2 py-2.5 text-left text-sm"
                        >
                          <span className="flex min-w-0 items-start gap-2">
                            {(unreadCounts[child.id] ?? 0) > 0 && (
                              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-fuchsia-300" />
                            )}
                            <span className="min-w-0 break-words leading-snug">
                              {child.name}
                            </span>
                          </span>
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded-full bg-purple-950/70 px-2 py-0.5 text-xs">
                              {counts[child.id] ?? 0} {(counts[child.id] ?? 0) === 1 ? "guide" : "guides"}
                            </span>
                            {(unreadCounts[child.id] ?? 0) > 0 && (
                              <span className="rounded-full bg-fuchsia-500 px-2 py-0.5 text-xs font-semibold text-white">
                                {unreadCounts[child.id]} unread
                              </span>
                            )}
                            {(childrenByParent[child.id]?.length ?? 0) +
                              (subsByCat[child.id]?.length ?? 0) >
                            1 ? (
                              <span className="rounded-full border border-fuchsia-400/50 bg-fuchsia-600/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-fuchsia-100">
                                View more categories
                              </span>
                            ) : (
                              <span className="rounded-full border border-purple-400/40 bg-purple-800/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-purple-100/90">
                                Click to read guides
                              </span>
                            )}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                  {guideSubcategories.map((sub) => {
                    const count = guides.filter(
                      (g) => g.category_id === parent?.id && g.subcategory === sub.name,
                    ).length;
                    const unread = guides.filter(
                      (g) => g.category_id === parent?.id && g.subcategory === sub.name && isUnread(g),
                    ).length;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => {
                          if (!parent) return;
                          setActiveCat(parent.id);
                          setSubFilter(sub.name);
                          setSubDialogFor(null);
                          setTab("guides");
                        }}
                        className="flex flex-col items-stretch gap-1.5 rounded-lg border border-purple-400/40 bg-purple-900/60 px-3 py-2.5 text-left text-sm font-semibold text-purple-100 transition-colors hover:border-fuchsia-400/60 hover:bg-purple-800/80"
                      >
                        <span className="min-w-0 break-words leading-snug">
                          {unread > 0 && <span className="mr-2 inline-block size-2 rounded-full bg-fuchsia-300" />}
                          {sub.name}
                        </span>
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full border border-purple-400/40 bg-purple-800/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-purple-100/90">
                            Click to read guides
                          </span>
                          <span className="rounded-full bg-purple-950/70 px-2 py-0.5 text-xs">
                            {count} {count === 1 ? "guide" : "guides"}
                          </span>
                          {unread > 0 && (
                            <span className="rounded-full bg-fuchsia-500 px-2 py-0.5 text-xs font-semibold text-white">
                              {unread} unread
                            </span>
                          )}
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
  );

  return (
    <div className="relative flex min-h-screen flex-col bg-background text-foreground" style={{ minHeight: "100dvh" }}>
      <img
        src={sportsBg}
        alt=""
        aria-hidden
        className="pointer-events-none fixed inset-0 h-full w-full object-cover"
      />
      <div className="pointer-events-none fixed inset-0 bg-background/90" />
      <LandingHeader />
      <div className="relative flex-1">
        <header className="relative px-4 sm:px-8 pt-8 pb-6 border-b border-purple-500/30 bg-purple-950/40 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="font-display text-3xl font-bold bg-gradient-to-r from-violet-600 via-fuchsia-600 to-blue-600 bg-clip-text text-transparent">
                Sports Guide
              </h1>
              <p className="text-purple-200/80 mt-1">
                Explore guides and news from all major sports
              </p>
            </div>
            <div className="flex flex-none rounded-full border border-purple-500/30 bg-purple-950/60 p-1">
              <button
                onClick={() => setTab("welcome")}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${tab === "welcome" ? "bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white" : "text-purple-200/80 hover:text-white"}`}
              >
                Welcome
              </button>
              {activeCat && (
                <button
                  onClick={() => setTab("guides")}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${tab === "guides" ? "bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white" : "text-purple-200/80 hover:text-white"}`}
                >
                  Guides
                </button>
              )}
            </div>
          </div>
        </header>

        <div className="relative px-4 sm:px-8 py-6">
          {tab === "welcome" && (
            <div className="relative grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
              <div className="space-y-6">
                <div className="rounded-2xl bg-gradient-to-br from-fuchsia-600/30 via-purple-600/30 to-violet-700/30 border border-purple-500/40 p-6 sm:p-10 shadow-[0_0_60px_-15px_rgba(168,85,247,0.5)]">
                  <h2 className="font-display text-3xl font-bold bg-gradient-to-r from-violet-600 to-blue-600 bg-clip-text text-transparent">
                    Welcome to Sports Guide
                  </h2>
                  <p className="mt-3 text-lg text-purple-100/90 max-w-2xl">
                    Dive into the world of sports with comprehensive guides,
                    insights, and news from your favorite games.
                  </p>
                  <p className="mt-4 text-purple-200/70 max-w-2xl">
                    Whether you're a fan of football, basketball, soccer, tennis,
                    baseball, hockey, or golf — we've got you covered with
                    up-to-date fixture dates and start times.
                  </p>
                  <p className="mt-6 text-sm font-semibold text-fuchsia-200">
                    Pick a category on the right to open the guides.
                  </p>
                </div>
                <div className="mt-6">
                  <AdSenseSlot slot="welcome" />
                </div>
              </div>
              <div className="relative lg:sticky lg:top-4 h-fit">{categoryNav}</div>
            </div>
          )}

          {tab === "guides" && activeCategory && (
            <div className="relative grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
              <section>
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <h2 className="font-display text-xl font-bold text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]">
                    <span className="bg-gradient-to-r from-fuchsia-300 to-sky-300 bg-clip-text text-transparent">
                      {activeCategory.name}
                    </span>{" "}
                    Guides
                  </h2>
                </div>
                {(subsByCat[activeCategory.id]?.length ?? 0) > 0 && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    {(subsByCat[activeCategory.id] ?? []).map((sub) => {
                      const count = listingBlogs.filter(
                        (g) => g.category_id === activeCategory.id && g.subcategory === sub.name,
                      ).length;
                      if (count === 0) return null;
                      const active = subFilter === sub.name;
                      const unread = listingBlogs.filter(
                        (g) => g.category_id === activeCategory.id && g.subcategory === sub.name && isUnread(g),
                      ).length;
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => setSubFilter(sub.name)}
                          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-colors ${active ? "border-fuchsia-300 bg-fuchsia-600 text-white" : "border-purple-400/40 bg-purple-900/60 text-purple-100 hover:bg-purple-800/80"}`}
                        >
                          <span>{sub.name}</span>
                          {unread > 0 && <span className="size-2 rounded-full bg-fuchsia-200" />}
                          <span className="rounded-full bg-purple-950/70 px-1.5 py-0.5 text-[10px]">{count}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {filtered.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-purple-500/40 p-12 text-center text-purple-200/70 bg-purple-950/30">
                    No listings submitted yet.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {filtered.map((g) => renderGuideCard(g))}
                  </div>
                )}
              </section>
              <div className="relative lg:sticky lg:top-4 h-fit">{categoryNav}</div>
            </div>
          )}
        </div>
      </div>
      <BackToTopButton />
    </div>
  );
}
