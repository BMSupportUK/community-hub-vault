import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import bgAsset from "@/assets/boro-fan-zone-profile-bg.jpg.asset.json";
import { fetchForumFeed, FORUM_FEED_PAGE_SIZE, type ForumFeedPost } from "@/lib/forum-feed";
import { ForumPostFeed, ForumFeedPager } from "@/components/app/ForumPostFeed";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { getReadNewContentIds, markNewContentRead, NEW_CONTENT_READ_EVENT } from "@/lib/forum-new-content";

export const Route = createFileRoute("/_authenticated/_approved/fanzone/new-posts")({
  head: () => ({
    meta: [
      { title: "New forum content | Boro Fan Zone" },
      { name: "description", content: "The newest Boro Fan Zone forum topics and replies from every member, 20 per page." },
      { property: "og:title", content: "New forum content | Boro Fan Zone" },
      { property: "og:description", content: "The newest Boro Fan Zone forum posts from every member." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewForumContentPage,
});

type FeedTab = "topics" | "replies";

function NewForumContentPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<FeedTab>("topics");
  const [page, setPage] = useState(1);
  const [posts, setPosts] = useState<ForumFeedPost[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [since, setSince] = useState<string | null>(null);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  // Load the "last read" marker so brand new posts can flash, and remember
  // what has already been opened.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("forum_new_content_reads")
        .select("last_viewed_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setSince(data?.last_viewed_at ?? null);
      setReadIds(getReadNewContentIds(user.id));
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const openPost = (post: ForumFeedPost) => {
    if (!user?.id) return;
    setReadIds((prev) => new Set(prev).add(post.id));
    markNewContentRead(user.id, [post.id]);
  };

  const markAllRead = () => {
    if (!user?.id) return;
    const ids = posts.map((p) => p.id);
    setReadIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
    markNewContentRead(user.id, ids);
    void supabase
      .from("forum_new_content_reads")
      .upsert({ user_id: user.id, last_viewed_at: new Date().toISOString() })
      .then(() => {
        setSince(new Date().toISOString());
        window.dispatchEvent(new CustomEvent(NEW_CONTENT_READ_EVENT));
      });
  };

  const unreadIds = new Set(
    posts.filter((p) => since && p.created_at > since && !readIds.has(p.id)).map((p) => p.id),
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const res = await fetchForumFeed({ page, kind: tab });
      if (cancelled) return;
      setPosts(res.posts);
      setTotal(res.total);
      setLoading(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    })();
    return () => {
      cancelled = true;
    };
  }, [page, tab]);

  return (
    <div
      className="boro-theme relative min-h-[calc(100vh-4rem)] w-full overflow-hidden bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url(${bgAsset.url})` }}
    >
      <div className="absolute inset-0 bg-black/80" aria-hidden />
      <div className="relative z-10 w-full px-4 py-8 sm:px-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3 text-white hover:bg-white/10 hover:text-white">
          <Link to="/forum">
            <ArrowLeft className="size-4 mr-1" />Back to forum
          </Link>
        </Button>
        <h1 className="font-display text-2xl font-black text-white sm:text-3xl">New forum content</h1>
        <p className="mt-1 text-sm text-white/70">
          {total} {tab === "topics" ? "topic" : "reply"}
          {total === 1 ? "" : tab === "topics" ? "s" : "s"} · 20 per page
        </p>
        <div className="mb-5 mt-4 inline-flex rounded-xl border border-white/15 bg-white/5 p-1">
          {(["topics", "replies"] as FeedTab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTab(t);
                setPage(1);
              }}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
                tab === t ? "bg-[#E11B22] text-white" : "text-white/70 hover:text-white"
              }`}
            >
              {t === "topics" ? "New topics" : "Replies"}
            </button>
          ))}
        </div>
        <ForumPostFeed
          posts={posts}
          loading={loading}
          showAuthor
          empty={tab === "topics" ? "No new topics yet." : "No replies yet."}
          variant="grid"
        />
        <ForumFeedPager page={page} total={total} pageSize={FORUM_FEED_PAGE_SIZE} onPage={setPage} />
      </div>
    </div>
  );
}
