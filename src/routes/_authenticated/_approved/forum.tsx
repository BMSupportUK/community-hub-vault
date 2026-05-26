import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Trophy, MessageSquare, Pin, Lock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useFanZoneMembership } from "@/hooks/use-fan-zone";
import { getIcon } from "@/components/app/IconPicker";
import { formatLastSeen } from "@/lib/relative-time";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/_approved/forum")({
  component: ForumLayout,
});

type Board = {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  sort_order: number;
  is_pinned: boolean;
  is_locked: boolean;
  topic_count: number;
  post_count: number;
  last_post_at: string | null;
  last_post_by: string | null;
};

function ForumLayout() {
  const matches = useMatches();
  const isNested = matches.some((m) => m.routeId.startsWith("/_authenticated/_approved/forum/"));
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <header className="mb-6 flex items-center gap-3">
        <div className="size-10 rounded-xl bg-gradient-to-br from-rose-600 to-amber-500 grid place-items-center text-white shadow-md">
          <Trophy className="size-5" />
        </div>
        <div className="flex-1">
          <h1 className="font-display text-2xl font-bold leading-tight">Boro Fan Zone Forum</h1>
          <p className="text-xs text-muted-foreground">Up the Boro — boards, topics & match-day banter.</p>
        </div>
      </header>
      {isNested ? <Outlet /> : <BoardsIndex />}
    </div>
  );
}

function BoardsIndex() {
  const { user, hasAny } = useAuth();
  const isStaff = hasAny(["admin", "management", "moderator"]);
  const info = useFanZoneMembership(user?.id ?? null);
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [posters, setPosters] = useState<Record<string, { display_name: string | null; username: string | null }>>({});

  const canEnter = isStaff || info?.status === "approved";

  useEffect(() => {
    if (!canEnter) return;
    void (async () => {
      const { data } = await supabase
        .from("forum_boards")
        .select("id, name, slug, description, icon, sort_order, is_pinned, is_locked, topic_count, post_count, last_post_at, last_post_by")
        .order("is_pinned", { ascending: false })
        .order("sort_order");
      const list = (data ?? []) as Board[];
      setBoards(list);
      const ids = Array.from(new Set(list.map((b) => b.last_post_by).filter((x): x is string => !!x)));
      if (ids.length) {
        const { data: ps } = await supabase.from("profiles").select("id, display_name, username").in("id", ids);
        const map: Record<string, { display_name: string | null; username: string | null }> = {};
        (ps ?? []).forEach((p) => { map[p.id as string] = { display_name: p.display_name as string | null, username: p.username as string | null }; });
        setPosters(map);
      }
    })();
  }, [canEnter]);

  if (!canEnter) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-8 text-center">
        <Lock className="size-8 mx-auto mb-3 text-amber-400" />
        <h2 className="font-display text-lg font-bold mb-1">Members only</h2>
        <p className="text-sm text-muted-foreground mb-4">
          The Boro Fan Zone forum is open to approved supporters only.{" "}
          {info?.status === "pending" ? "Your request is waiting on a mod." : "Request access from the sidebar."}
        </p>
      </div>
    );
  }

  if (!boards) {
    return <div className="grid place-items-center py-20 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>;
  }

  return (
    <div className="space-y-3">
      {boards.map((b) => {
        const Icon = getIcon(b.icon);
        const poster = b.last_post_by ? posters[b.last_post_by] : null;
        const posterName = poster?.display_name || poster?.username || (b.last_post_by ? "someone" : null);
        return (
          <Link
            key={b.id}
            to="/forum/$board"
            params={{ board: b.slug }}
            className="block rounded-xl border border-border bg-surface-1 hover:border-primary/60 hover:shadow-glow transition-all overflow-hidden"
          >
            <div className="grid grid-cols-[auto_1fr_auto] gap-4 p-4 items-center">
              <div className="size-11 rounded-lg bg-gradient-to-br from-rose-600/20 to-amber-500/20 border border-rose-500/30 grid place-items-center text-rose-300">
                <Icon className="size-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {b.is_pinned && <Pin className="size-3.5 text-amber-400" />}
                  {b.is_locked && <Lock className="size-3.5 text-muted-foreground" />}
                  <h3 className="font-display font-bold truncate">{b.name}</h3>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{b.description}</p>
              </div>
              <div className="hidden sm:block text-right text-[11px] text-muted-foreground min-w-[140px]">
                <div><span className="font-semibold text-foreground">{b.topic_count}</span> topics · <span className="font-semibold text-foreground">{b.post_count}</span> posts</div>
                {b.last_post_at ? (
                  <div className="mt-1 truncate">
                    Last: {formatLastSeen(b.last_post_at)}
                    {posterName ? <> by <span className="text-foreground">{posterName}</span></> : null}
                  </div>
                ) : (
                  <div className="mt-1 italic">No posts yet</div>
                )}
              </div>
            </div>
          </Link>
        );
      })}
      <div className="pt-2 text-center">
        <Button asChild variant="ghost" size="sm">
          <Link to="/home">← Back to channels</Link>
        </Button>
      </div>
    </div>
  );
}