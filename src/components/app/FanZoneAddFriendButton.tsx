import { useCallback, useEffect, useState } from "react";
import { Check, Clock, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Props = { viewerId: string; targetId: string; name: string; className?: string };
type State = "none" | "outgoing" | "incoming" | "accepted";

export function FanZoneAddFriendButton({ viewerId, targetId, name, className }: Props) {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (viewerId === targetId) return setState("accepted");
    const { data } = await supabase
      .from("fan_zone_friendships")
      .select("status, requester_id, addressee_id")
      .or(
        `and(requester_id.eq.${viewerId},addressee_id.eq.${targetId}),and(requester_id.eq.${targetId},addressee_id.eq.${viewerId})`,
      );
    const rows = (data ?? []) as Array<{ status: string; requester_id: string }>;
    const mine = rows.find((row) => row.requester_id === viewerId);
    if (mine?.status === "accepted") return setState("accepted");
    if (mine) return setState("outgoing");
    const theirs = rows.find((row) => row.requester_id === targetId);
    if (theirs?.status === "pending") return setState("incoming");
    // Their accepted request is only their one-way friendship. The viewer can
    // still add them independently, which creates a true mutual friendship.
    setState("none");
  }, [viewerId, targetId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!state || viewerId === targetId) return null;

  const base =
    "ml-1 inline-flex size-5 align-middle items-center justify-center rounded-full border border-white/15 text-muted-foreground transition hover:border-[#E11B22]/60 hover:text-[#E11B22] disabled:opacity-60";

  if (state === "accepted") {
    return (
      <span
        className={`${base} cursor-default text-emerald-400 border-emerald-400/40 hover:text-emerald-400 hover:border-emerald-400/40 ${className ?? ""}`}
        title={`You're friends with ${name}`}
      >
        <Check className="size-3" />
      </span>
    );
  }

  if (state === "outgoing") {
    return (
      <span
        className={`${base} cursor-default ${className ?? ""}`}
        title={`Friend request sent to ${name}`}
      >
        <Clock className="size-3" />
      </span>
    );
  }

  if (state === "incoming") {
    return (
      <span
        className={`${base} cursor-default ${className ?? ""}`}
        title={`Friend request from ${name} is waiting in your inbox`}
      >
        <Clock className="size-3" />
      </span>
    );
  }

  const handle = async () => {
    setBusy(true);
    const { error } = await supabase
      .from("fan_zone_friendships")
      .insert({ requester_id: viewerId, addressee_id: targetId });
    setBusy(false);
    if (error) return toast.error("Couldn't send request", { description: error.message });
    setState("outgoing");
  };

  return (
    <button
      type="button"
      disabled={busy}
      onClick={handle}
      className={`${base} ${className ?? ""}`}
      title={`Send ${name} a friend request`}
    >
      <UserPlus className="size-3" />
    </button>
  );
}
