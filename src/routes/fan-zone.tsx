import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { LandingHeader } from "@/components/LandingHeader";
import { listPublicBoards, type PublicBoard } from "@/lib/fan-zone-public.functions";
import { getIcon } from "@/components/app/IconPicker";
import { Loader2, Lock, Pin, MessageSquare, ChevronRight, LogIn } from "lucide-react";
import { formatLastSeen } from "@/lib/relative-time";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/fan-zone")({
  head: () => ({
    meta: [
      { title: "Boro Fan Zone — BM Support" },
      {
        name: "description",
        content:
          "Read the Boro Fan Zone forum: match-day debate, terrace banter and supporter-led boards. Sign in to post and react.",
      },
      { property: "og:title", content: "Boro Fan Zone — BM Support" },
      {
        property: "og:description",
        content: "Read the Boro Fan Zone forum: match-day debate and supporter-led boards.",
      },
    ],
  }),
  component: FanZoneBoardsPage,
});

function FanZoneBoardsPage() {
  const fetchBoards = useServerFn(listPublicBoards);
  const [boards, setBoards] = useState<PublicBoard[] | null>(null);
  useEffect(() => {
    void fetchBoards().then(setBoards).catch(() => setBoards([]));
  }, [fetchBoards]);
  return (
    <FanZoneShell>
      <h1 className="font-display text-2xl sm:text-3xl font-black text-white">Boro Fan Zone — boards</h1>
      <p className="mt-1 text-sm text-white/70">
        Browse supporter-led boards. Posting, reactions and polls require a member account.
      </p>
      {!boards ? (
        <div className="grid place-items-center py-20 text-white/60"><Loader2 className="size-5 animate-spin" /></div>
      ) : boards.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-sm text-white/70 mt-6">
          No boards yet.
        </div>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((b) => {
            const Icon = getIcon(b.icon);
            return (
              <Link
                key={b.id}
                to="/fan-zone/$board"
                params={{ board: b.slug }}
                className="group flex flex-col rounded-xl border border-white/10 bg-white/5 hover:border-[#E11B22]/60 hover:bg-white/10 transition-colors overflow-hidden"
              >
                <span className="h-1 bg-gradient-to-r from-[#E11B22] to-[#8B0F14]" aria-hidden />
                <div className="p-4 flex-1 flex flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <div className="size-10 rounded-lg bg-gradient-to-br from-[#E11B22] to-[#8B0F14] grid place-items-center text-white shrink-0">
                      <Icon className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {b.is_pinned && <Pin className="size-3.5 text-amber-400 shrink-0" />}
                        {b.is_locked && <Lock className="size-3.5 text-white/50 shrink-0" />}
                        <h2 className="font-display font-bold truncate text-white group-hover:text-[#E11B22] transition-colors">
                          {b.name}
                        </h2>
                        <ChevronRight className="size-4 ml-auto text-white/30 group-hover:text-[#E11B22] transition-colors shrink-0" />
                      </div>
                      <p className="text-xs text-white/60 line-clamp-2 mt-1">{b.description}</p>
                    </div>
                  </div>
                  <div className="mt-auto pt-3 border-t border-white/10 flex items-center justify-between text-[11px] text-white/60">
                    <span className="inline-flex items-center gap-1.5">
                      <MessageSquare className="size-3.5 text-[#E11B22]" />
                      <span className="font-bold text-white">{b.topic_count}</span> topics
                      <span className="text-white/30">·</span>
                      <span className="font-bold text-white">{Math.max(0, b.post_count - b.topic_count)}</span> replies
                    </span>
                    {b.last_post_at ? <span>{formatLastSeen(b.last_post_at)}</span> : <span className="italic">No posts yet</span>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </FanZoneShell>
  );
}

export function FanZoneShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background">
      <LandingHeader />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {!user && (
          <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
            <p className="text-sm text-amber-100/90">
              You're viewing the Boro Fan Zone as a guest. Sign in or request access to post, react and join polls.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => navigate({ to: "/login" })}>
                <LogIn className="size-4 mr-1.5" /> Sign in
              </Button>
              <Button
                size="sm"
                className="bg-red-600 text-white hover:bg-red-500"
                onClick={() => navigate({ to: "/signup" })}
              >
                Request access
              </Button>
            </div>
          </div>
        )}
        <div className="rounded-2xl border border-[#E11B22]/30 bg-gradient-to-br from-[#1a0608] via-[#0b1a2b] to-[#0b1a2b] p-5 sm:p-7 shadow-[0_10px_40px_-10px_rgba(225,27,34,0.4)]">
          {children}
        </div>
      </div>
    </div>
  );
}