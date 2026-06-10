import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Lock, Pin, ArrowLeft } from "lucide-react";
import { getPublicTopic, type PublicTopicDetail } from "@/lib/fan-zone-public.functions";
import { ForumPostBody } from "@/components/app/ForumPostBody";
import { formatLastSeen } from "@/lib/relative-time";
import { Button } from "@/components/ui/button";
import { FanZoneShell } from "./fan-zone";

export const Route = createFileRoute("/fan-zone/$board/$topic")({
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
  const fetchTopic = useServerFn(getPublicTopic);
  const [data, setData] = useState<PublicTopicDetail | null | "missing">(null);
  useEffect(() => {
    void fetchTopic({ data: { topicId } }).then((r) => setData(r ?? "missing"));
  }, [topicId, fetchTopic]);

  if (data === null) {
    return (
      <FanZoneShell>
        <div className="grid place-items-center py-20 text-white/60"><Loader2 className="size-5 animate-spin" /></div>
      </FanZoneShell>
    );
  }
  if (data === "missing") {
    return (
      <FanZoneShell>
        <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-sm text-white/70">
          Topic not found. <Link to="/fan-zone" className="underline">Back to boards</Link>
        </div>
      </FanZoneShell>
    );
  }

  return (
    <FanZoneShell>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 text-white/80 hover:text-white">
        <Link to="/fan-zone/$board" params={{ board: slug }}>
          <ArrowLeft className="size-4 mr-1" /> {data.board.name || "Back"}
        </Link>
      </Button>
      <div className="flex items-center gap-2 flex-wrap">
        {data.topic.is_sticky && <Pin className="size-4 text-amber-400" />}
        {data.topic.is_locked && <Lock className="size-4 text-white/50" />}
        <h1 className="font-display text-xl sm:text-2xl font-bold text-white">{data.topic.title}</h1>
      </div>
      <p className="text-xs text-white/60 mt-1">Started {formatLastSeen(data.topic.created_at)} · {data.topic.reply_count} replies · {data.topic.view_count} views</p>

      <ol className="mt-5 space-y-3">
        {data.posts.map((p) => (
          <li key={p.id} className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5">
            <header className="flex items-center gap-2.5 mb-3">
              {p.author_avatar ? (
                <img src={p.author_avatar} alt="" className="size-8 rounded-full object-cover ring-1 ring-white/20" />
              ) : (
                <div className="size-8 rounded-full bg-[#E11B22]/30 grid place-items-center text-[11px] font-bold text-white ring-1 ring-white/20">
                  {p.author_alias.charAt(0)}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white truncate">{p.author_alias}</div>
                <div className="text-[11px] text-white/50">{formatLastSeen(p.created_at)}{p.is_op ? " · Original post" : ""}</div>
              </div>
            </header>
            <ForumPostBody html={p.body} className="text-white/90" />
          </li>
        ))}
      </ol>

      <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-100/90 text-center">
        Polls, reactions and replies are visible to Boro Fan Zone members.{" "}
        <Link to="/login" className="underline font-semibold">Sign in</Link> or{" "}
        <Link to="/signup" className="underline font-semibold">request access</Link> to join in.
      </div>
    </FanZoneShell>
  );
}