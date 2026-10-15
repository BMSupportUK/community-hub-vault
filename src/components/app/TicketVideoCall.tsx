import { useCallback, useEffect, useState } from "react";
import { Phone, PhoneOff, Video, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { answerTicketVideoCall, endTicketVideoCall, startTicketVideoCall } from "@/lib/video-call.functions";
import { canAnswerTicketVideoCall, canTakeVideoCalls } from "@/lib/video-call-access";
import { VideoCallStage } from "@/components/app/VideoCallStage";

type Call = { id: string; ticket_id: string; started_by: string; status: string; joined_by: string | null };

/** Video call button + ringing pop-up + call screen for one support ticket. */
export function TicketVideoCall({
  ticketId,
  ownerId,
  ticketStatus,
  currentUserId,
  roles,
}: {
  ticketId: string;
  ownerId: string;
  ticketStatus: string;
  currentUserId: string;
  roles: readonly string[];
}) {
  const [call, setCall] = useState<Call | null>(null);
  const [inCall, setInCall] = useState<"offerer" | "answerer" | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(true);
  const isOwner = ownerId === currentUserId;
  const isStaffSide = canTakeVideoCalls(roles);

  useEffect(() => {
    supabase.rpc("is_business_open").then(({ data }) => setOpen(data !== false));
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from("ticket_video_calls")
      .select("id,ticket_id,started_by,status,joined_by")
      .eq("ticket_id", ticketId)
      .in("status", ["ringing", "live"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setCall((data as Call | null) ?? null);
  }, [ticketId]);

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel(`ticket-video-${ticketId}-${currentUserId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ticket_video_calls", filter: `ticket_id=eq.${ticketId}` }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ticketId, currentUserId, refresh]);

  // If the call ends from the other side, close the screen.
  useEffect(() => {
    if (inCall && !call) setInCall(null);
  }, [call, inCall]);

  const start = async () => {
    setBusy(true);
    try {
      await startTicketVideoCall({ data: { ticketId } });
      await refresh();
    } catch (e) {
      toast.error((e as Error).message || "Couldn't start the call");
    } finally { setBusy(false); }
  };

  const answer = async (accept: boolean) => {
    if (!call) return;
    setBusy(true);
    try {
      await answerTicketVideoCall({ data: { callId: call.id, accept } });
      if (accept) setInCall("offerer");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message || "Couldn't answer");
    } finally { setBusy(false); }
  };

  const end = useCallback(async () => {
    const id = call?.id;
    setInCall(null);
    if (id) await endTicketVideoCall({ data: { callId: id } }).catch(() => undefined);
    refresh();
  }, [call?.id, refresh]);

  const iStarted = call?.started_by === currentUserId;
  // The caller enters the call screen once the other side answers.
  useEffect(() => {
    if (call?.status === "live" && iStarted && !inCall) setInCall("answerer");
  }, [call?.status, iStarted, inCall]);

  if (!isOwner && !isStaffSide) return null;

  const canAnswer = call?.status === "ringing" && !iStarted &&
    canAnswerTicketVideoCall({ roles, isOwner, startedByOwner: call.started_by === ownerId });

  return (
    <>
      {!call && ticketStatus !== "closed" && open && (
        <button
          type="button"
          onClick={start}
          disabled={busy}
          title="Start a live video call"
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground shadow disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : <Video className="size-3" />} Video call
        </button>
      )}
      {call?.status === "ringing" && iStarted && (
        <button
          type="button"
          onClick={end}
          className="inline-flex items-center gap-1 rounded-md bg-destructive px-2 py-1 text-xs font-semibold text-destructive-foreground shadow"
        >
          <Loader2 className="size-3 animate-spin" /> Calling… Cancel
        </button>
      )}
      {canAnswer && !inCall && (
        <div className="fixed inset-x-3 top-20 z-[90] mx-auto max-w-sm rounded-xl border border-border bg-card p-4 text-card-foreground shadow-2xl">
          <div className="flex items-center gap-2 font-semibold"><Video className="size-5 text-primary" /> Incoming video call</div>
          <p className="mt-1 text-sm text-muted-foreground">{isOwner ? "BM Support is calling you about this ticket." : "The customer wants a live video call on this ticket."}</p>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={busy} onClick={() => answer(true)} className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
              <Phone className="size-4" /> Answer
            </button>
            <button type="button" disabled={busy} onClick={() => answer(false)} className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-destructive px-3 py-2 text-sm font-semibold text-destructive-foreground">
              <PhoneOff className="size-4" /> Decline
            </button>
          </div>
        </div>
      )}
      {call?.status === "live" && !inCall && (call.joined_by === currentUserId || iStarted) && (
        <button type="button" onClick={() => setInCall(iStarted ? "answerer" : "offerer")} className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground shadow">
          <Video className="size-3" /> Rejoin call
        </button>
      )}
      {inCall && call && (
        <VideoCallStage
          topic={`video-call-${call.id}`}
          side={inCall}
          otherName={isOwner ? "BM Support" : "the customer"}
          onHangup={end}
        />
      )}
    </>
  );
}
