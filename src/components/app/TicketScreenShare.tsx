import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { MessageCircle, MonitorUp, Send, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OrderScreenShareTab, useOrderScreenShares } from "@/components/tv/TvRemote";
import { notifyTicketReply, notifyStaffOfCustomerReply } from "@/lib/ticket-notify.functions";
import { canUseTvRemote, normalizePairCode, screenShareInProgress } from "@/lib/tv-remote";
import { isTicketScreenShareInvite, ticketScreenShareInvite, ticketShareConnected, ticketShareRequested, isCustomerTestTicket } from "@/lib/ticket-screen-share";

export function TicketScreenShareInvite({ ticketId }: { ticketId: string }) {
  const { roles, user } = useAuth();
  return canUseTvRemote(roles) && !isCustomerTestTicket(ticketId, user?.id)
    ? <p>TV screen requested — waiting for the customer to enter their TV code.</p>
    : <div className="space-y-2"><p>Staff have requested your TV screen.</p><Button size="sm" onClick={() => window.dispatchEvent(new CustomEvent("ticket-tv-code", { detail: ticketId }))}><MonitorUp className="mr-2 size-4" />Enter TV code</Button></div>;
}

export function TicketScreenShareLayout({ ticketId, ownerId, closed, tab, children }: { ticketId: string; ownerId: string; closed: boolean; tab?: "screen"; children: ReactNode }) {
  const { user, roles } = useAuth();
  const staff = canUseTvRemote(roles) && !isCustomerTestTicket(ticketId, user?.id);
  const navigate = useNavigate();
  const notify = useServerFn(notifyTicketReply);
  const [busy, setBusy] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const offered = useRef(false);
  const previousStatus = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const open = (event: Event) => {
      if (!staff && (event as CustomEvent<string>).detail === ticketId) setCodeOpen(true);
    };
    window.addEventListener("ticket-tv-code", open);
    return () => window.removeEventListener("ticket-tv-code", open);
  }, [ticketId, staff]);
  useEffect(() => {
    let stopped = false;
    const load = async () => {
      const r = await supabase.rpc("ticket_screen_share_state", { _ticket_id: ticketId });
      if (stopped || r.error) return;
      const state = r.data as { status: string | null; invited: boolean };
      const current = state.status;
      if (!staff && !closed && state.invited && !screenShareInProgress(current) && !offered.current && tab !== "screen") {
        offered.current = true;
        setCodeOpen(true);
      }
      if (screenShareInProgress(current)) setCodeOpen(false);
      if (staff && tab !== "screen" && ticketShareRequested(previousStatus.current, current)) {
        void navigate({ to: "/tickets", search: { id: ticketId, tab: "screen" } });
      }
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
    if (!user || busy) return;
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
    <Dialog open={!staff && codeOpen} onOpenChange={setCodeOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>Enter your TV code</DialogTitle><DialogDescription>BM Support has requested to see your TV screen.</DialogDescription></DialogHeader>
        <CustomerTicketScreenShare ticketId={ticketId} closed={closed} onConnected={() => setCodeOpen(false)} />
      </DialogContent>
    </Dialog>
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card p-2 text-foreground">
      <Tabs value={tab === "screen" ? "screen" : "ticket"} onValueChange={(value) => void navigate({ to: "/tickets", search: { id: ticketId, tab: value === "screen" ? "screen" : undefined } })}>
        <TabsList><TabsTrigger value="ticket"><MessageCircle className="mr-2 size-4" />Ticket</TabsTrigger><TabsTrigger value="screen"><MonitorUp className="mr-2 size-4" />Screen share</TabsTrigger></TabsList>
      </Tabs>
      {staff && !closed && <Button size="sm" className="ml-auto" disabled={busy} onClick={() => void request()}><MonitorUp className="mr-2 size-4" />{busy ? "Sending…" : "Request screen share"}</Button>}
    </div>
    <div className={tab === "screen" ? "hidden" : "flex min-h-0 flex-1 flex-col"}>{children}</div>
    <div className={tab === "screen" ? "min-h-0 flex-1 overflow-y-auto bg-background p-3 text-foreground sm:p-5" : "hidden"}>
      <TicketScreenShareWorkspace ticketId={ticketId} ownerId={ownerId} staff={staff} viewer={canUseTvRemote(roles)} closed={closed} visible={tab === "screen"} />
    </div>
  </div>;
}

export function TicketScreenShareWorkspace({ ticketId, ownerId, staff, viewer = staff, closed = false, visible = true }: { ticketId: string; ownerId: string; staff: boolean; viewer?: boolean; closed?: boolean; visible?: boolean }) {
  // On the owner's customer-view test ticket, staff still get the live viewer below the code box.
  const rows = useOrderScreenShares(viewer ? ticketId : "", "ticket");
  return <div className="space-y-4">
    {!staff && <CustomerTicketScreenShare ticketId={ticketId} closed={closed} />}
    {viewer && <OrderScreenShareTab orderId={ticketId} rows={rows} kind="ticket" />}
    {visible && <TicketScreenShareChat ticketId={ticketId} ownerId={ownerId} closed={closed} />}
  </div>;
}

function CustomerTicketScreenShare({ ticketId, closed = false, onConnected }: { ticketId: string; closed?: boolean; onConnected?: () => void }) {
  const navigate = useNavigate();
  const [state, setState] = useState<{ invited: boolean; status: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await supabase.rpc("ticket_screen_share_state", { _ticket_id: ticketId });
    if (r.error) { setError("Screen sharing is unavailable for this ticket."); return; }
    setError(null);
    setState(r.data as { invited: boolean; status: string | null });
  }, [ticketId]);
  useEffect(() => { void load(); const timer = window.setInterval(load, 2000); return () => window.clearInterval(timer); }, [load]);
  return <section className="mx-auto w-full max-w-lg space-y-4 text-foreground">
      <h2 className="flex items-center gap-2 text-xl font-semibold"><MonitorUp className="size-5 text-primary" />Share your TV screen</h2>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : !state ? <p>Checking screen share…</p> : screenShareInProgress(state.status) ? <p className="rounded-lg border border-primary/40 bg-primary/10 p-4 text-sm">{state.status === "pending" ? "Staff have been alerted. When they answer, press Allow and then Start on your TV." : "Staff are connected to your TV. You can return to your ticket while the screen share carries on."}</p> : closed ? <p>This ticket is closed.</p> : !state.invited ? <p className="text-sm text-muted-foreground">Waiting for staff to request your screen.</p> : <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setSubmitError(null);
        try {
          const r = await supabase.rpc("request_ticket_screen_share", { _ticket_id: ticketId, _code: code });
          if (r.error || !r.data) throw new Error(r.error?.message ?? "That code is wrong, expired or already connected. Check your TV.");
          setCode(""); await load();
          onConnected?.();
          void navigate({ to: "/tickets", search: { id: ticketId, tab: "screen" } });
        } catch (e) { setSubmitError(e instanceof Error ? e.message : "Could not connect your TV"); }
        finally { setBusy(false); }
      }}><p className="text-sm">Open <strong>BM Remote Helper</strong> on your TV and enter its six-digit code.</p><Input aria-label="Code on your TV" inputMode="numeric" autoFocus value={code} onChange={(e) => setCode(normalizePairCode(e.target.value))} placeholder="123456" className="h-12 text-center font-mono text-2xl" />{submitError && <p role="alert" className="text-sm text-destructive">{submitError}</p>}<Button disabled={busy || code.length !== 6} type="submit" className="w-full">{busy ? "Connecting…" : "Connect TV"}</Button></form>}
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