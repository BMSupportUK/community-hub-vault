import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  listPublicBoards,
  getPublicForumStats,
  getPublicFanZoneStaff,
  type PublicBoard,
  type PublicForumStats,
  type PublicStaffMember,
} from "@/lib/fan-zone-public.functions";
import { getIcon } from "@/components/app/IconPicker";
import { Lock, Pin, MessageSquare, ChevronRight, BarChart3, Shield, Star } from "lucide-react";
import { RelativeTime } from "@/components/app/RelativeTime";
import { BoroMatchCentreBox } from "@/components/app/BoroMatchCentreBox";
import { FanZoneShell } from "./fan-zone";

export const Route = createFileRoute("/fan-zone/")({
  loader: () => listPublicBoards(),
  staleTime: 60_000,
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
  const boards = Route.useLoaderData() as PublicBoard[];
  return (
    <FanZoneShell>
      <div className="boro-forum-index grid gap-4 md:grid-cols-[minmax(0,1fr)_280px] items-start">
        <div className="space-y-3 min-w-0">
          {boards.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-sm text-white/70">
              No boards yet.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
              {boards.map((b) => {
                const Icon = getIcon(b.icon);
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
                             <h2 className="font-display font-bold truncate group-hover:text-[#E11B22] transition-colors">
                               <Link to="/fan-zone/$board" params={{ board: b.slug }} className="hover:underline">{b.name}</Link>
                             </h2>
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
                          <span className="font-extrabold text-sm text-[#E11B22]">
                            {Math.max(0, b.post_count - b.topic_count)}
                          </span>
                          <span className="font-bold text-foreground">replies</span>
                        </span>
                        {!b.last_post_at && <span className="italic">No posts yet</span>}
                      </div>
                      {b.last_topic_title && (
                        <div className="-mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                          <span className="truncate min-w-0">
                            Latest: <span className="font-semibold text-foreground">{b.last_topic_title}</span>
                          </span>
                          {b.last_post_at && (
                            <span className="shrink-0 text-right">
                              <RelativeTime iso={b.last_post_at} />
                              {b.last_poster_alias && b.last_poster_id ? (
                                <> · <Link
                                  to="/fan-zone/u/$userId"
                                  params={{ userId: b.last_poster_id }}
                                  className="text-foreground hover:text-[#E11B22] hover:underline"
                                >{b.last_poster_alias}</Link></>
                              ) : null}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
              <div className="grid gap-4 md:grid-cols-2 items-stretch sm:col-span-2">
                <GuestForumStats />
                <GuestStaffBox />
              </div>
            </div>
          )}
        </div>
        <div className="md:sticky md:top-4 md:self-start">
          <BoroMatchCentreBox />
        </div>
      </div>
    </FanZoneShell>
  );
}

function GuestForumStats() {
  const [stats, setStats] = useState<PublicForumStats | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void getPublicForumStats()
        .then((next) => {
          if (!cancelled) setStats(next);
        })
        .catch(() => {
          if (!cancelled) setStats(null);
        });
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    load();
    const interval = window.setInterval(refreshWhenVisible, 15_000);
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);
  const fmt = (n: number) => n.toLocaleString("en-GB");
  return (
    <div className="boro-solid-panel rounded-xl overflow-hidden h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#E11B22] to-[#8B0F14] text-white">
        <BarChart3 className="size-4" />
        <h3 className="font-display font-bold text-sm tracking-wide">Forum statistics</h3>
      </div>
      <dl className="divide-y divide-border/60">
        <StatRow label="Threads" value={stats ? fmt(stats.threads) : "…"} />
        <StatRow label="Replies" value={stats ? fmt(stats.replies) : "…"} />
        <StatRow label="Members" value={stats ? fmt(stats.members) : "…"} />
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
          <dt className="text-muted-foreground">Latest member:</dt>
          <dd className="font-semibold text-[#E11B22] truncate">
            {stats?.latest_member && stats.latest_member_id ? (
              <Link to="/fan-zone/u/$userId" params={{ userId: stats.latest_member_id }} className="hover:underline">
                {stats.latest_member}
              </Link>
            ) : "—"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
      <dt className="text-muted-foreground">{label}:</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function GuestStaffBox() {
  const [members, setMembers] = useState<PublicStaffMember[] | null>(null);
  useEffect(() => {
    void getPublicFanZoneStaff().then(setMembers).catch(() => setMembers([]));
  }, []);
  if (!members || members.length === 0) return null;
  return (
    <aside className="boro-solid-panel rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-gradient-to-r from-[#E11B22] to-[#8B0F14] text-white">
        <h3 className="font-display text-sm font-bold uppercase tracking-wider flex items-center gap-2">
          <Shield className="size-4" /> Fan Zone Staff
        </h3>
      </div>
      <ul className="p-2 space-y-1.5">
        {members.map((m) => (
          <li key={`${m.user_id}-${m.role}`}>
            <Link
              to="/fan-zone/u/$userId"
              params={{ userId: m.user_id }}
              className="flex items-center gap-2.5 rounded-lg border border-white/[0.12] bg-white/[0.08] px-2.5 py-2 hover:border-[#E11B22]/60 hover:bg-white/[0.12] transition-colors"
            >
              <div className="relative shrink-0">
                {m.fan_avatar_url ? (
                  <img
                    src={m.fan_avatar_url}
                    alt=""
                    className="size-8 rounded-full object-cover ring-1 ring-white/20"
                    loading="lazy"
                  />
                ) : (
                  <div className="size-8 rounded-full bg-gradient-to-br from-[#E11B22] to-[#8B0F14] grid place-items-center text-[11px] font-bold text-white">
                    {m.fan_alias.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{m.fan_alias}</div>
                <div className="text-[10px] uppercase tracking-wider font-bold text-[#F4B400] flex items-center gap-1">
                  {m.role === "admin" ? <Star className="size-3" /> : <Shield className="size-3" />}
                  {m.role === "admin" ? "Owner" : "Moderator"}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
