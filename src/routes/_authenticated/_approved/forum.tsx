import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MessageSquare, Pin, Lock, Loader2, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useFanZoneMembership } from "@/hooks/use-fan-zone";
import { getIcon } from "@/components/app/IconPicker";
import { formatLastSeen } from "@/lib/relative-time";
import { Button } from "@/components/ui/button";
import { MessageSquareText, Ban } from "lucide-react";
import { FanZoneAliasSettings } from "@/components/app/FanZoneAliasSettings";
import { FanZoneStaffBox } from "@/components/app/FanZoneStaffBox";
import { BoroMatchCentreBox } from "@/components/app/BoroMatchCentreBox";
import boroHero from "@/assets/boro-hero.jpg";
import boroBadge from "@/assets/boro-fan-zone-badge.png";
import boroBg from "@/assets/boro-bg.jpg";

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
    <div className="boro-theme relative w-full px-4 sm:px-6 lg:px-10 py-6">
      <header className="relative mb-6 overflow-hidden rounded-2xl border border-[#E11B22]/40 shadow-[0_10px_40px_-10px_rgba(225,27,34,0.55)]">
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
        <div className="relative px-5 py-7 sm:px-8 sm:py-9 flex items-center gap-5">
          <div className="hidden sm:flex size-20 rounded-full bg-white items-center justify-center shadow-lg ring-2 ring-white/50 shrink-0">
            <img
              src={boroBadge}
              alt="Boro Fan Zone badge"
              width={1024}
              height={1024}
              className="size-[72px] object-contain"
              loading="lazy"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] tracking-[0.3em] font-bold text-white/80 uppercase mb-1">
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
      </header>
      {isNested ? <Outlet /> : <BoardsIndex />}
    </div>
  );
}

function BoardsIndex() {
  const { user, hasAny } = useAuth();
  const isStaff = hasAny(["admin", "boro_fan_zone_moderator"]);
  const info = useFanZoneMembership(user?.id ?? null);
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [posters, setPosters] = useState<Record<string, { display_name: string | null; username: string | null }>>({});

  const canEnter = isStaff || info?.status === "approved";
  const isPending = info?.status === "pending";

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
        const { data: aliases } = await supabase.rpc("fan_zone_aliases", { _ids: ids });
        (aliases ?? []).forEach((a: { user_id: string; fan_alias: string | null }) => {
          if (a.fan_alias && map[a.user_id]) map[a.user_id].display_name = a.fan_alias;
        });
        setPosters(map);
      }
    })();
  }, [canEnter]);

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
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="space-y-3 min-w-0">
        <FanZoneAliasSettings />
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" className="bg-gradient-to-r from-[#E11B22] to-[#8B0F14] hover:from-[#F02B30] hover:to-[#9B1118] border-0 text-white">
            <Link to="/fanzone/messages"><MessageSquareText className="size-4 mr-2" />Fan zone inbox</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/fanzone/blocks"><Ban className="size-4 mr-2" />Ignore list</Link>
          </Button>
        </div>
        {boards.map((b) => {
        const Icon = getIcon(b.icon);
        const poster = b.last_post_by ? posters[b.last_post_by] : null;
        const posterName = poster?.display_name || poster?.username || (b.last_post_by ? "someone" : null);
        return (
          <Link
              key={b.id}
              to="/forum/$board"
              params={{ board: b.slug }}
              className="group block rounded-xl border border-border bg-surface-1/85 backdrop-blur-sm hover:border-[#E11B22]/70 hover:shadow-[0_8px_30px_-12px_rgba(225,27,34,0.55)] hover:-translate-y-[1px] transition-all overflow-hidden relative"
            >
              <span
                className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#E11B22] to-[#8B0F14]"
                aria-hidden
              />
              <div className="grid grid-cols-[auto_1fr_auto] gap-4 p-4 pl-5 items-center">
              <div className="size-11 rounded-lg bg-gradient-to-br from-[#E11B22] to-[#8B0F14] grid place-items-center text-white shadow-md ring-1 ring-white/10">
                <Icon className="size-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {b.is_pinned && <Pin className="size-3.5 text-[#F4B400]" />}
                  {b.is_locked && <Lock className="size-3.5 text-muted-foreground" />}
                  <h3 className="font-display font-bold truncate group-hover:text-[#E11B22] transition-colors">{b.name}</h3>
                  <ChevronRight className="size-4 ml-auto text-muted-foreground/40 group-hover:text-[#E11B22] group-hover:translate-x-0.5 transition-all shrink-0" />
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{b.description}</p>
                <div className="sm:hidden mt-2 text-[11px] text-muted-foreground flex items-center gap-3">
                  <span><MessageSquare className="size-3 inline mr-1" />{b.topic_count} topics · {b.post_count} posts</span>
                </div>
              </div>
              <div className="hidden sm:block text-right text-[11px] text-muted-foreground min-w-[140px]">
                <div><span className="font-semibold text-[#E11B22]">{b.topic_count}</span> topics · <span className="font-semibold text-[#E11B22]">{b.post_count}</span> posts</div>
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
      <div className="lg:sticky lg:top-4 lg:self-start">
        <div className="space-y-4">
          <BoroMatchCentreBox />
          <FanZoneStaffBox />
        </div>
      </div>
    </div>
  );
}