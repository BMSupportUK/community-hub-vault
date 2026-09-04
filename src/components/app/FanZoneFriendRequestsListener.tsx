import { useEffect, useRef, useState } from "react";
import { UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import boroDefaultAvatar from "@/assets/boro-default-avatar.png";

/**
 * Boro Fan Zone friend requests — completely separate from the BM Support
 * friends system (`friendships` / FriendRequestsListener). This one only ever
 * touches `fan_zone_friendships` and Fan Zone aliases/avatars.
 */
interface FanPendingRequest {
  id: string;
  requester_id: string;
  fan_alias: string;
  fan_avatar_url: string | null;
}

export function FanZoneFriendRequestsListener() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [queue, setQueue] = useState<FanPendingRequest[]>([]);
  const current = queue[0] ?? null;
  const handlingRef = useRef(false);

  const enqueue = async (rowId: string, requesterId: string) => {
    // Direct reads of other members' rows are restricted, so use the safe alias lookup.
    const { data: rows } = await supabase.rpc("fan_zone_aliases", { _ids: [requesterId] });
    const m = (rows ?? [])[0] as { fan_alias: string | null; fan_avatar_url: string | null } | undefined;
    setQueue((q) =>
      q.some((x) => x.id === rowId)
        ? q
        : [...q, {
            id: rowId,
            requester_id: requesterId,
            fan_alias: m?.fan_alias || "A Boro fan",
            fan_avatar_url: m?.fan_avatar_url ?? null,
          }],
    );
  };

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from("fan_zone_friendships")
        .select("id, requester_id")
        .eq("addressee_id", user.id)
        .eq("status", "pending");
      if (cancelled) return;
      for (const r of data ?? []) await enqueue(r.id, r.requester_id);
    })();

    const ch = supabase
      .channel(`fanzone-friendships:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "fan_zone_friendships", filter: `addressee_id=eq.${user.id}` },
        (p) => {
          const row = p.new as { id: string; requester_id: string; status: string };
          if (row.status === "pending") void enqueue(row.id, row.requester_id);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "fan_zone_friendships", filter: `requester_id=eq.${user.id}` },
        async (p) => {
          const row = p.new as { addressee_id: string; status: string };
          const old = p.old as { status?: string };
          if (row.status !== "accepted" || old?.status === "accepted") return;
          const { data: aliasRows } = await supabase.rpc("fan_zone_aliases", { _ids: [row.addressee_id] });
          const m = (aliasRows ?? [])[0] as { fan_alias: string | null } | undefined;
          toast.success(`${m?.fan_alias?.trim() || "A Boro fan"} accepted your Fan Zone friend request`, {
            action: {
              label: "View profile",
              onClick: () => navigate({ to: "/fanzone/u/$userId", params: { userId: row.addressee_id } }),
            },
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const respond = async (accept: boolean) => {
    if (!current || handlingRef.current) return;
    handlingRef.current = true;
    const id = current.id;
    setQueue((q) => q.filter((x) => x.id !== id));
    if (accept) {
      const { error } = await supabase
        .from("fan_zone_friendships")
        .update({ status: "accepted" })
        .eq("id", id)
        .eq("addressee_id", user?.id ?? "");
      if (error) toast.error(error.message);
      else toast.success(`You and ${current.fan_alias} are now Fan Zone friends`);
    } else {
      const { error } = await supabase.from("fan_zone_friendships").delete().eq("id", id);
      if (error) toast.error(error.message);
      else toast.message("Friend request declined");
    }
    handlingRef.current = false;
  };

  if (!current) return null;

  return (
    <AlertDialog open={!!current}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <UserPlus className="size-5 text-[#E11B22]" /> New Boro Fan Zone friend request
          </AlertDialogTitle>
          <AlertDialogDescription className="flex items-center gap-3 pt-1">
            <img
              src={current.fan_avatar_url || boroDefaultAvatar}
              alt=""
              className="size-10 rounded-full object-cover ring-2 ring-border"
            />
            <span>
              <span className="font-medium text-foreground">{current.fan_alias}</span> wants to be your friend in the Boro
              Fan Zone.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => void respond(false)}>Decline</AlertDialogCancel>
          <AlertDialogAction onClick={() => void respond(true)}>Accept</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
