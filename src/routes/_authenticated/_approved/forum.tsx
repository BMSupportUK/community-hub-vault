import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { MessageSquare, Pin, Lock, Loader2, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useFanZoneMembership } from "@/hooks/use-fan-zone";
import { getIcon } from "@/components/app/IconPicker";
import { formatLastSeen } from "@/lib/relative-time";
import { Button } from "@/components/ui/button";
import { Ban, BarChart3, UserCog, Search as SearchIcon } from "lucide-react";
import { FanZoneStaffBox } from "@/components/app/FanZoneStaffBox";
import { BoroMatchCentreBox } from "@/components/app/BoroMatchCentreBox";
import { BoroLiveMatchStrip } from "@/components/app/BoroLiveMatchStrip";
import { FanZoneNameGate } from "@/components/app/FanZoneNamePrompt";
import { FanZoneMentionsBell } from "@/components/app/FanZoneMentionsBell";
import { useFanAliasVersion } from "@/hooks/use-fan-alias-version";
import boroHero from "@/assets/boro-hero.jpg";
import boroBadge from "@/assets/boro-fan-zone-badge.png";
import boroBg from "@/assets/boro-bg.jpg";
import { censorText, useProfanityWords } from "@/lib/profanity";
import { getPublicForumStats } from "@/lib/fan-zone-public.functions";

