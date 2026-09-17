import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, UserMinus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { notifyFanAliasChange } from "@/lib/fan-alias-bus";
import { BORO_DEFAULT_AVATAR_URL as boroDefaultAvatar } from "@/lib/boro-default-avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type FriendRow = { user_id: string; fan_alias: string | null; fan_avatar_url: string | null; friendship_id: string };
type AcceptedFriend = FriendRow & { mutual: boolean };

/**
 * Boro Fan Zone friends: counters for all friendships and for mutual ones
 * (both people added each other), each opening a full-page card list.
 * Shared by the Fan Zone profile settings tab and the full profile page.
 */
export function FanZoneFriendsPanel({ userId }: { userId: string }) {
  const [rows, setRows] = useState<AcceptedFriend[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [openList, setOpenList] = useState<"all" | "mutual" | null>(null);
  const [ownerAlias, setOwnerAlias] = useState<string | null>(null);

  const load = async () => {
    const [{ data: friendList }, { data: aliasRows }] = await Promise.all([
      supabase.rpc("fan_zone_friend_list", { _target_user_id: userId }),
      supabase.rpc("fan_zone_aliases", { _ids: [userId] }),
    ]);
    const accepted = (friendList ?? []) as Array<{
      friendship_id: string;
      user_id: string;
      fan_alias: string | null;
      fan_avatar_url: string | null;
      mutual: boolean;
    }>;
    setRows(accepted);
    setOwnerAlias(((aliasRows as any[]) ?? [])[0]?.fan_alias ?? null);
  };

  useEffect(() => {
    void load();
    const ch = supabase
      .channel(`fanzone-friends-panel:${userId}:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "fan_zone_friendships" }, () => void load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const remove = async (friendshipId: string) => {
    setBusy(friendshipId);
    const { error } = await supabase.from("fan_zone_friendships").delete().eq("id", friendshipId);
    setBusy(null);
    if (error) return toast.error("Couldn't remove friend", { description: error.message });
    notifyFanAliasChange();
    toast.success("Friend removed");
    void load();
  };

  const all = rows ?? [];
  const mutualList = all.filter((r) => r.mutual);
  const dialogRows = openList === "mutual" ? mutualList : all;

  return (
    <div className="rounded-2xl border border-[#E11B22]/40 bg-black/35 backdrop-blur-md shadow-2xl text-white p-5 sm:p-6">
      <h2 className="font-display text-xl font-bold mb-1">Friends</h2>
      <p className="text-sm text-white/70 mb-4">
        Your Boro Fan Zone friends. This list is separate from your BM Support friends.
      </p>
      {rows === null ? (
        <div className="grid place-items-center py-12">
          <Loader2 className="size-5 animate-spin text-white/70" />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setOpenList("all")}
            className="rounded-xl border border-white/15 bg-white/5 p-4 text-left transition hover:border-[#E11B22]/60 hover:bg-white/10"
          >
            <div className="font-display text-3xl font-black leading-none">{all.length}</div>
            <div className="mt-1 text-xs uppercase tracking-wider font-semibold text-white/70">Friends</div>
            <div className="mt-1 text-[11px] text-white/50">Tap the number to see them all</div>
          </button>
          <button
            type="button"
            onClick={() => setOpenList("mutual")}
            className="rounded-xl border border-[#E11B22]/45 bg-[#E11B22]/10 p-4 text-left transition hover:border-[#E11B22] hover:bg-[#E11B22]/20"
          >
            <div className="font-display text-3xl font-black leading-none">{mutualList.length}</div>
            <div className="mt-1 text-xs uppercase tracking-wider font-semibold text-white/80">Mutual friends</div>
            <div className="mt-1 text-[11px] text-white/50">You've both added each other</div>
          </button>
        </div>
      )}

      <Dialog open={openList !== null} onOpenChange={(o) => !o && setOpenList(null)}>
        <DialogContent className="boro-theme max-w-none w-[98vw] sm:w-[95vw] h-[92vh] p-0 gap-0 overflow-hidden border-[#E11B22]/50 bg-[#07070b]/98 text-white">
          <DialogHeader className="px-5 sm:px-7 py-4 border-b border-white/10 bg-gradient-to-r from-[#E11B22]/30 to-transparent text-left">
            <DialogTitle className="font-display text-2xl font-black">
              {openList === "mutual" ? "Mutual friends" : "Friends"} ({dialogRows.length})
            </DialogTitle>
            <DialogDescription className="text-white/70 text-sm">
              {openList === "mutual"
                ? "Fans where you've each added the other."
                : "Everyone you're connected with in the Boro Fan Zone."}
            </DialogDescription>
          </DialogHeader>
          <div className="h-[calc(92vh-6.5rem)] overflow-y-auto px-5 sm:px-7 py-5">
            {dialogRows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/20 p-10 text-center text-sm text-white/60">
                {openList === "mutual"
                  ? "No mutual friendships yet."
                  : "You have no friends yet. Visit a fan's profile to add them."}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {dialogRows.map((r) => (
                  <div
                    key={r.friendship_id}
                    className="flex items-start gap-3 rounded-2xl border border-white/12 bg-white/[0.06] p-4 transition hover:border-[#E11B22]/50"
                  >
                    <img
                      src={r.fan_avatar_url || boroDefaultAvatar}
                      alt=""
                      className="size-14 shrink-0 rounded-full object-cover ring-2 ring-white/15"
                    />
                    <div className="min-w-0 flex-1">
                      <Link
                        to="/fanzone/u/$userId"
                        params={{ userId: r.user_id }}
                        className="block font-semibold text-sm break-words hover:underline"
                      >
                        {r.fan_alias || "Boro fan"}
                      </Link>
                      <span
                        className={`mt-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${
                          r.mutual
                            ? "bg-[#E11B22]/25 text-white ring-[#E11B22]/60"
                            : "bg-white/10 text-white/75 ring-white/20"
                        }`}
                      >
                        {r.mutual ? "Mutual friends" : "One-way friend"}
                      </span>
                      <div className="mt-3">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === r.friendship_id}
                          onClick={() => void remove(r.friendship_id)}
                          className="bg-white/10 border-white/30 text-white hover:bg-white/20"
                        >
                          {busy === r.friendship_id ? (
                            <Loader2 className="size-4 mr-1 animate-spin" />
                          ) : (
                            <UserMinus className="size-4 mr-1" />
                          )}
                          Remove
                        </Button>
                      </div>
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
