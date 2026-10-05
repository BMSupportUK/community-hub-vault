import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeRichHtml } from "@/lib/sanitize-html";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import AdSenseSlot from "@/components/app/AdSenseSlot";
import { toast } from "sonner";
import { annotateTimesInEl } from "@/lib/parse-event-times";
import { useUserTimezone } from "@/hooks/use-user-timezone";

export const Route = createFileRoute("/_authenticated/_approved/sports-guides/read/$id")({
  component: ReadPage,
});

type Blog = {
  id: string;
  category_id: string;
  title: string;
  excerpt: string | null;
  body: string | null;
  image_url: string | null;
  badge: string | null;
  refresh_notice: string | null;
  not_guaranteed: boolean | null;
  subcategory: string | null;
};
type Category = { id: string; name: string; parent_id?: string | null };

function ReadPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const viewerTz = useUserTimezone();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [blog, setBlog] = useState<Blog | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  // Re-run the annotator on an interval so events whose stale window
  // (>10h past start) has elapsed drop out of the reader without the user
  // needing to refresh the page. Multi-date guides otherwise kept showing
  // yesterday's events until a full reload.
  const [tzTick, setTzTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTzTick((v) => v + 1), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);
  // Guides sourced from Flosports (College Football, Racing) publish their
  // schedules in US Eastern time, not GMT. Detect by title so bare times
  // without a zone are interpreted in ET.
  const defaultSourceZone =
    blog && /^\s*flosports\b/i.test(blog.title) ? "ET" : "GMT";
  useEffect(() => {
    (async () => {
      const [{ data: b, error }, { data: cats }] = await Promise.all([
        supabase.from("sports_blogs").select("*").eq("id", id).maybeSingle(),
        supabase.from("sports_categories").select("id, name, parent_id").order("sort_order"),
      ]);
      if (error || !b) {
        toast.error(error?.message ?? "Blog not found");
        navigate({ to: "/sports-guides" });
        return;
      }
      const blogData = b as Blog;
      setBlog(blogData);
      setCategories((cats ?? []) as Category[]);
      setLoading(false);
      if (user?.id) {
        const readAt = new Date().toISOString();
        queryClient.setQueryData(
          ["sports-guides-data", user.id],
          (
            prev:
              | {
                  categories: Category[];
                  blogs: Blog[];
                  reads: Record<string, string>;
                  baselineAt: string | null;
                }
              | undefined,
          ) => (prev ? { ...prev, reads: { ...prev.reads, [id]: readAt } } : prev),
        );
        await supabase
          .from("sports_blog_reads")
          .upsert(
            { user_id: user.id, blog_id: id, read_at: readAt },
            { onConflict: "user_id,blog_id" },
          );
        queryClient.invalidateQueries({ queryKey: ["sports-guides-data", user.id] });
      }
    })();
  }, [id, user?.id, navigate, queryClient]);

  const bodyItems = useMemo(() => {
    if (!blog?.body) return [] as string[];
    if (typeof document === "undefined") return [];
    const wrap = document.createElement("div");
    wrap.innerHTML = sanitizeRichHtml(blog.body);
    // Link-only notes should show a compact clickable bubble styled like the
    // channel chips, not a full-width preview card.
    wrap.querySelectorAll<HTMLElement>("[data-link-preview]").forEach((el) => {
      const url = el.getAttribute("data-link-preview") ?? "";
      if (!url) return;
      let label = (el.getAttribute("data-link-title") ?? "").trim();
      if (!label) {
        try {
          label = new URL(url).hostname.replace(/^www\./, "");
        } catch {
          label = url;
        }
      }
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.className =
        "inline-flex items-center justify-center rounded-xl border border-fuchsia-300/45 bg-fuchsia-950/55 px-4 py-3 text-sm font-semibold tracking-wide text-fuchsia-100 no-underline shadow-[0_0_12px_rgba(217,70,239,0.16)] transition hover:bg-fuchsia-900/70 hover:text-white";
      a.textContent = label;
      const holder = document.createElement("div");
      holder.className = "flex flex-col items-start gap-2";
      // Owners can type intro text directly above the link in the editor —
      // pull those contiguous text blocks into the same card so the copy
      // stays attached above the bubble instead of paginating separately.
      const intro: HTMLElement[] = [];
      let prev = el.previousElementSibling as HTMLElement | null;
      while (prev && intro.length < 2) {
        if (prev.matches("[data-link-preview]")) break;
        if (prev.querySelector("img,video,iframe,picture,canvas,[data-link-preview]")) break;
        const text = (prev.textContent ?? "").replace(/\s|\u00a0/g, "");
        if (!text) {
          const empty = prev;
          prev = prev.previousElementSibling as HTMLElement | null;
          empty.remove();
          continue;
        }
        intro.unshift(prev);
        prev = prev.previousElementSibling as HTMLElement | null;
      }
      intro.forEach((node) => {
        node.classList.add("m-0", "text-sm", "text-purple-100/85", "leading-snug");
        holder.appendChild(node);
      });
      holder.appendChild(a);
      el.replaceWith(holder);
    });
    try {
      annotateTimesInEl(wrap, viewerTz, defaultSourceZone);
    } catch (e) {
      // Never let a bad date/time in guide content crash the reader.
      console.error("[sports-guides/read] annotateTimesInEl failed", e);
    }
    const eventRows = Array.from(
      wrap.querySelectorAll<HTMLElement>("[data-tz-row][data-tz-utc]"),
    );
    if (eventRows.length) return eventRows.map((el) => el.outerHTML);
    return Array.from(wrap.children)
      .filter((el) => {
        const e = el as HTMLElement;
        if (e.matches(".hidden,[hidden]")) return false;
        const hasText = (e.textContent ?? "").replace(/\s|\u00a0/g, "").length > 0;
        const hasMedia = !!e.querySelector("img,video,iframe,svg,picture,canvas");
        return hasText || hasMedia;
      })
      .map((el) => (el as HTMLElement).outerHTML);
  // tzTick intentionally in deps to re-prune stale rows on the interval.
  }, [blog?.body, viewerTz, defaultSourceZone, tzTick]);

  // Equalize the event-name height within each visual grid row so every
  // card's channel chip list starts at the same height, even when one event
  // name wraps to more lines than its neighbours.
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    let raf = 0;
    const equalize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rows = Array.from(
          el.querySelectorAll<HTMLElement>("[data-tz-row][data-tz-utc]"),
        );
        if (!rows.length) return;
        const groups = new Map<string, HTMLElement[]>();
        rows.forEach((r) => {
          const key = String(Math.round(r.getBoundingClientRect().top));
          const group = groups.get(key) ?? [];
          group.push(r);
          groups.set(key, group);
        });
        groups.forEach((group) => {
          const names = group
            .map((r) => r.querySelector<HTMLElement>("[data-tz-name]"))
            .filter((n): n is HTMLElement => !!n);
          if (names.length < 2) return;
          names.forEach((n) => {
            n.style.minHeight = "";
          });
          let maxH = 0;
          names.forEach((n) => {
            maxH = Math.max(maxH, n.getBoundingClientRect().height);
          });
          names.forEach((n) => {
            n.style.minHeight = `${Math.ceil(maxH)}px`;
          });
        });
      });
    };
    equalize();
    const mo = new MutationObserver(equalize);
    mo.observe(el, { childList: true, subtree: true });
    const ro = new ResizeObserver(equalize);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
      ro.disconnect();
    };
  }, [bodyItems]);

  return (
    <div className="flex-1 flex flex-col bg-gradient-to-br from-[#1a0b2e] via-[#2d1b4e] to-[#1a0b2e]">
      <header className="flex items-center justify-between gap-4 px-8 py-5 border-b border-purple-500/30 bg-purple-950/60 backdrop-blur shrink-0">
        <Button
          variant="ghost"
          className="text-purple-200 hover:text-white hover:bg-purple-800/60"
          onClick={() => {
            // Always return to this guide's card, even if the reader was
            // opened directly (deep link) rather than from the list.
            try { sessionStorage.setItem("sports-guides-focus-id", blog?.id ?? id); } catch { /* ignore */ }
            navigate({
              to: "/sports-guides",
              resetScroll: false,
              search: {
                cat: blog?.category_id || undefined,
                sub: blog?.subcategory || undefined,
              },
            });
          }}
        >
          <ArrowLeft className="size-4 mr-1" /> Back to guides
        </Button>
        <span className="text-xs text-purple-200/70 font-medium">
          {bodyItems.length} {bodyItems.length === 1 ? "listing" : "listings"}
        </span>
      </header>
      <div className="flex-1 flex flex-col">
        {loading || !blog ? (
          <div className="px-6 py-12 text-center text-purple-200/70">Loading…</div>
        ) : (
          <article className="w-full max-w-none mx-auto px-3 sm:px-6 py-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 font-display text-2xl md:text-3xl font-bold text-white">
                {blog.title}
              </h1>
              <span className="text-xs px-2 py-1 rounded-md bg-fuchsia-500/30 text-white font-semibold border border-fuchsia-400/50">
                {(() => {
                  const cat = categories.find((c) => c.id === blog.category_id);
                  if (!cat) return null;
                  const parent = cat.parent_id ? categories.find((p) => p.id === cat.parent_id)?.name : null;
                  return parent ? `${parent} / ${cat.name}` : cat.name;
                })()}
              </span>
              {blog.badge && (
                <span className="text-xs px-2 py-1 rounded-md bg-violet-500/20 text-violet-200 font-medium border border-violet-500/30">
                  {blog.badge}
                </span>
              )}
              {blog.refresh_notice && (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-100">
                  <RefreshCw className="size-3.5 shrink-0" />
                  {blog.refresh_notice}
                </span>
              )}
              {blog.not_guaranteed && (
                <span className="rounded-md border border-rose-400/40 bg-rose-500/10 px-2 py-1 text-xs font-medium text-rose-100">
                  These are not guaranteed and no reports allowed to source.
                </span>
              )}
            </div>
            {blog.image_url ? (
              <div className="grid shrink-0 grid-cols-1 gap-4 xl:grid-cols-2 xl:items-stretch">
                <div className="relative h-32 min-w-0 overflow-hidden rounded-2xl border border-purple-500/30 bg-purple-950/60 sm:h-40 lg:h-48 xl:h-auto xl:aspect-[3/1]">
                  <img
                    src={blog.image_url}
                    alt=""
                    aria-hidden
                    className="absolute inset-0 w-full h-full object-cover opacity-30 blur-md scale-110"
                  />
                  <img
                    src={blog.image_url}
                    alt={blog.title}
                    className="absolute inset-0 w-full h-full object-contain"
                  />
                </div>
                <div className="hidden min-w-0 xl:flex xl:aspect-[3/1] xl:items-center">
                  <div className="w-full">
                    <AdSenseSlot slot="home" />
                  </div>
                </div>
              </div>
            ) : null}
            {blog.excerpt && (
              <p className="text-base text-purple-100/80 italic line-clamp-2">{blog.excerpt}</p>
            )}
            {blog.body && (
              <div ref={stageRef}>
                <div className="prose prose-invert max-w-none text-purple-50/90 leading-relaxed grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 pb-3">
                  {bodyItems.map((html, i) => (
                    <div key={`bi-${i}`} dangerouslySetInnerHTML={{ __html: html }} />
                  ))}
                </div>
              </div>
            )}
          </article>
        )}
      </div>
    </div>
  );
}