export const Route = createFileRoute("/_authenticated/_approved/forum")({
  head: () => ({
    meta: [
      { title: "Boro Fan Zone | BM Support" },
      { name: "description", content: "Join the Boro Fan Zone for Middlesbrough supporter boards, match-day debate, private messages and member discussions." },
      { property: "og:title", content: "Boro Fan Zone | BM Support" },
      { property: "og:description", content: "Join the Boro Fan Zone for Middlesbrough supporter boards, match-day debate, private messages and member discussions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
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
  const { user } = useAuth();
  const info = useFanZoneMembership(user?.id ?? null);
  useEffect(() => {
    const html = document.documentElement;
    html.style.setProperty("--boro-bg-image", `url(${boroBg})`);
    html.classList.add("boro-bg-active");
    return () => {
      html.classList.remove("boro-bg-active");
      html.style.removeProperty("--boro-bg-image");
    };
  }, []);
  return (
    <div className="boro-theme relative w-full h-full overflow-y-auto scrollbar-hide px-4 sm:px-6 lg:px-10 py-6">
      <header className="relative mb-6 overflow-hidden rounded-xl border border-[#E11B22]/55 shadow-[0_14px_46px_-12px_rgba(0,0,0,0.8)]">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${boroHero})` }}
          aria-hidden
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(115deg, rgba(225,27,34,0.92) 0%, rgba(139,15,20,0.85) 45%, rgba(11,26,43,0.85) 100%)",
          }}
          aria-hidden
        />
        {/* Diagonal stripe pattern */}
        <div
          className="absolute inset-0 opacity-[0.08] mix-blend-overlay"
          style={{
            backgroundImage:
              "repeating-linear-gradient(135deg, #fff 0 2px, transparent 2px 14px)",
          }}
          aria-hidden
        />
        <div className="relative px-4 py-5 sm:px-8 sm:py-6 flex flex-col gap-5">
          <div className="z-10 grid w-full grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
            {(() => {
              const fields = [
                info?.fanAlias,
                info?.fanAvatarUrl,
                info?.bio,
                info?.supporterSince ? String(info.supporterSince) : "",
                info?.favPlayer,
                info?.matchdayMemory,
              ];
              const filled = fields.filter((v) => !!(v && String(v).trim())).length;
              const total = fields.length;
              const missing = total - filled;
              if (!info || missing === 0) return null;
              return (
                <Button asChild size="sm" variant="outline" className="bg-amber-500/20 backdrop-blur border-amber-300/50 text-white hover:bg-amber-500/30 hover:text-white justify-center col-span-2 sm:col-span-1">
                  <Link to="/fanzone/profile">
                    <UserCog className="size-4 mr-1.5" />
                    Complete profile
                    <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-[#E11B22] text-white text-[10px] font-bold px-1.5 min-w-[1.25rem] h-5">
                      {filled}/{total}
                    </span>
                  </Link>
                </Button>
              );
            })()}
            <Button asChild size="sm" variant="outline" className="bg-black/40 backdrop-blur border-white/30 text-white hover:bg-black/60 hover:text-white justify-center">
              <Link to="/fanzone/profile"><UserCog className="size-4 mr-1.5" />Profile &amp; Settings</Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="bg-black/40 backdrop-blur border-white/30 text-white hover:bg-black/60 hover:text-white justify-center">
              <Link to="/fanzone/blocks"><Ban className="size-4 mr-1.5" />Ignore</Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="bg-black/40 backdrop-blur border-white/30 text-white hover:bg-black/60 hover:text-white justify-center">
              <Link to="/forum/search" search={{ q: "" }}><SearchIcon className="size-4 mr-1.5" />Search</Link>
            </Button>
            <div className="col-span-2 sm:col-span-1 flex justify-center sm:justify-end">
              <FanZoneMentionsBell />
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-4 sm:gap-5">
            <Link
              to="/forum"
              className="hidden sm:flex size-20 rounded-full bg-white items-center justify-center shadow-lg ring-2 ring-white/50 shrink-0 hover:ring-white hover:scale-105 transition-all"
              aria-label="Back to Boro Fan Zone home"
            >
              <img
                src={boroBadge}
                alt="Boro Fan Zone badge"
                width={1024}
                height={1024}
                className="size-[72px] object-contain"
                loading="lazy"
              />
            </Link>
            <div className="min-w-0 flex-1">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.3em] text-white/80">
                Members only · Est. terrace
              </div>
              <h1 className="font-display text-3xl sm:text-4xl font-black leading-none text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)]">
                BORO FAN ZONE
              </h1>
              <p className="mt-2 text-sm text-white/85 italic">
                Up the Boro — boards, banter & match-day debate.
              </p>
            </div>
          </div>
        </div>
      </header>
      <div className="mb-4">
        <BoroLiveMatchStrip />
      </div>
      {isNested ? <Outlet /> : <BoardsIndex />}
      <FanZoneNameGate />
    </div>
  );
}

function BoardsIndex() {
  const { user, hasAny } = useAuth();
  const isStaff = hasAny(["admin", "boro_fan_zone_moderator"]);
  const info = useFanZoneMembership(user?.id ?? null);
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [posters, setPosters] = useState<Record<string, { display_name: string | null; username: string | null }>>({});
  const [lastTopics, setLastTopics] = useState<Record<string, { id: string; title: string }>>({});
  useProfanityWords();
  const aliasVersion = useFanAliasVersion();

  const canEnter = isStaff || info?.status === "approved";
  const isPending = info?.status === "pending";

  const loadBoards = useCallback(async () => {
    if (!canEnter) return;
      const { data } = await supabase
        .from("forum_boards")
        .select("id, name, slug, description, icon, sort_order, is_pinned, is_locked, topic_count, post_count, last_post_at, last_post_by")
        .order("is_pinned", { ascending: false })
        .order("sort_order");
      const list = (data ?? []) as Board[];
      setBoards(list);
      const boardIds = list.filter((b) => b.last_post_at).map((b) => b.id);
      if (boardIds.length) {
        const { data: topics } = await supabase
          .from("forum_topics")
          .select("id, title, board_id, last_post_at")
          .in("board_id", boardIds)
          .order("last_post_at", { ascending: false });
        const byBoard: Record<string, { id: string; title: string }> = {};
        (topics ?? []).forEach((t: any) => {
          if (!byBoard[t.board_id]) byBoard[t.board_id] = { id: t.id, title: t.title };
        });
        setLastTopics(byBoard);
      } else {
        setLastTopics({});
      }
      const ids = Array.from(new Set(list.map((b) => b.last_post_by).filter((x): x is string => !!x)));
      if (ids.length) {
        const { data: ps } = await supabase.from("profiles").select("id, display_name, username").in("id", ids);
        const map: Record<string, { display_name: string | null; username: string | null }> = {};
        (ps ?? []).forEach((p) => { map[p.id as string] = { display_name: p.display_name as string | null, username: p.username as string | null }; });
        const { data: aliases } = await supabase.rpc("fan_zone_aliases", { _ids: ids });
        (aliases ?? []).forEach((a: { user_id: string; fan_alias: string | null }) => {
          if (a.fan_alias && map[a.user_id]) map[a.user_id].display_name = a.fan_alias;
        });
        setPosters(map);
      } else {
        setPosters({});
      }
  }, [canEnter]);

  useEffect(() => {
    void loadBoards();
  }, [loadBoards, aliasVersion]);

  // Keep the "Latest" post/author in sync in real time, including after deletions.
  useEffect(() => {
    if (!canEnter) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void loadBoards(), 400);
    };
    const channel = supabase
      .channel("forum-boards-latest")
      .on("postgres_changes", { event: "*", schema: "public", table: "forum_boards" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "forum_topics" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "forum_posts" }, refresh)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [canEnter, loadBoards]);

  if (!canEnter && isPending) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-surface-1/90 backdrop-blur-sm p-10 text-center shadow-soft">
        <div className="mx-auto mb-5 size-16 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
          <Loader2 className="size-7 text-amber-400 animate-spin" />
        </div>
        <h2 className="font-display text-xl font-bold mb-2">Membership Pending Approval</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto mb-1">
          Your request to join the Boro Fan Zone is being reviewed by the moderation team.
        </p>
        <p className="text-sm text-muted-foreground max-w-md mx-auto mb-5">
          You will be notified as soon as your access is approved.
        </p>
        {info?.reason ? (
          <div className="rounded-lg border border-border bg-surface-2 p-3 max-w-md mx-auto mb-5 text-left">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Your request</div>
            <p className="text-sm text-foreground italic">"{info.reason}"</p>
          </div>
        ) : null}
        <Button asChild variant="ghost" size="sm">
          <Link to="/home">Back to channels</Link>
        </Button>
      </div>
    );
  }

  if (!canEnter) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-8 text-center">
        <Lock className="size-8 mx-auto mb-3 text-amber-400" />
        <h2 className="font-display text-lg font-bold mb-1">Members only</h2>
        <p className="text-sm text-muted-foreground mb-4">
          The Boro Fan Zone forum is open to approved supporters only. Request access from the sidebar.
        </p>
      </div>
    );
  }

  if (!boards) {
    return <div className="grid place-items-center py-20 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>;
  }

  return (
    <div className="boro-forum-index grid gap-4 xl:grid-cols-[1fr_280px]">
      <div className="space-y-3 min-w-0">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {boards.map((b) => {
        const Icon = getIcon(b.icon);
        const poster = b.last_post_by ? posters[b.last_post_by] : null;
        const posterName = poster?.display_name || poster?.username || (b.last_post_by ? "someone" : null);
        const lastTopic = lastTopics[b.id];
        return (
          <article
              key={b.id}
              className="boro-board-card group flex flex-col rounded-xl hover:border-[#E11B22]/80 hover:shadow-[0_16px_38px_-14px_rgba(225,27,34,0.7)] hover:-translate-y-[2px] transition-all overflow-hidden relative h-full"
            >
              <span
                className="absolute left-0 top-0 right-0 h-1 bg-gradient-to-r from-[#E11B22] to-[#8B0F14]"
                aria-hidden
              />
              <div className="flex flex-col gap-3 p-4 pt-5 flex-1">
                <div className="flex items-start gap-3">
                  <div className="size-11 rounded-lg bg-gradient-to-br from-[#E11B22] to-[#8B0F14] grid place-items-center text-white shadow-md ring-1 ring-white/10 shrink-0">
                    <Icon className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {b.is_pinned && <Pin className="size-3.5 text-[#F4B400] shrink-0" />}
                      {b.is_locked && <Lock className="size-3.5 text-muted-foreground shrink-0" />}
                       <h3 className="font-display font-bold truncate group-hover:text-[#E11B22] transition-colors">
                         <Link to="/forum/$board" params={{ board: b.slug }} className="hover:underline">{b.name}</Link>
                       </h3>
                      <ChevronRight className="size-4 ml-auto text-muted-foreground/40 group-hover:text-[#E11B22] group-hover:translate-x-0.5 transition-all shrink-0" />
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{b.description}</p>
                  </div>
                </div>
                <div className="mt-auto pt-3 border-t border-border/60 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <MessageSquare className="size-3.5 text-[#E11B22]" />
                    <span className="font-extrabold text-sm text-[#E11B22]">{b.topic_count}</span>
                    <span className="font-bold text-foreground">topics</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="font-extrabold text-sm text-[#E11B22]">{Math.max(0, b.post_count - b.topic_count)}</span>
                    <span className="font-bold text-foreground">replies</span>
                  </span>
                  {!b.last_post_at && (
                    <span className="italic">No posts yet</span>
                  )}
                </div>
                {lastTopic && (
                  <div className="-mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <Link
                      to="/forum/$board/$topic"
                      params={{ board: b.slug, topic: lastTopic.id }}
                      className="truncate min-w-0 hover:text-[#E11B22] hover:underline"
                    >
                      Latest: <span className="font-semibold text-foreground">{censorText(lastTopic.title)}</span>
                    </Link>
                    {b.last_post_at && (
                      <span className="shrink-0 text-right">
                        {formatLastSeen(b.last_post_at)}
                        {posterName && b.last_post_by ? <> · <Link
                          to="/fanzone/u/$userId"
                          params={{ userId: b.last_post_by }}
                          className="text-foreground hover:text-[#E11B22] hover:underline"
                        >{posterName}</Link></> : null}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </article>
        );
        })}
          <div className="grid gap-4 md:grid-cols-2 items-stretch sm:col-span-2">
            <ForumStats boards={boards} />
            <FanZoneStaffBox />
          </div>
        </div>
        <div className="pt-2 text-center">
          <Button asChild variant="ghost" size="sm">
            <Link to="/home">← Back to channels</Link>
          </Button>
        </div>
      </div>
      <div className="lg:sticky lg:top-4 lg:self-start">
        <div className="space-y-4">
          <BoroMatchCentreBox />
        </div>
      </div>
    </div>
  );
}

function ForumStats({ boards }: { boards: Board[] }) {
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [latest, setLatest] = useState<{ name: string; userId: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const stats = await getPublicForumStats();
      if (!cancelled) {
        setMemberCount(stats.members);
        setLatest(
          stats.latest_member && stats.latest_member_id
            ? { name: stats.latest_member, userId: stats.latest_member_id }
            : null,
        );
      }
    };

    void load();

    const channel = supabase
      .channel(`forum-stats-members-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "fan_zone_members" }, () => {
        void load();
      })
      .subscribe();

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    const interval = window.setInterval(refreshWhenVisible, 15_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      void supabase.removeChannel(channel);
    };
  }, []);

  const threads = boards.reduce((s, b) => s + (b.topic_count || 0), 0);
  const messages = boards.reduce((s, b) => s + Math.max(0, (b.post_count || 0) - (b.topic_count || 0)), 0);
  const fmt = (n: number) => n.toLocaleString("en-GB");

  return (
    <div className="boro-solid-panel rounded-xl overflow-hidden h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#E11B22] to-[#8B0F14] text-white">
        <BarChart3 className="size-4" />
        <h3 className="font-display font-bold text-sm tracking-wide">Forum statistics</h3>
      </div>
      <dl className="divide-y divide-border/60">
        <Row label="Threads" value={fmt(threads)} />
        <Row label="Replies" value={fmt(messages)} />
        <Row label="Members" value={memberCount === null ? "…" : fmt(memberCount)} />
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
          <dt className="text-muted-foreground">Latest member:</dt>
          <dd className="font-semibold text-[#E11B22] truncate">
            {latest ? (
              <Link to="/fanzone/u/$userId" params={{ userId: latest.userId }} className="hover:underline">
                {latest.name}
              </Link>
            ) : (
              "—"
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
      <dt className="text-muted-foreground">{label}:</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}