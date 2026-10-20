import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Phone, Video } from "lucide-react";
import QRCode from "react-qr-code";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { VideoCallStage, staffPlaceholderMale } from "@/components/app/VideoCallStage";
import { StaffCallViewer, StaffOnCallBox, useStaffCallRoom } from "@/components/checkout/StaffCallRoom";
import { StaffTicketCallChatPanel } from "@/components/app/TicketCallChat";
import {
  endTicketVideoCallStaff,
  getTicketVideoCallStaff,
  joinTicketVideoCallStaff,
  requestTicketVideoAssistance,
} from "@/lib/ticket-video.functions";

type Call = { id: string; ticketId: string; status: "ringing" | "waiting" | "live" | "ended" | "missed" };

/** QR code + phone link shown inside a ticket message created by "/video". */
export function TicketVideoInviteCard({ token, text }: { token: string; text: string }) {
  const url = typeof window !== "undefined" ? `${window.location.origin}/video/${token}` : `/video/${token}`;
  return (
    <div className="space-y-2">
      <p className="whitespace-pre-wrap text-sm">{text}</p>
      <div className="inline-block rounded-xl bg-white p-3">
        <QRCode value={url} size={168} level="M" />
      </div>
      <div>
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
          <Video className="size-3" /> Open video call on this phone
        </a>
      </div>
    </div>
  );
}

/** Staff side of a ticket video call: incoming banner, multi-staff room and the call screen. */
export function TicketVideoCallStaff({ ticketId, ownerId }: { ticketId: string; ownerId: string }) {
  const get = useServerFn(getTicketVideoCallStaff);
  const join = useServerFn(joinTicketVideoCallStaff);
  const endFn = useServerFn(endTicketVideoCallStaff);
  const askHelp = useServerFn(requestTicketVideoAssistance);
  const { roles } = useAuth();
  const [call, setCall] = useState<Call | null>(null);
  const [inCall, setInCall] = useState(false);
  const [busy, setBusy] = useState(false);
  const [me, setMe] = useState<{ userId: string; name: string } | null>(null);
  const [isMale, setIsMale] = useState(false);
  const role = roles.includes("admin") ? "admin" : roles.includes("management") ? "management" : "staff";
  const room = useStaffCallRoom(inCall && call ? call.id : null, me ? { ...me, role } : null);
  const roomRef = useRef(room);
  roomRef.current = room;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id;
      if (!uid) return;
      supabase.from("profiles").select("staff_gender,username").eq("id", uid).maybeSingle().then(({ data: p }) => {
        const row = p as { staff_gender?: string; username?: string } | null;
        setIsMale(row?.staff_gender === "male");
        setMe({ userId: uid, name: row?.username || "Staff" });
      });
    });
  }, []);

  useEffect(() => {
    let off = false;
    const tick = async () => {
      const r = await get({ data: { ticketId } }).catch(() => null);
      if (off || !r) return;
      setCall(r.call);
      if (!r.call) setInCall(false);
    };
    void tick();
    const id = window.setInterval(tick, 4000);
    return () => { off = true; window.clearInterval(id); };
  }, [ticketId, get]);

  const answer = async () => {
    if (!call) return;
    setBusy(true);
    try {
      await join({ data: { callId: call.id } });
      setInCall(true);
    } catch (e) {
      toast.error((e as Error).message || "Couldn't join");
    } finally { setBusy(false); }
  };

  const end = useCallback(async () => {
    const c = call;
    setInCall(false);
    // Other staff still on the call: only this person leaves.
    if (roomRef.current.othersPresent()) return;
    setCall(null);
    if (c) await endFn({ data: { callId: c.id } }).catch(() => undefined);
  }, [call, endFn]);

  if (!call) return null;

  if (!inCall) {
    return (
      <div className="mx-3 mt-2 flex flex-wrap items-center gap-3 rounded-xl border border-primary bg-primary/10 p-3 text-sm sm:mx-5">
        <Video className="size-5 text-primary" />
        <span className="flex-1 font-semibold">{call.status === "waiting" ? "The customer is waiting on a video call" : "Video call in progress"}</span>
        <button type="button" disabled={busy} onClick={answer} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
          {busy ? <Loader2 className="size-3 animate-spin" /> : <Phone className="size-3" />} {call.status === "waiting" ? "Join" : "Rejoin"}
        </button>
      </div>
    );
  }

  if (!room.ready) {
    return (
      <div className="fixed inset-0 z-[100] grid place-items-center bg-background text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Joining the call…</span>
      </div>
    );
  }

  const chat = <StaffTicketCallChatPanel ticketId={ticketId} ownerId={ownerId} />;
  return (
    <>
      {room.isHost ? (
        <VideoCallStage topic={`video-call-${call.id}`} side="offerer" otherName="the customer" onHangup={end} startWithCamera={false} placeholderImage={isMale ? staffPlaceholderMale : undefined} staffGender={isMale ? "male" : "female"} onRemoteTrack={room.pushTrack} quietLeave={room.othersPresent} sidePanel={chat} />
      ) : (
        <StaffCallViewer room={room} sessionId={call.id} onLeave={() => setInCall(false)} sidePanel={chat} />
      )}
      <StaffOnCallBox room={room} requestHelp={askHelp} />
    </>
  );
}
