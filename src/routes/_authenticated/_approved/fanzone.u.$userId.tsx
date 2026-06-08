import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, MessageSquare, Ban, ShieldOff, Heart, Clock, Quote } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useFanZoneMembership } from "@/hooks/use-fan-zone";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import bgAsset from "@/assets/boro-fan-zone-profile-bg.jpg.asset.json";

export const Route = createFileRoute("/_authenticated/_approved/fanzone/u/$userId")({
  component: FanProfilePage,
});

type Profile = {
  user_id: string;
  fan_alias: string;
  fan_avatar_url: string;
  bio: string | null;
  supporter_since: number | null;
  fav_player: string | null;
  matchday_memory: string | null;
  joined_at: string;
  is_blocked_by_me: boolean;
  has_blocked_me: boolean;
};

function FanProfilePage() {
  const { userId } = Route.useParams();
  const navigate = useNavigate();
  const { user, hasAny } = useAuth();
  const isStaff = hasAny(["admin", "boro_fan_zone_moderator"]);
  const info = useFanZoneMembership(user?.id ?? null);
  const canEnter = isStaff || info?.status === "approved";
  const [p, setP] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_fan_zone_profile", { _user_id: userId });
    setLoading(false);
    if (error) { toast.error("Couldn't load profile", { description: error.message }); return; }
    const row = (data ?? [])[0] as Profile | undefined;
    setP(row ?? null);
  };

  useEffect(() => { if (canEnter) void load(); }, [userId, canEnter]);

  if (!canEnter) {
    return <div className="p-6 text-sm text-center">Members only.</div>;
  }

  const startDm = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("get_or_create_fan_dm_thread", { _other: userId });
    setBusy(false);
    if (error) return toast.error("Can't message", { description: error.message });
    navigate({ to: "/fanzone/messages/$thread", params: { thread: data as string } });
  };

  const toggleBlock = async () => {
    if (!p) return;
    setBusy(true);
    const fn = p.is_blocked_by_me ? "fan_zone_unblock" : "fan_zone_block";
    const { error } = await supabase.rpc(fn, { _other: userId });
    setBusy(false);
    if (error) return toast.error("Action failed", { description: error.message });
    toast.success(p.is_blocked_by_me ? "Unblocked" : "Blocked");
    void load();
  };

  const isSelf = user?.id === userId;

  return (
    <div className="boro-theme relative min-h-[calc(100vh-4rem)] w-full">
      <div
        className="fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${bgAsset.url})` }}
        aria-hidden
      />
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-black/70 via-black/60 to-black/80" aria-hidden />

      <div className="relative w-full max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-4">
      <Button asChild variant="ghost" size="sm" className="text-white hover:text-white hover:bg-white/10 -ml-2">
        <Link to="/forum"><ArrowLeft className="size-4 mr-1" />Back to forum</Link>
      </Button>

      {loading ? (
        <div className="grid place-items-center py-20 text-white/80"><Loader2 className="size-5 animate-spin" /></div>
      ) : !p ? (
        <div className="rounded-2xl border border-white/20 bg-black/50 backdrop-blur-md p-10 text-center text-white/80">This member's fan zone profile is not available.</div>
      ) : (
        <div className="rounded-2xl border border-[#E11B22]/40 bg-black/55 backdrop-blur-md shadow-2xl text-white overflow-hidden">
          <div className="relative bg-gradient-to-br from-[#E11B22] to-[#8B0F14] px-6 py-8 text-white">
            <div className="flex items-center gap-4">
              <img src={p.fan_avatar_url} alt={p.fan_alias} className="size-20 rounded-full object-cover ring-4 ring-white/20 shadow-lg" />
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.2em] font-bold opacity-80">Boro Fan Zone</div>
                <h1 className="font-display text-2xl sm:text-3xl font-black truncate drop-shadow">{p.fan_alias}</h1>
                <div className="text-xs opacity-80 mt-1">
                  Member since {new Date(p.joined_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                  {p.supporter_since ? <> · Boro fan since <span className="font-semibold">{p.supporter_since}</span></> : null}
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-5 text-white">
            {p.has_blocked_me && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
                This member has blocked you. You can't message them.
              </div>
            )}
            {p.bio && (
              <div>
                <div className="text-[11px] uppercase tracking-wider font-semibold text-white/70 mb-1">Bio</div>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{p.bio}</p>
              </div>
            )}
            {p.fav_player && (
              <div className="flex items-start gap-2">
                <Heart className="size-4 text-[#E11B22] mt-0.5 shrink-0" />
                <div>
                  <div className="text-[11px] uppercase tracking-wider font-semibold text-white/70">Favourite player</div>
                  <p className="text-sm font-medium">{p.fav_player}</p>
                </div>
              </div>
            )}
            {p.matchday_memory && (
              <div className="flex items-start gap-2">
                <Quote className="size-4 text-[#E11B22] mt-0.5 shrink-0" />
                <div>
                  <div className="text-[11px] uppercase tracking-wider font-semibold text-white/70">Matchday memory</div>
                  <p className="text-sm italic">"{p.matchday_memory}"</p>
                </div>
              </div>
            )}
            {!p.bio && !p.fav_player && !p.matchday_memory && (
              <p className="text-sm text-white/60 italic">No profile info yet.</p>
            )}

            {!isSelf && (
              <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
                <Button
                  onClick={() => void startDm()}
                  disabled={busy || p.is_blocked_by_me || p.has_blocked_me}
                  className="bg-gradient-to-r from-[#E11B22] to-[#8B0F14] hover:from-[#F02B30] hover:to-[#9B1118] border-0 text-white"
                >
                  <MessageSquare className="size-4 mr-1" /> Send message
                </Button>
                <Button onClick={() => void toggleBlock()} variant="outline" disabled={busy} className="bg-white/10 border-white/30 text-white hover:bg-white/20 hover:text-white">
                  {p.is_blocked_by_me ? <><ShieldOff className="size-4 mr-1" /> Unblock</> : <><Ban className="size-4 mr-1" /> Block</>}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}