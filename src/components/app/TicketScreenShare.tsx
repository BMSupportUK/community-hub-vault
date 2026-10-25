import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import screenShareOfficeBg from "@/assets/screen-share-office-bg.jpg";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { CheckCircle2, MessageCircle, MonitorUp, Send, Wrench, X } from "lucide-react";
import { TicketRemoteSetup, useTicketRemoteSetup } from "@/components/app/TicketRemoteSetup";
import { canRequestTicketScreenShare } from "@/lib/ticket-remote-setup";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OrderScreenShareTab, useOrderScreenShares } from "@/components/tv/TvRemote";
import { notifyTicketReply, notifyStaffOfCustomerReply } from "@/lib/ticket-notify.functions";
import { canUseTvRemote, normalizePairCode } from "@/lib/tv-remote";
import { isTicketScreenShareInvite, ticketScreenShareInvite, ticketShareConnected, ticketShareRequested, isCustomerTestTicket } from "@/lib/ticket-screen-share";

export function TicketScreenShareInvite({ ticketId }: { ticketId: string }) {
  const { roles, user } = useAuth();
  const navigate = useNavigate();
  return canUseTvRemote(roles) && !isCustomerTestTicket(ticketId, user?.id)
    ? <p>TV screen requested — waiting for the customer to enter their TV code.</p>
    : <div className="space-y-2"><p>Staff have requested your TV screen.</p><Button size="sm" onClick={() => void navigate({ to: "/tickets", search: { id: ticketId, tab: "setup" } })}><MonitorUp className="mr-2 size-4" />Enter TV code</Button></div>;
}

export function TicketScreenShareLayout({ ticketId, ownerId, closed, tab, children }: { ticketId: string; ownerId: string; closed: boolean; tab?: "screen" | "setup"; children: ReactNode }) {
  const { user, roles } = useAuth();
  const staff = canUseTvRemote(roles) && !isCustomerTestTicket(ticketId, user?.id);
  const navigate = useNavigate();
  const notify = useServerFn(notifyTicketReply);
  const [busy, setBusy] = useState(false);
  const setup = useTicketRemoteSetup(ticketId);
  const setupReady = canRequestTicketScreenShare(setup.row);
  const [waiting, setWaiting] = useState(false);
  const [autoAnswer, setAutoAnswer] = useState(false);
  const previousStatus = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    let stopped = false;
    const load = async () => {
      const r = await supabase.rpc("ticket_screen_share_state", { _ticket_id: ticketId });
      if (stopped || r.error) return;
      const state = r.data as { status: string | null; invited: boolean };
      const current = state.status;
      if (staff) setWaiting(current === "pending");
      if (staff && ticketShareRequested(previousStatus.current, current)) toast.info("The customer has entered their TV code — press Answer screen share");
      if (ticketShareConnected(previousStatus.current ?? null, current)) {
        void navigate({ to: "/tickets", search: { id: ticketId, tab: "screen" } });
      }
      previousStatus.current = current;
    };
    void load();
    const timer = window.setInterval(load, 2000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [ticketId, navigate, staff, closed, tab]);
  const request = async () => {
    if (!user || busy || !setupReady) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.from("ticket_messages").insert({ ticket_id: ticketId, sender_id: user.id, content: ticketScreenShareInvite(), is_internal: false }).select("id").single();
      if (error || !data) throw new Error(error?.message ?? "Could not send the request");
      await notify({ data: { ticketId, messageId: data.id } }).catch(() => null);
      toast.success("Screen share request sent to the customer");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not send the request"); }
    finally { setBusy(false); }
  };
  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">

    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card p-2 text-foreground">
      <Tabs value={tab ?? "ticket"} onValueChange={(value) => void navigate({ to: "/tickets", search: { id: ticketId, tab: value === "screen" ? "screen" : value === "setup" ? "setup" : undefined } })}>
        <TabsList><TabsTrigger value="ticket"><MessageCircle className="mr-2 size-4" />Ticket</TabsTrigger><TabsTrigger value="setup"><Wrench className="mr-2 size-4" />Remote setup{setupReady && <CheckCircle2 className="ml-1 size-4 text-primary" />}</TabsTrigger><TabsTrigger value="screen"><MonitorUp className="mr-2 size-4" />Screen share</TabsTrigger></TabsList>
      </Tabs>
      {staff && !closed && waiting && <Button size="sm" className="ml-auto animate-pulse" onClick={() => { setAutoAnswer(true); void navigate({ to: "/tickets", search: { id: ticketId, tab: "screen" } }); }}><MonitorUp className="mr-2 size-4" />Answer screen share</Button>}
      {staff && !closed && !waiting && <Button size="sm" className="ml-auto" disabled={busy || !setupReady} title={setupReady ? undefined : "The customer must finish Remote setup first"} onClick={() => void request()}><MonitorUp className="mr-2 size-4" />{busy ? "Sending…" : setupReady ? "Request screen share" : "Waiting for customer setup"}</Button>}
    </div>
    {tab === "setup" && <div className="min-h-0 flex-1 overflow-y-auto bg-background p-3 sm:p-5"><TicketRemoteSetup ticketId={ticketId} customer={!staff} closed={closed} row={setup.row} reload={setup.reload} /></div>}
    <div className={tab ? "hidden" : "flex min-h-0 flex-1 flex-col"}>{children}</div>
    <div className={tab === "screen" ? "relative isolate min-h-0 flex-1 overflow-y-auto p-3 text-foreground sm:p-5" : "hidden"}>
      {tab === "screen" && <ScreenShareOfficeBackdrop />}
      <TicketScreenShareWorkspace ticketId={ticketId} ownerId={ownerId} staff={staff} viewer={canUseTvRemote(roles)} closed={closed} visible={tab === "screen"} autoAnswer={autoAnswer} onAutoAnswered={() => setAutoAnswer(false)} />
    </div>
  </div>;
}

