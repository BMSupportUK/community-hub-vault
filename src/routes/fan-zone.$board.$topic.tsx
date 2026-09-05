import { createFileRoute, Link } from "@tanstack/react-router";
import { Lock, Pin, ArrowLeft, ArrowUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getPublicTopic, type PublicPost } from "@/lib/fan-zone-public.functions";
import { ForumPostBody } from "@/components/app/ForumPostBody";
import { RelativeTime } from "@/components/app/RelativeTime";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { isTeamSheetPost, sortTeamSheetPosts } from "@/lib/forum-team-sheet";
import { FanZoneShell } from "./fan-zone";


export const Route = createFileRoute("/fan-zone/$board/$topic")({
  loader: ({ params }) => getPublicTopic({ data: { topicId: params.topic } }),
  head: () => ({
    meta: [
      { title: "Topic — Boro Fan Zone" },
      { name: "description", content: "Read a Boro Fan Zone topic. Sign in to reply or react." },
    ],
  }),
  component: TopicReadPage,
});

function TopicReadPage() {
  const { board: slug, topic: topicId } = Route.useParams();
  const data = Route.useLoaderData();
  const [activeTab, setActiveTab] = useState("posts");
  const [showBackTop, setShowBackTop] = useState(false);
  const repliesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => {
      const el = repliesRef.current;
      const top = el ? Math.max(el.scrollTop, window.scrollY, document.documentElement.scrollTop) : Math.max(window.scrollY, document.documentElement.scrollTop);
      setShowBackTop(top > 300);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    const el = repliesRef.current;
    if (el) el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (el) el.removeEventListener("scroll", onScroll);
    };
  }, []);

  const scrollToTop = () => {
    repliesRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!data) {
    return (
      <FanZoneShell>
        <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-sm text-white/70">
          Topic not found. <Link to="/fan-zone" className="underline">Back to boards</Link>
        </div>
      </FanZoneShell>
    );
  }

  const posts = data.posts as PublicPost[];
  const op = posts.find((p) => p.is_op) ?? null;
  const teamPosts = sortTeamSheetPosts(posts.filter((p) => !p.is_op && isTeamSheetPost(p.body)));
  const replies = posts.filter((p) => !p.is_op && !isTeamSheetPost(p.body));

  return (
    <FanZoneShell>
      <div className="flex items-center gap-1 -ml-2 mb-2 flex-wrap">
        <Button asChild variant="ghost" size="sm" className="text-white/80 hover:text-white px-2">
          <Link to="/fan-zone">
            <ArrowLeft className="size-4 mr-1" /> Boards
          </Link>
        </Button>
        <span className="text-white/30">/</span>
        <Button asChild variant="ghost" size="sm" className="text-white/80 hover:text-white px-2">
          <Link to="/fan-zone/$board" params={{ board: slug }}>
            {data.board.name || "Back"}
          </Link>
        </Button>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {data.topic.is_sticky && <Pin className="size-4 text-amber-400" />}
        {data.topic.is_locked && <Lock className="size-4 text-white/50" />}
        <h1 className="font-display text-xl sm:text-2xl font-bold text-white">{data.topic.title}</h1>
      </div>
      <p className="text-xs text-white/60 mt-1">Started <RelativeTime iso={data.topic.created_at} /> · {data.topic.reply_count} replies · {data.topic.view_count} views</p>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mt-5">
        <TabsList>
          <TabsTrigger value="posts">Original Post</TabsTrigger>
          {teamPosts.length > 0 && <TabsTrigger value="teams">Teams ({teamPosts.length})</TabsTrigger>}
          <TabsTrigger value="replies">Replies ({replies.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="posts" className="space-y-3 mt-3">
          {op ? <PostCard post={op} /> : (
            <p className="text-sm text-white/60">No post content.</p>
          )}
        </TabsContent>

        <TabsContent value="teams" className="space-y-3 mt-3">
          {teamPosts.length === 0 ? (
            <p className="text-sm text-white/60">The team sheet hasn't been announced yet.</p>
          ) : (
            <ol className="space-y-3">
              {teamPosts.map((p) => (
                <li key={p.id}><PostCard post={p} /></li>
              ))}
            </ol>
          )}
        </TabsContent>


        <TabsContent value="replies" className="space-y-3 mt-3 relative">
          <div ref={repliesRef} className="max-h-[70vh] overflow-y-auto pr-1 -mr-1">
            {replies.length === 0 ? (
              <p className="text-sm text-white/60">No replies yet.</p>
            ) : (
              <ol className="space-y-3">
                {replies.map((p) => (
                  <li key={p.id}><PostCard post={p} /></li>
                ))}
              </ol>
            )}
          </div>
          {activeTab === "replies" && showBackTop && (
            <Button
              type="button"
              size="icon"
              onClick={scrollToTop}
              className="fixed bottom-6 right-6 size-11 rounded-full bg-gradient-to-r from-[#E11B22] to-[#8B0F14] text-white shadow-lg shadow-red-900/50 hover:shadow-red-500/40 hover:scale-110 transition-all z-50"
              aria-label="Back to top"
              title="Back to top"
            >
              <ArrowUp className="size-5" />
            </Button>
          )}
        </TabsContent>
      </Tabs>

      <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-100/90 text-center">
        Polls, reactions and replies are visible to Boro Fan Zone members.{" "}
        <Link to="/login" className="underline font-semibold">Sign in</Link> or{" "}
        <Link to="/signup" className="underline font-semibold">request access</Link> to join in.
      </div>
    </FanZoneShell>
  );
}

function PostCard({ post: p }: { post: PublicPost }) {
  return (
    <div className={`rounded-xl border p-4 sm:p-5 ${p.is_pinned && !p.is_op ? "border-amber-400/40 bg-amber-400/5" : "border-white/10 bg-white/5"}`}>
      <header className="flex items-center gap-2.5 mb-3">
        <Link
          to="/fan-zone/u/$userId"
          params={{ userId: p.author_id }}
          className="shrink-0"
          aria-label={`${p.author_alias}'s Boro Fan Zone profile`}
        >
          {p.author_avatar ? (
            <img src={p.author_avatar} alt="" className="size-8 rounded-full object-cover ring-1 ring-white/20 hover:ring-[#E11B22]" />
          ) : (
            <div className="size-8 rounded-full bg-[#E11B22]/30 grid place-items-center text-[11px] font-bold text-white ring-1 ring-white/20 hover:ring-[#E11B22]">
              {p.author_alias.charAt(0)}
            </div>
          )}
        </Link>
        <div className="min-w-0">
          <Link
            to="/fan-zone/u/$userId"
            params={{ userId: p.author_id }}
            className="block text-sm font-semibold text-white truncate hover:text-[#E11B22] hover:underline"
          >
            {p.author_alias}
          </Link>
          <div className="text-[11px] text-white/50"><RelativeTime iso={p.created_at} />{p.is_op ? " · Original post" : ""}</div>
        </div>
        {p.is_pinned && !p.is_op && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
            <Pin className="size-3" /> Pinned
          </span>
        )}
      </header>
      <ForumPostBody html={p.body} className="text-white/90" />
    </div>
  );
}