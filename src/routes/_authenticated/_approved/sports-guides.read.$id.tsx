import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeRichHtml } from "@/lib/sanitize-html";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { annotateTimesInEl } from "@/lib/parse-event-times";

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
  // Use the browser-detected timezone (the viewer's PC clock) so the pill
  // reflects the device the page is rendered on, regardless of any saved
  // profile timezone preference.
  const viewerTz =
    (typeof Intl !== "undefined" && Intl.DateTimeFormat().resolvedOptions().timeZone) || "UTC";
  const viewerTzLabel = viewerTz.replace(/_/g, " ");
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [blog, setBlog] = useState<Blog | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    const el = bodyRef.current;
    if (!el || !blog?.body) return;
    let scheduled = false;
    const run = () => {
      observer.disconnect();
      annotateTimesInEl(el, viewerTz, "GMT");
      observer.observe(el, { childList: true, subtree: true });
    };
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        run();
      });
    });
    run();
    return () => observer.disconnect();
  }, [blog?.body, viewerTz]);

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
      </header>
      <div className="flex-1 overflow-y-auto">
        {loading || !blog ? (
          <div className="px-6 py-12 text-center text-purple-200/70">Loading…</div>
        ) : (
          <article className="w-full max-w-none mx-auto px-3 sm:px-6 py-8 space-y-5 overflow-hidden">
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
            <h1 className="font-display text-3xl md:text-4xl font-bold text-white">
              {blog.title}
            </h1>
            {blog.refresh_notice && (
              <div className="flex items-start gap-3 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-amber-100">
                <RefreshCw className="size-5 shrink-0 mt-0.5" />
                <div className="text-sm leading-relaxed">{blog.refresh_notice}</div>
              </div>
            )}
            {blog.not_guaranteed && (
              <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-rose-100 text-sm leading-relaxed">
                These are not guaranteed and no reports allowed to source.
              </div>
            )}
            {blog.image_url && (
              <img
                src={blog.image_url}
                alt={blog.title}
                className="max-h-48 md:max-h-64 w-auto mx-auto rounded-2xl border border-purple-500/30 object-contain"
              />
            )}
            {blog.excerpt && <p className="text-lg text-purple-100/80 italic">{blog.excerpt}</p>}
            {blog.body && (
              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-[0.18em] text-purple-200/50 font-semibold px-1 pb-2 flex flex-wrap gap-x-4 gap-y-1">
                  <span>Source (GMT)</span>
                  <span className="text-fuchsia-300 normal-case tracking-wide">
                    Local ({viewerTzLabel})
                  </span>
                </div>
                <div
                  ref={bodyRef}
                  className="prose prose-invert max-w-none text-purple-50/90 leading-relaxed grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
                  dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(blog.body) }}
                />
              </div>
            )}
          </article>
        )}
      </div>
    </div>
  );
}