/** Dimmed office illustration behind Screen share pages: workers at desks waiting to take calls. */
export function ScreenShareOfficeBackdrop() {
  return <>
    <img src={screenShareOfficeBg} alt="" aria-hidden="true" loading="lazy" width={1920} height={1080} className="pointer-events-none absolute inset-0 -z-20 size-full object-cover object-center" />
    <div className="pointer-events-none absolute inset-0 -z-10 bg-background/85" aria-hidden="true" />
  </>;
}

export function TicketScreenShareWorkspace({ ticketId, ownerId, staff, viewer = staff, closed = false, visible = true, autoAnswer = false, onAutoAnswered }: { ticketId: string; ownerId: string; staff: boolean; viewer?: boolean; closed?: boolean; visible?: boolean; autoAnswer?: boolean; onAutoAnswered?: () => void }) {
  // On the owner's customer-view test ticket, staff still get the live viewer below the code box.
  const rows = useOrderScreenShares(viewer ? ticketId : "", "ticket");
  return <div className="space-y-4">
    {!staff && <CustomerTicketScreenShare ticketId={ticketId} closed={closed} />}
    {viewer && <OrderScreenShareTab orderId={ticketId} rows={rows} kind="ticket" autoAnswer={autoAnswer} onAutoAnswered={onAutoAnswered} />}
    {visible && <TicketScreenShareChat ticketId={ticketId} ownerId={ownerId} closed={closed} />}
  </div>;
}

/** Customer Screen share tab: live status only. New TV codes are entered on the Remote setup tab. */
function CustomerTicketScreenShare({ ticketId, closed = false }: { ticketId: string; closed?: boolean }) {
  const navigate = useNavigate();
  const [state, setState] = useState<{ invited: boolean; status: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await supabase.rpc("ticket_screen_share_state", { _ticket_id: ticketId });
    if (r.error) { setError("Screen sharing is unavailable for this ticket."); return; }
    setError(null);
    setState(r.data as { invited: boolean; status: string | null });
  }, [ticketId]);
  useEffect(() => { void load(); const timer = window.setInterval(load, 2000); return () => window.clearInterval(timer); }, [load]);
  const status = state?.status ?? null;
  const live = status === "active";
  const waiting = status === "pending" || status === "claimed";
  const title = error ? "Screen share unavailable" : !state ? "Checking screen share…" : live ? "Your TV screen is being shared" : status === "claimed" ? "Staff are connecting" : status === "pending" ? "Waiting for staff to answer" : closed ? "Ticket closed" : "No screen share running";
  const text = error ? error : !state ? "" : live ? "Staff can see your TV now. You can return to your ticket while the screen share carries on." : status === "claimed" ? "Staff have answered. Press Allow and then Start on your TV." : status === "pending" ? "Staff have been alerted. When they answer, press Allow and then Start on your TV." : closed ? "This ticket is closed, so screen sharing is no longer available." : "Enter your TV code above to start a screen share.";
  const sendCode = async () => {
    setBusy(true);
    const { data, error: e } = await supabase.rpc("verify_ticket_remote_setup" as never, { _ticket_id: ticketId, _code: code } as never);
    if (e) toast.error(e.message);
    else if (!data) toast.error("That code isn't live. Check BM Remote Helper is open on the TV and try the code it shows now.");
    else { toast.success("Code sent — staff have been alerted"); setCode(""); }
    setBusy(false); void load();
  };
  return <section className="mx-auto w-full max-w-lg space-y-3 text-foreground">
    {state && !error && !closed && !live && !waiting && <form className="space-y-2 rounded-lg border border-primary/40 bg-card/90 p-4" onSubmit={(e) => { e.preventDefault(); void sendCode(); }}>
      <h3 className="font-semibold">Enter your TV code</h3>
      <p className="text-sm text-muted-foreground">Open BM Remote Helper on your TV and type the six-digit code it shows.</p>
      <div className="flex gap-2">
        <Input aria-label="Code shown on your TV" inputMode="numeric" value={code} onChange={(e) => setCode(normalizePairCode(e.target.value))} placeholder="123456" className="font-mono text-lg" />
        <Button type="submit" disabled={busy || code.length !== 6}>Send to staff</Button>
      </div>
    </form>}
    <div role="status" className={`space-y-3 rounded-lg border p-5 ${live ? "border-primary bg-primary/15" : waiting ? "border-primary/50 bg-primary/10" : "border-border bg-card/80"}`}>
      <h2 className="flex items-center gap-2 text-xl font-semibold">
        <span className={`size-2.5 shrink-0 rounded-full ${live ? "bg-primary animate-pulse" : waiting ? "bg-primary/70 animate-pulse" : "bg-muted-foreground"}`} aria-hidden="true" />
        <MonitorUp className="size-5 text-primary" />{title}
      </h2>
      {text && <p className={`text-sm ${error ? "text-destructive" : ""}`}>{text}</p>}
      {state && !error && !closed && !live && !waiting && <Button onClick={() => void navigate({ to: "/tickets", search: { id: ticketId, tab: "setup" } })}><Wrench className="mr-2 size-4" />Go to Remote setup</Button>}
    </div>
  </section>;
}

