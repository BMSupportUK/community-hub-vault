import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCheck, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Post-call wrap-up for sale video calls. After the call ends, each side
 * confirms the chat is complete; once both have, each side is offered a
 * confirm to close the browser window. Acknowledgements are shared over a
 * per-call broadcast channel — nothing is stored.
 */
export function CallWrapUp({ sessionId, side, onDone }: { sessionId: string | null; side: "customer" | "staff"; onDone: () => void }) {
  const [myAck, setMyAck] = useState(false);
  const [otherAck, setOtherAck] = useState(false);
  const [closed, setClosed] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const other = side === "customer" ? "staff" : "customer";

  useEffect(() => {
    setMyAck(false);
    setOtherAck(false);
    setClosed(false);
    if (!sessionId) return;
    const ch = supabase.channel(`wrap-up-${sessionId}`);
    channelRef.current = ch;
    ch.on("broadcast", { event: "ack" }, ({ payload }) => {
      if ((payload as { side?: string } | null)?.side === other) setOtherAck(true);
    });
    ch.subscribe();
    return () => {
      supabase.removeChannel(ch);
      if (channelRef.current === ch) channelRef.current = null;
    };
  }, [sessionId, other]);

  // Re-send our ack until the other side has confirmed — they may subscribe
  // after we first broadcast.
  useEffect(() => {
    if (!sessionId || !myAck || otherAck) return;
    const id = window.setInterval(() => {
      channelRef.current?.send({ type: "broadcast", event: "ack", payload: { side } }).catch(() => {});
    }, 3000);
    return () => window.clearInterval(id);
  }, [sessionId, myAck, otherAck, side]);

  const ack = useCallback(() => {
    setMyAck(true);
    channelRef.current?.send({ type: "broadcast", event: "ack", payload: { side } }).catch(() => {});
  }, [side]);

  const closeWindow = () => {
    // Only works for script-opened windows; otherwise we show the fallback.
    window.close();
    setClosed(true);
  };

  if (!sessionId) return null;
  const both = myAck && otherAck;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onDone(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {both && <CheckCheck className="size-5 text-primary" />}
            {both ? "Chat complete" : "Is the chat complete?"}
          </DialogTitle>
          <DialogDescription>
            {both
              ? "Both sides have finished. You can close this window now."
              : "The video call has ended. Confirm there's nothing else to sort before closing."}
          </DialogDescription>
        </DialogHeader>

        {!myAck && (
          <button
            type="button"
            onClick={ack}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <CheckCheck className="size-4" /> Yes, chat is complete
          </button>
        )}

        {myAck && !otherAck && (
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Waiting for the other side to confirm…
          </p>
        )}

        {both && !closed && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={closeWindow}
              className="inline-flex h-11 flex-1 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Close window
            </button>
            <button
              type="button"
              onClick={onDone}
              className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-semibold text-card-foreground hover:opacity-90"
            >
              Keep open
            </button>
          </div>
        )}

        {closed && (
          <p className="text-center text-sm text-muted-foreground">You can now close this tab.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
