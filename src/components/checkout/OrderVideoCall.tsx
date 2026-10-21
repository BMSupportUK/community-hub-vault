import { isVideoTestOrder } from "@/lib/video-test-orders";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Phone, PhoneOff, QrCode, Video } from "lucide-react";
import QRCode from "react-qr-code";
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
import { CustomerCheckoutChatPanel, StaffCheckoutChatPanel, secureCheckoutUrl } from "@/components/checkout/CheckoutChat";
import { CallWrapUp } from "@/components/checkout/CallWrapUp";
import { VideoCallStage, staffPlaceholderMale } from "@/components/app/VideoCallStage";
import { StaffCallViewer, StaffOnCallBox, useStaffCallRoom } from "@/components/checkout/StaffCallRoom";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Session = { id: string; status: "waiting" | "live" | "ended" | "expired" };

/** Customer side on the secure order page: start a two-way video call.
 *  `inline` renders the controls in the page flow (under the install guides)
 *  instead of as a floating bubble in the corner. */
export function OrderVideoCallCustomer({ token, password, mobile, inline = false }: { token: string; password: string; mobile: boolean; inline?: boolean }) {
  const start = useServerFn(startLiveHelp);
  const poll = useServerFn(getLiveHelp);
  const endFn = useServerFn(endLiveHelpCustomer);
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [moved, setMoved] = useState(false);
  const [invite, setInvite] = useState(false);
  const [endedId, setEndedId] = useState<string | null>(null);
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;

  useEffect(() => {
    supabase.rpc("is_business_open").then(({ data }) => setOpen(data !== false || isVideoTestOrder(token)));
  }, []);

  useEffect(() => {
    setMoved(false);
  }, [session?.id]);

  useEffect(() => {
    if (!session) return;
    let off = false;
    const tick = async () => {
      const r = await poll({ data: { token, password } }).catch(() => null);
      if (off || !r?.ok) return;
      const open = r.session && (r.session.status === "waiting" || r.session.status === "live") ? r.session : null;
      if (!open && sessionRef.current) setEndedId(sessionRef.current.id);
      setSession(open);
    };
    const id = window.setInterval(tick, 3000);
    return () => { off = true; window.clearInterval(id); };
  }, [session?.id, poll, token, password]);

  const end = useCallback(async () => {
    const s = session;
    setSession(null);
    if (s) setEndedId(s.id);
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

  // On a computer: invite the customer to stream from their phone via QR code.
  if (!mobile) {
    const phoneUrl = `${secureCheckoutUrl(token)}?pw=${encodeURIComponent(password)}`;
    return (
      <>
        <CallWrapUp sessionId={endedId} side="customer" onDone={() => setEndedId(null)} />
        <button
          type="button"
          onClick={() => setInvite(true)}
          className={inline
            ? "w-full inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
            : "fixed bottom-24 left-4 z-40 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg"}
        >
          <QrCode className="size-4" /> Video help
        </button>
        <Dialog open={invite} onOpenChange={setInvite}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Show us on video</DialogTitle>
              <DialogDescription>
                Open your phone's normal camera and point it at this code — no QR app needed. Tap the link that pops up, then tap <b>Start video call</b>.
              </DialogDescription>
            </DialogHeader>
            <div className="grid place-items-center">
              {/* White quiet zone so built-in iPhone/Android cameras read it instantly. */}
              <div className="rounded-xl bg-white p-5">
                <QRCode value={phoneUrl} size={240} level="M" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Point your phone at the device you're setting up — we'll see it on our big screen while you keep chatting here.</p>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      {!session && (
        <button
          type="button"
          onClick={request}
          disabled={busy}
          className={inline
            ? "w-full inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            : "fixed bottom-24 left-4 z-40 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg disabled:opacity-60"}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Video className="size-4" />} Start video call
        </button>
      )}
      {session?.status === "waiting" && (
        <div className={inline
          ? "flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-card-foreground"
          : "fixed bottom-24 left-4 z-40 flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm text-card-foreground shadow-lg"}>
          <Loader2 className="size-4 animate-spin text-primary" /> Calling BM Support…
          <button type="button" onClick={end} className="ml-1 inline-flex items-center gap-1 rounded-full bg-destructive px-3 py-1 text-xs font-semibold text-destructive-foreground">
            <PhoneOff className="size-3" /> Cancel
          </button>
        </div>
      )}
      {session?.status === "live" && (moved ? (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-background p-6 text-center">
          <div className="max-w-sm space-y-4">
            <p className="text-lg font-semibold">Your video call has moved to your other device.</p>
            <p className="text-sm text-muted-foreground">You can keep chatting on this screen, or end the call.</p>
            <button type="button" onClick={end} className="inline-flex items-center gap-2 rounded-full bg-destructive px-5 py-2.5 text-sm font-semibold text-destructive-foreground">
              <PhoneOff className="size-4" /> End call
            </button>
          </div>
        </div>
      ) : (
        <VideoCallStage topic={`video-call-${session.id}`} side="answerer" otherName="BM Support" onHangup={end} onSuperseded={() => setMoved(true)} sidePanel={<CustomerCheckoutChatPanel token={token} password={password} />} />
      ))}
      <CallWrapUp sessionId={endedId} side="customer" onDone={() => setEndedId(null)} />
    </>
  );
}

/** Staff-side hook: watches for the customer's video call and handles answer/end. */
export function useOrderVideoCallStaff(orderId: string) {
  const list = useServerFn(listOrderLiveHelp);
  const join = useServerFn(joinLiveHelp);
  const endFn = useServerFn(endLiveHelpStaff);
  const [session, setSession] = useState<Session | null>(null);
  const [inCall, setInCall] = useState(false);
  const [busy, setBusy] = useState(false);
  const [isMale, setIsMale] = useState(false);
  const { roles } = useAuth();
  const [me, setMe] = useState<{ userId: string; name: string } | null>(null);
  const [endedId, setEndedId] = useState<string | null>(null);
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;
  const role = roles.includes("admin") ? "admin" : roles.includes("management") ? "management" : "staff";
  const room = useStaffCallRoom(inCall && session ? session.id : null, me ? { ...me, role } : null);

  // Pick the staff illustration matching the signed-in staff member's profile gender.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id;
      if (!uid) return;
      supabase.from("profiles").select("staff_gender,username").eq("id", uid).maybeSingle()
        .then(({ data: p }) => {
          const row = p as { staff_gender?: string; username?: string } | null;
          setIsMale(row?.staff_gender === "male");
          setMe({ userId: uid, name: row?.username || "Staff" });
        });
    });
  }, []);

  useEffect(() => {
    if (!orderId) return;
    let off = false;
    const tick = async () => {
      const r = await list({ data: { orderId } }).catch(() => null);
      if (off || !r) return;
      const open = r.sessions.find((s) => s.status === "waiting" || s.status === "live") ?? null;
      if (!open && sessionRef.current) setEndedId(sessionRef.current.id);
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
    // Other staff still on the call: only this person leaves, the call carries on.
    if (room.othersPresent()) return;
    setSession(null);
    if (s) setEndedId(s.id);
    if (s) await endFn({ data: { sessionId: s.id } }).catch(() => undefined);
  }, [session, endFn, room]);

  /** Leave without ending the call for anyone (used by extra staff). */
  const leave = useCallback(() => { setInCall(false); }, []);

  return { session, inCall, busy, isMale, answer, end, leave, room, endedId, clearWrapUp: () => setEndedId(null) };
}

export type OrderVideoCallStaffState = ReturnType<typeof useOrderVideoCallStaff>;

/** Incoming-call banner with accept/decline — shown in the right sidebar above the secure links. */
export function OrderVideoCallIncoming({ call }: { call: OrderVideoCallStaffState }) {
  if (!call.session || call.inCall) return null;
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary bg-primary/10 p-3 text-sm">
        <Video className="size-5 text-primary" />
        <span className="flex-1 font-semibold">{call.session.status === "waiting" ? "The customer is video calling you" : "Video call in progress"}</span>
        <button type="button" disabled={call.busy} onClick={call.answer} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
          {call.busy ? <Loader2 className="size-3 animate-spin" /> : <Phone className="size-3" />} {call.session.status === "waiting" ? "Accept" : "Rejoin"}
        </button>
        {call.session.status === "waiting" && (
          <button type="button" onClick={call.end} className="inline-flex items-center gap-1 rounded-md bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground">
            <PhoneOff className="size-3" /> Decline
          </button>
        )}
      </div>
    </>
  );
}