function TicketScreenShareChat({ ticketId, ownerId, closed }: { ticketId: string; ownerId: string; closed: boolean }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<{ id: string; sender_id: string; content: string; created_at: string }[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const staffNotify = useServerFn(notifyTicketReply);
  const customerNotify = useServerFn(notifyStaffOfCustomerReply);
  const load = useCallback(async () => {
    const { data } = await supabase.from("ticket_messages").select("id,sender_id,content,created_at").eq("ticket_id", ticketId).eq("is_internal", false).order("created_at", { ascending: false }).limit(100);
    setMessages((data ?? []).reverse());
  }, [ticketId]);
  useEffect(() => { void load(); const timer = window.setInterval(load, 2000); return () => window.clearInterval(timer); }, [load]);
  return <>
    <Button className="fixed bottom-5 right-5 z-40 shadow-lg" aria-expanded={open} onClick={() => setOpen(!open)}><MessageCircle className="mr-2 size-4" />Ticket chat</Button>
    {open && <section aria-label="Ticket chat" className="fixed bottom-20 right-3 z-40 flex h-[min(540px,70dvh)] w-[min(380px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-lg border border-border bg-card text-foreground shadow-xl">
      <header className="flex items-center justify-between border-b border-border px-4 py-2"><h2 className="text-sm font-semibold">Ticket chat</h2><Button variant="ghost" size="icon" aria-label="Close ticket chat" onClick={() => setOpen(false)}><X className="size-4" /></Button></header>
      <div className="min-h-0 flex-1 overflow-y-auto space-y-3 p-3">{messages.map((m) => <div key={m.id} className={`max-w-[90%] rounded-lg p-3 text-sm ${m.sender_id === user?.id ? "ml-auto bg-primary text-primary-foreground" : "bg-surface-2"}`}><p className="mb-1 text-xs font-semibold">{m.sender_id === ownerId ? "Customer" : "BM Support"}</p><p className="whitespace-pre-wrap break-words">{isTicketScreenShareInvite(m.content) ? "Screen share requested — open the Screen share tab to enter your TV code." : m.content}</p><time className="text-[10px] opacity-70">{new Date(m.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</time></div>)}</div>
      {closed ? <p className="border-t border-border p-3 text-sm">This ticket is closed.</p> : <form className="flex gap-2 border-t border-border p-2" onSubmit={async (e) => {
        e.preventDefault(); if (!user || !draft.trim() || busy) return; setBusy(true);
        try {
          const r = await supabase.from("ticket_messages").insert({ ticket_id: ticketId, sender_id: user.id, content: draft.trim(), is_internal: false }).select("id").single();
          if (r.error || !r.data) throw new Error(r.error?.message ?? "Could not send reply");
          setDraft(""); await load();
          const notify = user.id === ownerId ? customerNotify : staffNotify;
          await notify({ data: { ticketId, messageId: r.data.id } }).catch(() => null);
        } catch (e) { toast.error(e instanceof Error ? e.message : "Could not send reply"); }
        finally { setBusy(false); }
      }}><Input aria-label="Reply to ticket" value={draft} maxLength={2000} onChange={(e) => setDraft(e.target.value)} placeholder="Reply to ticket…" /><Button type="submit" size="icon" aria-label="Send ticket reply" disabled={busy || !draft.trim()}><Send className="size-4" /></Button></form>}
    </section>}
  </>;
}