import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeRichHtml } from "@/lib/sanitize-html";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

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
};
type Category = { id: string; name: string };

function ReadPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
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
      setBlog(b as Blog);
      setCategories((cats ?? []) as Category[]);
      setLoading(false);
      if (user?.id) {
        await supabase
          .from("sports_blog_reads")
          .upsert(
            { user_id: user.id, blog_id: id, read_at: new Date().toISOString() },
            { onConflict: "user_id,blog_id" }
          );
      }
    })();
  }, [id, user?.id, navigate]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gradient-to-br from-[#1a0b2e] via-[#2d1b4e] to-[#1a0b2e]">
      <header className="flex items-center justify-between gap-4 px-8 py-5 border-b border-purple-500/30 bg-purple-950/60 backdrop-blur shrink-0">
        <Button
          variant="ghost"
          className="text-purple-200 hover:text-white hover:bg-purple-800/60"
          onClick={() => navigate({ to: "/sports-guides", search: { cat: blog?.category_id || undefined } })}
        >
          <ArrowLeft className="size-4 mr-1" /> Back to guides
        </Button>
      </header>
      <div className="flex-1 overflow-y-auto">
        {loading || !blog ? (
          <div className="px-6 py-12 text-center text-purple-200/70">Loading…</div>
        ) : (
          <article className="max-w-3xl mx-auto px-6 py-8 space-y-5">
            <div className="flex flex-wrap gap-2">
              <span className="text-xs px-2 py-1 rounded-md bg-fuchsia-500/20 text-fuchsia-200 font-medium border border-fuchsia-500/30">
                {categories.find((c) => c.id === blog.category_id)?.name}
              </span>
              {blog.badge && (
                <span className="text-xs px-2 py-1 rounded-md bg-violet-500/20 text-violet-200 font-medium border border-violet-500/30">
                  {blog.badge}
                </span>
              )}
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-bold bg-gradient-to-r from-violet-400 via-fuchsia-400 to-blue-400 bg-clip-text text-transparent">
              {blog.title}
            </h1>
            {blog.image_url && (
              <img src={blog.image_url} alt={blog.title} className="w-full rounded-2xl border border-purple-500/30" />
            )}
            {blog.excerpt && (
              <p className="text-lg text-purple-100/80 italic">{blog.excerpt}</p>
            )}
            {blog.body && (
              <div
                className="prose prose-invert max-w-none text-purple-50/90 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(blog.body) }}
              />
            )}
          </article>
        )}
      </div>
    </div>
  );
}