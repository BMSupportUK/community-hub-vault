import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Activity, Sparkles } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { fetchForumFeed, type ForumFeedPost } from "@/lib/forum-feed";
import { ForumPostFeed } from "@/components/app/ForumPostFeed";

/** Latest activity for one member plus the newest posts from everyone. */
export function FanZoneProfileFeeds({ userId }: { userId: string }) {
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

  return (
    <div className="rounded-xl border border-white/12 bg-black/35 p-4">
      <Tabs defaultValue="activity">
        <TabsList className="mb-3 bg-white/10">
          <TabsTrigger value="activity" className="data-[state=active]:bg-[#E11B22] data-[state=active]:text-white">
            <Activity className="size-4 mr-1.5" />Latest Activity
          </TabsTrigger>
          <TabsTrigger value="new" className="data-[state=active]:bg-[#E11B22] data-[state=active]:text-white">
            <Sparkles className="size-4 mr-1.5" />New Content
          </TabsTrigger>
        </TabsList>

        <TabsContent value="activity" className="mt-0">
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
        </TabsContent>

        <TabsContent value="new" className="mt-0">
          <ForumPostFeed posts={all ?? []} loading={all === null} showAuthor empty="No forum posts yet." />
          <div className="mt-3 flex justify-center">
            <Button asChild variant="outline" className="border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white">
              <Link to="/fanzone/new-posts">Load more</Link>
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