/** The live call view — rendered once staff have accepted, on top of the page. */
export function OrderVideoCallStaffStage({ call, orderId }: { call: OrderVideoCallStaffState; orderId: string }) {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    if (!orderId) return;
    supabase.from("order_checkout_links").select("token").eq("order_id", orderId).maybeSingle()
      .then(({ data }) => setToken((data as { token?: string } | null)?.token ?? null));
  }, [orderId]);
  const wrapUp = <CallWrapUp sessionId={call.endedId} side="staff" onDone={call.clearWrapUp} />;
  if (!call.session || !call.inCall) return wrapUp;
  const room = call.room;
  const chat = token ? <StaffCheckoutChatPanel orderId={orderId} token={token} /> : undefined;
  if (!room.ready) {
    return (
      <div className="fixed inset-0 z-[100] grid place-items-center bg-background text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Joining the call…</span>
      </div>
    );
  }
  return (
    <>
      {room.isHost ? (
        <VideoCallStage topic={`video-call-${call.session.id}`} side="offerer" otherName="the customer" onHangup={call.end} startWithCamera={false} placeholderImage={call.isMale ? staffPlaceholderMale : undefined} staffGender={call.isMale ? "male" : "female"} sidePanel={chat} onRemoteTrack={room.pushTrack} quietLeave={room.othersPresent} />
      ) : (
        <StaffCallViewer room={room} sessionId={call.session.id} onLeave={call.leave} sidePanel={chat} />
      )}
      <StaffOnCallBox room={room} />
    </>
  );
}
