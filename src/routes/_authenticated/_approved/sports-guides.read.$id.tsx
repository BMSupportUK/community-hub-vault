import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeRichHtml } from "@/lib/sanitize-html";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { annotateTimesInEl } from "@/lib/parse-event-times";
import { PagedGrid, PaginationBar } from "@/lib/paginate-by-height";

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
};
type Category = { id: string; name: string };

function ReadPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [blog, setBlog] = useState<Blog | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [stageHeight, setStageHeight] = useState(0);
  // Guides sourced from Flosports (College Football, Racing) publish their
  // schedules in US Eastern time, not GMT. Detect by title so bare times
  // without a zone are interpreted in ET.
  const defaultSourceZone =
    blog && /^\s*flosports\b/i.test(blog.title) ? "ET" : "GMT";
  const viewerTz =
    (typeof Intl !== "undefined" && Intl.DateTimeFormat().resolvedOptions().timeZone) || "UTC";

  useEffect(() => {
    (async () => {
      const [{ data: b, error }, { data: cats }] = await Promise.all([
        supabase.from("sports_blogs").select("*").eq("id", id).maybeSingle(),
        supabase.from("sports_categories").select("id, name").order("sort_order"),
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

  // Annotate the full sanitized guide first, then split into top-level item
  // strings so each paginated grid item keeps its complete event-card wrapper.
  const bodyItems = useMemo(() => {
    if (!blog?.body) return [] as string[];
    if (typeof document === "undefined") return [];
    const wrap = document.createElement("div");
    wrap.innerHTML = sanitizeRichHtml(blog.body);
    annotateTimesInEl(wrap, viewerTz, defaultSourceZone);
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
  }, [blog?.body, viewerTz, defaultSourceZone]);

  // Reset to first page when switching guides.
  useEffect(() => {
    setPage(0);
  }, [id]);

  useEffect(() => {
    setPage((current) => Math.min(current, Math.max(0, pageCount - 1)));
  }, [pageCount]);

  // Measure available height of the body stage.
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () => setStageHeight(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading]);

  // Arrow-key navigation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement) {
        const tag = e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) return;
      }
      if (e.key === "ArrowLeft") setPage((p) => Math.max(0, p - 1));
      else if (e.key === "ArrowRight") setPage((p) => Math.min(pageCount - 1, p + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pageCount]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gradient-to-br from-[#1a0b2e] via-[#2d1b4e] to-[#1a0b2e]">
      <header className="flex items-center justify-between gap-4 px-8 py-5 border-b border-purple-500/30 bg-purple-950/60 backdrop-blur shrink-0">
        <Button
          variant="ghost"
          className="text-purple-200 hover:text-white hover:bg-purple-800/60"
          onClick={() =>
            navigate({ to: "/sports-guides", search: { cat: blog?.category_id || undefined } })
          }
        >
          <ArrowLeft className="size-4 mr-1" /> Back to guides
        </Button>
        {pageCount > 1 && (
          <span className="text-xs text-purple-200/70 font-medium">
            Page {page + 1} of {pageCount}
          </span>
        )}
      </header>
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {loading || !blog ? (
          <div className="px-6 py-12 text-center text-purple-200/70">Loading…</div>
        ) : (
          <article className="flex-1 min-h-0 w-full max-w-none mx-auto px-3 sm:px-6 py-6 flex flex-col gap-4 overflow-hidden">
            <div className="flex flex-wrap gap-2">
              <span className="text-xs px-2 py-1 rounded-md bg-fuchsia-500/30 text-white font-semibold border border-fuchsia-400/50">
                {categories.find((c) => c.id === blog.category_id)?.name}
              </span>
              {blog.badge && (
                <span className="text-xs px-2 py-1 rounded-md bg-violet-500/20 text-violet-200 font-medium border border-violet-500/30">
                  {blog.badge}
                </span>
              )}
            </div>
            <h1 className="font-display text-2xl md:text-3xl font-bold text-white">
              {blog.title}
            </h1>
            {blog.refresh_notice && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-amber-100">
                <RefreshCw className="size-4 shrink-0 mt-0.5" />
                <div className="text-sm leading-relaxed">{blog.refresh_notice}</div>
              </div>
            )}
            {blog.not_guaranteed && (
              <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-rose-100 text-sm leading-relaxed">
                These are not guaranteed and no reports allowed to source.
              </div>
            )}
            {blog.image_url && (
              <img
                src={blog.image_url}
                alt={blog.title}
                className="max-h-32 md:max-h-40 w-auto mx-auto rounded-2xl border border-purple-500/30 object-contain"
              />
            )}
            {blog.excerpt && (
              <p className="text-base text-purple-100/80 italic line-clamp-2">{blog.excerpt}</p>
            )}
            {blog.body && (
              <div ref={stageRef} className="flex-1 min-h-0 relative overflow-hidden">
                <PagedGrid
                  items={bodyItems}
                  availableHeight={stageHeight}
                  maxRows={2}
                  page={page}
                  onPagesChange={setPageCount}
                  className="prose prose-invert max-w-none text-purple-50/90 leading-relaxed grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
                  renderItem={(html, i) => (
                    <div key={`bi-${i}`} dangerouslySetInnerHTML={{ __html: html }} />
                  )}
                />
              </div>
            )}
          </article>
        )}
        {pageCount > 1 && (
          <div className="shrink-0 py-2 border-t border-purple-500/30 bg-purple-950/60 backdrop-blur">
            <PaginationBar page={page} pageCount={pageCount} onPageChange={setPage} />
          </div>
        )}
      </div>
    </div>
  );
}
