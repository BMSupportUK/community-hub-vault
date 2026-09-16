import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Activity, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchForumFeed, type ForumFeedPost } from "@/lib/forum-feed";
import { ForumPostFeed } from "@/components/app/ForumPostFeed";

export type FanFeedTab = "activity" | "new";

/** Tab strip that sits inside the profile header. */
export function FanZoneProfileFeedTabs({
  value,
  onChange,
}: {
  value: FanFeedTab;
  onChange: (tab: FanFeedTab) => void;
}) {
  const tabs: { key: FanFeedTab; label: string; Icon: typeof Activity }[] = [
    { key: "activity", label: "Latest Activity", Icon: Activity },
    { key: "new", label: "New Content", Icon: Sparkles },
  ];

  return (
    <div className="grid w-full grid-cols-2 border-t border-white/20 bg-black/25">
      {tabs.map(({ key, label, Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={value === key}
          className={`flex min-h-12 items-center justify-center gap-1.5 px-3 py-3 text-sm font-semibold transition-colors ${
            key === "activity" ? "border-r border-white/20" : ""
          } ${
            value === key
              ? "bg-[#E11B22] text-white"
              : "text-white/75 hover:bg-white/10 hover:text-white"
          }`}
        >
          <Icon className="size-4" />
          {label}
        </button>
      ))}
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
