import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, PhoneOff, Video } from "lucide-react";
import { VideoCallStage } from "@/components/app/VideoCallStage";
import { CustomerTicketCallChatPanel } from "@/components/app/TicketCallChat";
import { endTicketVideoByToken, getTicketVideoByToken, startTicketVideoByToken } from "@/lib/ticket-video.functions";

export const Route = createFileRoute("/video/$token")({
  head: () => ({
    meta: [
      { title: "Video call — BM Support" },
      { name: "description", content: "Start your video call with BM Support from your phone." },
      { property: "og:title", content: "Video call — BM Support" },
      { property: "og:description", content: "Start your video call with BM Support from your phone." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TicketVideoPage,
});

type State = "loading" | "ready" | "waiting" | "live" | "ended" | "expired" | "closed" | "missing";

function TicketVideoPage() {
  const { token } = Route.useParams();
  const get = useServerFn(getTicketVideoByToken);
  const start = useServerFn(startTicketVideoByToken);
  const endFn = useServerFn(endTicketVideoByToken);
  const [state, setState] = useState<State>("loading");
  const [callId, setCallId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const apply = useCallback((r: Awaited<ReturnType<typeof get>>) => {
    if (!r.ok) return setState(r.reason === "expired" ? "expired" : "missing");
    setCallId(r.call.id);
    const s = r.call.status;
    if (s === "ringing") setState(r.businessOpen ? "ready" : "closed");
    else if (s === "waiting" || s === "live") setState((cur) => (cur === "live" || cur === "waiting" ? cur : "waiting"));
    else setState("ended");
  }, []);

  useEffect(() => {
    let off = false;
    const tick = async () => {
      const r = await get({ data: { token } }).catch(() => null);
      if (!off && r) apply(r);
    };
    void tick();
    const id = window.setInterval(tick, 4000);
    return () => { off = true; window.clearInterval(id); };
  }, [token, get, apply]);

  const begin = async () => {
    setBusy(true);
    try {
      const r = await start({ data: { token } });
      if (!r.ok) setState(r.reason === "expired" ? "expired" : r.reason === "closed" ? "closed" : "ended");
      else { setCallId(r.call.id); setState("waiting"); }
    } finally { setBusy(false); }
  };

  const hangup = useCallback(async () => {
    setState("ended");
    await endFn({ data: { token } }).catch(() => undefined);
  }, [endFn, token]);

  if ((state === "waiting" || state === "live") && callId) {
    return <VideoCallStage topic={`video-call-${callId}`} side="answerer" otherName="BM Support" onHangup={hangup} sidePanel={<CustomerTicketCallChatPanel token={token} />} />;
  }

  const msg: Record<Exclude<State, "waiting" | "live" | "ready">, string> = {
    loading: "Loading…",
    ended: "This video call has ended. You can close this page.",
    expired: "This video call link has expired. Ask BM Support in your ticket to send a new one.",
    closed: "Video calls are only available during opening hours.",
    missing: "This video call link isn't valid.",
  };

  return (
    <main className="grid min-h-screen place-items-center bg-background p-6 text-center text-foreground">
      <div className="max-w-sm space-y-4">
        <Video className="mx-auto size-10 text-primary" />
        <h1 className="font-display text-xl font-bold">BM Support video call</h1>
        {state === "ready" ? (
          <>
            <p className="text-sm text-muted-foreground">Point your phone's camera at the device you need help with. Your camera and microphone will be used for the call only, nothing is recorded.</p>
            <button type="button" disabled={busy} onClick={begin} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Video className="size-4" />} Start video call
            </button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{state === "loading" ? <Loader2 className="mx-auto size-5 animate-spin" /> : msg[state as keyof typeof msg]}</p>
        )}
        {state === "ended" && <PhoneOff className="mx-auto size-5 text-muted-foreground" />}
      </div>
    </main>
  );
}
