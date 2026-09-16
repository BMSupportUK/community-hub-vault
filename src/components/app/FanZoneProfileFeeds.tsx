import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Activity, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchForumFeed, type ForumFeedPost } from "@/lib/forum-feed";
import { ForumPostFeed } from "@/components/app/ForumPostFeed";

export type FanFeedTab = "activity" | "new";

/** Header buttons that open each feed on its own page. */
export function FanZoneProfileFeedTabs({ userId }: { userId: string }) {
  const cls =
    "flex min-h-12 items-center justify-center gap-1.5 px-3 py-3 text-sm font-semibold text-white/85 transition-colors hover:bg-[#E11B22] hover:text-white";

  return (
    <div className="grid w-full grid-cols-2 border-t border-white/20 bg-black/25">
      <Link
        to="/fanzone/posts/$userId"
        params={{ userId }}
        className={`${cls} border-r border-white/20`}
      >
        <Activity className="size-4" />
        Latest Activity
      </Link>
      <Link to="/fanzone/new-posts" className={cls}>
        <Sparkles className="size-4" />
        New Content
      </Link>
    </div>
  );
}

/** Content shown for the selected profile feed tab. */
export function FanZoneProfileFeedPanel({
  userId,
  tab,
}: {
  userId: string;
  tab: FanFeedTab;
}) {
  const [mine, setMine] = useState<ForumFeedPost[] | null>(null);
  const [all, setAll] = useState<ForumFeedPost[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setMine(null);
    void (async () => {
      const res = await fetchForumFeed({ authorId: userId, page: 1 });
      if (!cancelled) setMine(res.posts);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetchForumFeed({ page: 1 });
      if (!cancelled) setAll(res.posts);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (tab === "activity") {
    return (
      <div>
        <ForumPostFeed
          posts={mine ?? []}
          loading={mine === null}
          empty="This member hasn't posted in the forums yet."
        />
        <div className="mt-3 flex justify-center">
          <Button asChild variant="outline" className="border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white">
            <Link to="/fanzone/posts/$userId" params={{ userId }}>Show more</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <ForumPostFeed posts={all ?? []} loading={all === null} showAuthor empty="No forum posts yet." />
      <div className="mt-3 flex justify-center">
        <Button asChild variant="outline" className="border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white">
          <Link to="/fanzone/new-posts">Load more</Link>
        </Button>
      </div>
    </div>
  );
}
