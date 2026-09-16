import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import bgAsset from "@/assets/boro-fan-zone-profile-bg.jpg.asset.json";
import { fetchForumFeed, FORUM_FEED_PAGE_SIZE, type ForumFeedPost } from "@/lib/forum-feed";
import { ForumPostFeed, ForumFeedPager } from "@/components/app/ForumPostFeed";

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

function NewForumContentPage() {
  const [page, setPage] = useState(1);
  const [posts, setPosts] = useState<ForumFeedPost[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const res = await fetchForumFeed({ page });
      if (cancelled) return;
      setPosts(res.posts);
      setTotal(res.total);
      setLoading(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    })();
    return () => {
      cancelled = true;
    };
  }, [page]);

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
        <p className="mb-5 mt-1 text-sm text-white/70">{total} post{total === 1 ? "" : "s"} · 20 per page</p>
        <ForumPostFeed posts={posts} loading={loading} showAuthor empty="No forum posts yet." variant="grid" />
        <ForumFeedPager page={page} total={total} pageSize={FORUM_FEED_PAGE_SIZE} onPage={setPage} />
      </div>
    </div>
  );
}
