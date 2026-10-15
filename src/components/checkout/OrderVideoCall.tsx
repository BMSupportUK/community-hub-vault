import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Phone, PhoneOff, Video } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  endLiveHelpCustomer,
  endLiveHelpStaff,
  getLiveHelp,
  joinLiveHelp,
  listOrderLiveHelp,
  startLiveHelp,
} from "@/lib/live-help.functions";
import { VideoCallStage } from "@/components/app/VideoCallStage";

type Session = { id: string; status: "waiting" | "live" | "ended" | "expired" };

/** Customer side on the secure order page: start a two-way video call. */
export function OrderVideoCallCustomer({ token, password }: { token: string; password: string }) {
  const start = useServerFn(startLiveHelp);
  const poll = useServerFn(getLiveHelp);
  const endFn = useServerFn(endLiveHelpCustomer);
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    supabase.rpc("is_business_open").then(({ data }) => setOpen(data !== false));
  }, []);

  useEffect(() => {
    if (!session) return;
    let off = false;
    const tick = async () => {
      const r = await poll({ data: { token, password } }).catch(() => null);
      if (off || !r?.ok) return;
      setSession(r.session && (r.session.status === "waiting" || r.session.status === "live") ? r.session : null);
    };
    const id = window.setInterval(tick, 3000);
    return () => { off = true; window.clearInterval(id); };
  }, [session?.id, poll, token, password]);

  const end = useCallback(async () => {
    const s = session;
    setSession(null);
    if (s) await endFn({ data: { token, password, sessionId: s.id } }).catch(() => undefined);
  }, [session, endFn, token, password]);

  const request = async () => {
    setBusy(true);
    try {
      const r = await start({ data: { token, password } });
      if (r.ok) setSession(r.session);
      else toast.error("Video calls are only available during opening hours");
    } catch {
      toast.error("Couldn't start the call — please try again");
    } finally { setBusy(false); }
  };

  if (!open && !session) return null;

  return (
    <>
      {!session && (
        <button
          type="button"
          onClick={request}
          disabled={busy}
          className="fixed bottom-24 left-4 z-40 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Video className="size-4" />} Start video call
        </button>
      )}
      {session?.status === "waiting" && (
        <div className="fixed bottom-24 left-4 z-40 flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm text-card-foreground shadow-lg">
          <Loader2 className="size-4 animate-spin text-primary" /> Calling BM Support…
          <button type="button" onClick={end} className="ml-1 inline-flex items-center gap-1 rounded-full bg-destructive px-3 py-1 text-xs font-semibold text-destructive-foreground">
            <PhoneOff className="size-3" /> Cancel
          </button>
        </div>
      )}
      {session?.status === "live" && (
        <VideoCallStage topic={`video-call-${session.id}`} side="answerer" otherName="BM Support" onHangup={end} />
      )}
    </>
  );
}

/** Staff side on the admin secure page: ring + answer the customer's call. */
export function OrderVideoCallStaff({ orderId }: { orderId: string }) {
  const list = useServerFn(listOrderLiveHelp);
  const join = useServerFn(joinLiveHelp);
  const endFn = useServerFn(endLiveHelpStaff);
  const [session, setSession] = useState<Session | null>(null);
  const [inCall, setInCall] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let off = false;
    const tick = async () => {
      const r = await list({ data: { orderId } }).catch(() => null);
      if (off || !r) return;
      const open = r.sessions.find((s) => s.status === "waiting" || s.status === "live") ?? null;
      setSession(open);
      if (!open) setInCall(false);
    };
    tick();
    const id = window.setInterval(tick, 4000);
    return () => { off = true; window.clearInterval(id); };
  }, [orderId, list]);

  const answer = async () => {
    if (!session) return;
    setBusy(true);
    try {
      await join({ data: { sessionId: session.id } });
      setInCall(true);
    } catch (e) {
      toast.error((e as Error).message || "Couldn't join");
    } finally { setBusy(false); }
  };

  const end = useCallback(async () => {
    const s = session;
    setInCall(false);
    setSession(null);
    if (s) await endFn({ data: { sessionId: s.id } }).catch(() => undefined);
  }, [session, endFn]);

  if (!session) return null;
  return (
    <>
      {!inCall && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary bg-primary/10 p-3 text-sm">
          <Video className="size-5 text-primary" />
          <span className="flex-1 font-semibold">{session.status === "waiting" ? "The customer is video calling you" : "Video call in progress"}</span>
          <button type="button" disabled={busy} onClick={answer} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
            {busy ? <Loader2 className="size-3 animate-spin" /> : <Phone className="size-3" />} {session.status === "waiting" ? "Answer" : "Rejoin"}
          </button>
          <button type="button" onClick={end} className="inline-flex items-center gap-1 rounded-md bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground">
            <PhoneOff className="size-3" /> {session.status === "waiting" ? "Decline" : "End"}
          </button>
        </div>
      )}
      {inCall && <VideoCallStage topic={`video-call-${session.id}`} side="offerer" otherName="the customer" onHangup={end} />}
    </>
  );
}
