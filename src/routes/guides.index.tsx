import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { LandingHeader } from "@/components/LandingHeader";
import {
  listPublicGuides,
  type PublicGuidesData,
  type PublicGuideSummary,
  type PublicGuideCategory,
} from "@/lib/public-guides.functions";
import AdSenseSlot from "@/components/app/AdSenseSlot";
import { ArrowLeft, Home, ImageIcon, Lock } from "lucide-react";
import sportsBgAsset from "@/assets/sports-bg.jpg.asset.json";
const sportsBg = sportsBgAsset.url;

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
  component: PublicGuidesPage,
});

function PublicGuidesPage() {
  const data = Route.useLoaderData() as PublicGuidesData;
  const { categories, subcategories, guides } = data;

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
  const topCategories = useMemo(
    () => categories.filter((c) => !c.parent_id),
    [categories],
  );
  const subsByCat = useMemo(() => {
    const m: Record<string, typeof subcategories> = {};
    for (const s of subcategories) {
      if (!m[s.category_id]) m[s.category_id] = [];
      m[s.category_id].push(s);
    }
    return m;
  }, [subcategories]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const g of guides) m[g.category_id] = (m[g.category_id] ?? 0) + 1;
    return m;
  }, [guides]);

  const activeCategory = categories.find((c) => c.id === activeCat);

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
    setSubFilter(null);
    setTab("guides");
  };

  const openHeading = (id: string) => {
    setOpenGroups([id]);
    setSubDialogFor(id);
  };

  const filtered = useMemo(
    () =>
      guides.filter((g) => {
        if (!activeCat || g.category_id !== activeCat) return false;
        if (subsByCat[activeCat]?.length && subFilter && g.subcategory !== subFilter)
          return false;
        return true;
      }),
    [guides, activeCat, subFilter, subsByCat],
  );

  const renderGuideCard = (g: PublicGuideSummary) => (
    <article
      key={g.id}
      className="rounded-2xl bg-purple-950/50 border border-purple-500/30 overflow-hidden flex flex-col group hover:border-fuchsia-500/60 hover:shadow-[0_0_30px_-10px_rgba(217,70,239,0.6)] transition-all"
    >
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
        {g.excerpt && (
          <p className="text-sm text-purple-200/70 line-clamp-2">{g.excerpt}</p>
        )}
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
          const kids = childrenByParent[top.id] ?? [];
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
                  className="flex-1 flex items-center justify-between px-2 py-2 text-sm text-left"
                >
                  <span>{c.name}</span>
                  {(counts[c.id] ?? 0) > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-800/70 text-purple-100 font-semibold">
                      {counts[c.id]}
                    </span>
                  )}
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
                  className="flex-1 flex items-center justify-between px-2 py-2 text-sm text-left font-semibold"
                >
                  <span>{top.name}</span>
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
            const children = childrenByParent[subDialogFor ?? ""] ?? [];
            const guideSubcategories = subsByCat[subDialogFor ?? ""] ?? [];
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
                            <span className="min-w-0 break-words leading-snug">
                              {child.name}
                            </span>
                          </span>
                          <span className="flex flex-wrap items-center gap-1.5">
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
                          {sub.name}
                        </span>
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full border border-purple-400/40 bg-purple-800/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-purple-100/90">
                            Click to read guides
                          </span>
                          <span className="rounded-full bg-purple-950/70 px-2 py-0.5 text-xs">
                            {count}
                          </span>
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
    <div className="min-h-screen bg-background text-foreground">
      <LandingHeader />
      <div
        className="relative bg-background/90 bg-cover bg-center bg-fixed bg-blend-multiply"
        style={{ backgroundImage: `url(${sportsBg})` }}
      >
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
                  <p className="mt-4 flex items-center gap-2 text-xs text-purple-200/60">
                    <Lock className="size-3.5" />
                    Channel listings are members-only — join BM Support to see
                    exactly which channels are showing every event.
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
                {filtered.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-purple-500/40 p-12 text-center text-purple-200/70 bg-purple-950/30">
                    No guides in this category yet.
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
    </div>
  );
}
