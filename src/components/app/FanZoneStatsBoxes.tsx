import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, ThumbsUp, ThumbsDown, MessageSquare, FileText, Users, Award, UserMinus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BORO_DEFAULT_AVATAR_URL as boroDefaultAvatar } from "@/lib/boro-default-avatar";
import { useFanProfileTo } from "@/components/app/fan-profile-link";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type FriendCard = {
  user_id: string;
  fan_alias: string | null;
  fan_avatar_url: string | null;
  friendship_id: string;
  mutual: boolean;
};

type Stats = {
  topics: number;
  posts: number;
  friends: number;
  mutualFriends: number;
  reactionsReceived: number;
  friendsHidden: boolean;
  isSelf: boolean;
  ownerAlias: string | null;
};

export function FanStatsBox({ userId }: { userId: string }) {
  const [s, setS] = useState<Stats | null>(null);
  const [friendCards, setFriendCards] = useState<FriendCard[]>([]);
  const [openList, setOpenList] = useState<"all" | "mutual" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async (cancelled = false) => {
    const { data: me } = await supabase.auth.getUser();
    const isSelf = me?.user?.id === userId;
    const [topicsRes, postsRes, friendsRes, postIdsRes, hideRes, aliasRes] = await Promise.all([
      supabase.from("forum_topics").select("id", { count: "exact", head: true }).eq("author_id", userId),
      supabase.from("forum_posts").select("id", { count: "exact", head: true }).eq("author_id", userId),
      supabase.rpc("fan_zone_friend_list", { _target_user_id: userId }),
      supabase.from("forum_posts").select("id").eq("author_id", userId),
      supabase.rpc("fan_zone_hide_friends", { _ids: [userId] }),
      supabase.rpc("fan_zone_aliases", { _ids: [userId] }),
    ]);
    const ownerAlias = ((aliasRes.data as any[]) ?? [])[0]?.fan_alias ?? null;
    const hiddenRow = ((hideRes.data as any[]) ?? [])[0];
    const friendsHidden = !isSelf && !!hiddenRow?.hide_friends;
    const accepted = (friendsRes.data ?? []) as Array<{
      friendship_id: string;
      user_id: string;
      fan_alias: string | null;
      fan_avatar_url: string | null;
      mutual: boolean;
    }>;
    const unique = new Map<string, { friendship_id: string; mutual: boolean }>();
    for (const row of accepted) {
      if (!unique.has(row.user_id)) unique.set(row.user_id, { friendship_id: row.friendship_id, mutual: row.mutual });
    }

    const cards: FriendCard[] = friendsHidden
      ? []
      : accepted.map((row) => ({
          user_id: row.user_id,
          fan_alias: row.fan_alias,
          fan_avatar_url: row.fan_avatar_url,
          friendship_id: row.friendship_id,
          mutual: row.mutual,
        }));

    const postIds = (postIdsRes.data ?? []).map((post: any) => post.id);
    let total = 0;
    if (postIds.length) {
      const { count } = await supabase
        .from("forum_post_reactions")
        .select("post_id", { count: "exact", head: true })
        .in("post_id", postIds)
        .neq("user_id", userId);
      total = count ?? 0;
    }
    if (cancelled) return;
    setFriendCards(cards);
    setS({
      topics: topicsRes.count ?? 0,
      posts: postsRes.count ?? 0,
      friends: unique.size,
      mutualFriends: [...unique.values()].filter((friend) => friend.mutual).length,
      reactionsReceived: total,
      friendsHidden,
      isSelf,
    });
  };

  useEffect(() => {
    let cancelled = false;
    void load(cancelled);
    const channel = supabase
      .channel(`fan-stats-friends:${userId}:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "fan_zone_friendships" }, () => void load())
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const removeFriend = async (friendshipId: string) => {
    if (!friendshipId) return;
    setBusy(friendshipId);
    const { error } = await supabase.from("fan_zone_friendships").delete().eq("id", friendshipId);
    setBusy(null);
    if (error) return toast.error("Couldn't remove friend", { description: error.message });
    toast.success("Friend removed");
    await load();
  };

  const Item = ({ icon: Icon, label, value }: { icon: any; label: string; value: number | string }) => (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
      <Icon className="size-4 text-[#E11B22]" />
      <div className="text-xs text-white/70 flex-1">{label}</div>
      <div className="font-display text-lg font-black tabular-nums">{value}</div>
    </div>
  );

  const FriendItem = ({ label, value, list }: { label: string; value: number; list: "all" | "mutual" }) => (
    <Button
      type="button"
      variant="ghost"
      onClick={() => setOpenList(list)}
      className="h-auto w-full justify-start gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-white hover:bg-white/10 hover:text-white"
    >
      <Users className="size-4 shrink-0 text-[#E11B22]" />
      <span className="flex-1 text-left text-xs font-normal text-white/70">{label}</span>
      <span className="font-display text-lg font-black tabular-nums">{value}</span>
    </Button>
  );

  const visibleCards = openList === "mutual" ? friendCards.filter((friend) => friend.mutual) : friendCards;

  return (
    <div className="rounded-2xl border border-[#E11B22]/40 bg-black/55 backdrop-blur-md shadow-2xl text-white p-5">
      <h2 className="font-display text-lg font-bold mb-3 flex items-center gap-2"><Award className="size-4 text-[#E11B22]" />Fan stats</h2>
      {!s ? (
        <div className="grid place-items-center py-8"><Loader2 className="size-4 animate-spin text-white/70" /></div>
      ) : (
        <div className="space-y-2">
          <Item icon={FileText} label="Topics started" value={s.topics} />
          <Item icon={MessageSquare} label="Forum posts" value={s.posts} />
          {!s.friendsHidden ? (
            <>
              <FriendItem label="Friends" value={s.friends} list="all" />
              <FriendItem label="Mutual friends" value={s.mutualFriends} list="mutual" />
            </>
          ) : (
            <Item icon={Users} label="Friends" value="Private" />
          )}
          <Item icon={ThumbsUp} label="Reactions received" value={s.reactionsReceived} />
        </div>
      )}

      <Dialog open={openList !== null} onOpenChange={(open) => !open && setOpenList(null)}>
        <DialogContent className="boro-theme h-[92vh] w-[96vw] max-w-none gap-0 overflow-hidden border-[#E11B22]/50 bg-[#07070b]/98 p-0 text-white">
          <DialogHeader className="border-b border-white/10 bg-gradient-to-r from-[#E11B22]/30 to-transparent px-5 py-4 text-left sm:px-7">
            <DialogTitle className="font-display text-2xl font-black">
              {openList === "mutual" ? "Mutual friends" : "Friends"} ({visibleCards.length})
            </DialogTitle>
            <DialogDescription className="text-sm text-white/70">
              {openList === "mutual" ? "Fans who have both added each other." : "Everyone connected to this profile."}
            </DialogDescription>
          </DialogHeader>
          <div className="h-[calc(92vh-6.5rem)] overflow-y-auto px-5 py-5 sm:px-7">
            {visibleCards.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/20 p-10 text-center text-sm text-white/60">
                No {openList === "mutual" ? "mutual friendships" : "friends"} yet.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {visibleCards.map((friend) => (
                  <div key={friend.user_id} className="flex items-start gap-3 rounded-xl border border-white/15 bg-white/[0.06] p-4">
                    <img src={friend.fan_avatar_url || boroDefaultAvatar} alt="" className="size-14 shrink-0 rounded-full object-cover ring-2 ring-white/15" />
                    <div className="min-w-0 flex-1">
                      <Link to="/fanzone/u/$userId" params={{ userId: friend.user_id }} className="block break-words text-sm font-semibold hover:underline">
                        {friend.fan_alias || "Boro fan"}
                      </Link>
                      <div className="mt-1 text-[11px] font-semibold uppercase text-white/65">
                        {friend.mutual ? "Mutual friends" : "One-way friend"}
                      </div>
                      {s?.isSelf ? (
                        <Button size="sm" variant="outline" disabled={busy === friend.friendship_id} onClick={() => void removeFriend(friend.friendship_id)} className="mt-3 bg-white/10 text-white">
                          {busy === friend.friendship_id ? <Loader2 className="mr-1 size-4 animate-spin" /> : <UserMinus className="mr-1 size-4" />}
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function FanReputationBox({ userId }: { userId: string }) {
  const profileTo = useFanProfileTo();
  const [data, setData] = useState<{ score: number; likes: number; dislikes: number; topFans: Array<{ user_id: string; alias: string | null; avatar: string | null; count: number }> } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: posts } = await supabase.from("forum_posts").select("id").eq("author_id", userId);
      const ids = (posts ?? []).map((p: any) => p.id);
      if (ids.length === 0) { if (!cancelled) setData({ score: 0, likes: 0, dislikes: 0, topFans: [] }); return; }
      const { data: rx } = await supabase.from("forum_post_reactions").select("user_id, emoji").in("post_id", ids);
      let likes = 0, dislikes = 0;
      const tally = new Map<string, number>();
      for (const r of (rx ?? []) as any[]) {
        if (r.user_id === userId) continue;
        if (r.emoji === "👎") { dislikes++; tally.set(r.user_id, (tally.get(r.user_id) ?? 0) - 1); }
        else { likes++; tally.set(r.user_id, (tally.get(r.user_id) ?? 0) + 1); }
      }
      const top = [...tally.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 5);
      const fanIds = top.map(([id]) => id);
      let members: any[] = [];
      if (fanIds.length) {
        const { data: m } = await supabase.rpc("fan_zone_aliases", { _ids: fanIds });
        members = (m as any[]) ?? [];
      }
      const byId = new Map(members.map((m: any) => [m.user_id, m]));
      const topFans = top.map(([id, count]) => {
        const m = byId.get(id);
        return { user_id: id, alias: m?.fan_alias ?? null, avatar: m?.fan_avatar_url ?? null, count };
      });
      if (cancelled) return;
      setData({ score: likes - dislikes, likes, dislikes, topFans });
    })();
    return () => { cancelled = true; };
  }, [userId]);

  return (
    <div className="rounded-2xl border border-[#E11B22]/40 bg-black/55 backdrop-blur-md shadow-2xl text-white p-5">
      <h2 className="font-display text-lg font-bold mb-1 flex items-center gap-2"><Award className="size-4 text-[#E11B22]" />Reputation</h2>
      <p className="text-[11px] text-white/60 mb-3">Based on reactions to forum posts.</p>
      {!data ? (
        <div className="grid place-items-center py-8"><Loader2 className="size-4 animate-spin text-white/70" /></div>
      ) : (
        <>
          <div className="rounded-xl border border-white/10 bg-gradient-to-r from-[#E11B22]/20 to-transparent p-4 mb-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-white/60">Score</div>
            <div className={`font-display text-4xl font-black tabular-nums ${data.score >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
              {data.score > 0 ? `+${data.score}` : data.score}
            </div>
            <div className="flex items-center justify-center gap-4 mt-2 text-xs">
              <span className="flex items-center gap-1 text-emerald-300"><ThumbsUp className="size-3" />{data.likes}</span>
              <span className="flex items-center gap-1 text-rose-300"><ThumbsDown className="size-3" />{data.dislikes}</span>
            </div>
          </div>
          <div className="text-[11px] uppercase tracking-wider text-white/60 mb-2">Top reactors</div>
          {data.topFans.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/15 p-4 text-center text-xs text-white/50">No reactions yet.</div>
          ) : (
            <ul className="space-y-1.5">
              {data.topFans.map((f) => (
                <li key={f.user_id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5">
                  <Link to={profileTo} params={{ userId: f.user_id }} className="shrink-0">
                    <img src={f.avatar || boroDefaultAvatar} alt="" className="size-7 rounded-full object-cover ring-1 ring-white/10" />
                  </Link>
                  <Link to={profileTo} params={{ userId: f.user_id }} className="flex-1 min-w-0 text-xs font-semibold truncate hover:underline">
                    {f.alias || "Boro fan"}
                  </Link>
                  <span className={`text-xs font-bold tabular-nums ${f.count >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                    {f.count > 0 ? `+${f.count}` : f.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}