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

interface PendingRequest {
  id: string;
  requester_id: string;
  requester_name: string;
  requester_username: string | null;
}

export function FriendRequestsListener() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [queue, setQueue] = useState<PendingRequest[]>([]);
  const current = queue[0] ?? null;
  const handlingRef = useRef(false);

  const enqueue = async (rowId: string, requesterId: string) => {
    const { data: prof } = await supabase
      .from("profiles").select("display_name, username").eq("id", requesterId).maybeSingle();
    setQueue((q) =>
      q.some((x) => x.id === rowId)
        ? q
        : [...q, {
            id: rowId,
            requester_id: requesterId,
            requester_name: prof?.display_name || prof?.username || "Someone",
            requester_username: prof?.username ?? null,
          }],
    );
  };

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from("friendships")
        .select("id, requester_id")
        .eq("addressee_id", user.id)
        .eq("status", "pending");
      if (cancelled) return;
      for (const r of data ?? []) await enqueue(r.id, r.requester_id);
    })();

    const ch = supabase
      .channel(`friendships:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "friendships", filter: `addressee_id=eq.${user.id}` },
        (p) => {
          const row = p.new as { id: string; requester_id: string; status: string };
          if (row.status === "pending") enqueue(row.id, row.requester_id);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "friendships", filter: `requester_id=eq.${user.id}` },
        async (p) => {
          const row = p.new as { addressee_id: string; status: string };
          const old = p.old as { status?: string };
          if (row.status !== "accepted" || old?.status === "accepted") return;
          const { data: prof } = await supabase
            .from("profiles")
            .select("display_name, username")
            .eq("id", row.addressee_id)
            .maybeSingle();
          const name = prof?.display_name || prof?.username || "Someone";
          const slug = prof?.username ?? row.addressee_id;
          toast.success(`${name} accepted your friend request`, {
            action: {
              label: "View profile",
              onClick: () => navigate({ to: "/u/$username", params: { username: slug } }),
            },
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [user]);

  const respond = async (accept: boolean) => {
    if (!current) return;
    if (handlingRef.current) return;
    handlingRef.current = true;
    const id = current.id;
    setQueue((q) => q.filter((x) => x.id !== id));
    if (accept) {
      const { error } = await supabase.from("friendships").update({ status: "accepted" }).eq("id", id);
      if (error) toast.error(error.message);
      else toast.success(`You and ${current.requester_name} are now friends`);
    } else {
      const { error } = await supabase.from("friendships").delete().eq("id", id);
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
            <UserPlus className="size-5 text-primary" /> New friend request
          </AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium text-foreground">{current.requester_name}</span>
            {current.requester_username ? <> (@{current.requester_username})</> : null}{" "}
            wants to be your friend.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => respond(false)}>Decline</AlertDialogCancel>
          <AlertDialogAction onClick={() => respond(true)}>Accept</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}