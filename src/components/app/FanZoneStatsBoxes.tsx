import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, ThumbsUp, ThumbsDown, MessageSquare, FileText, Users, Award } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import boroDefaultAvatar from "@/assets/boro-default-avatar.png";

type Stats = { topics: number; posts: number; friends: number; reactionsReceived: number };

export function FanStatsBox({ userId }: { userId: string }) {
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [topicsRes, postsRes, friendsRes, postIdsRes] = await Promise.all([
        supabase.from("forum_topics").select("id", { count: "exact", head: true }).eq("author_id", userId),
        supabase.from("forum_posts").select("id", { count: "exact", head: true }).eq("author_id", userId),
        supabase.from("fan_zone_friendships").select("id", { count: "exact", head: true }).eq("status", "accepted").eq("addressee_id", userId),
        supabase.from("forum_posts").select("id").eq("author_id", userId),
      ]);
      const postIds = (postIdsRes.data ?? []).map((p: any) => p.id);
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
      setS({
        topics: topicsRes.count ?? 0,
        posts: postsRes.count ?? 0,
        friends: friendsRes.count ?? 0,
        reactionsReceived: total,
      });
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const Item = ({ icon: Icon, label, value }: { icon: any; label: string; value: number | string }) => (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
      <Icon className="size-4 text-[#E11B22]" />
      <div className="text-xs text-white/70 flex-1">{label}</div>
      <div className="font-display text-lg font-black tabular-nums">{value}</div>
    </div>
  );

  return (
    <div className="rounded-2xl border border-[#E11B22]/40 bg-black/55 backdrop-blur-md shadow-2xl text-white p-5">
      <h2 className="font-display text-lg font-bold mb-3 flex items-center gap-2"><Award className="size-4 text-[#E11B22]" />Fan stats</h2>
      {!s ? (
        <div className="grid place-items-center py-8"><Loader2 className="size-4 animate-spin text-white/70" /></div>
      ) : (
        <div className="space-y-2">
          <Item icon={FileText} label="Topics started" value={s.topics} />
          <Item icon={MessageSquare} label="Forum posts" value={s.posts} />
          <Item icon={Users} label="Friends" value={s.friends} />
          <Item icon={ThumbsUp} label="Reactions received" value={s.reactionsReceived} />
        </div>
      )}
    </div>
  );
}

export function FanReputationBox({ userId }: { userId: string }) {
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
        const { data: m } = await supabase.from("fan_zone_members").select("user_id, fan_alias, fan_avatar_url").in("user_id", fanIds);
        members = m ?? [];
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
                  <img src={f.avatar || boroDefaultAvatar} alt="" className="size-7 rounded-full object-cover ring-1 ring-white/10" />
                  <Link to="/fanzone/u/$userId" params={{ userId: f.user_id }} className="flex-1 min-w-0 text-xs font-semibold truncate hover:underline">
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