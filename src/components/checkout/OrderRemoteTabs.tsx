import { useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Headset, Loader2, Tv } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sendNewTicketPush } from "@/lib/push.functions";
import { useAuth } from "@/hooks/use-auth";
import { useBusinessOpen } from "@/hooks/use-business-open";
import { supabase } from "@/integrations/supabase/client";

/** Customer secure order: the order page itself, plus raising a ticket for remote installation help. */
export function OrderRemoteTabs({ orderRef, children }: { orderRef: string | null; children: ReactNode }) {
  return <>
    <div className="w-full px-3 pt-3">
      <RemoteHelpBar orderRef={orderRef} />
    </div>
    {children}
  </>;
}

const HELP_SUBJECT_BASE = "Remote installation help";

function RemoteHelpBar({ orderRef }: { orderRef: string | null }) {
  const open = useBusinessOpen();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [creating, setCreating] = useState(false);
  const notifyNewTicket = useServerFn(sendNewTicketPush);

  const createTicket = async () => {
    if (!user || creating) return;
    setCreating(true);
    try {
      const subject = orderRef ? `${HELP_SUBJECT_BASE} — order ${orderRef}` : HELP_SUBJECT_BASE;
      const content = `Hi,\n\nI'd like a member of staff to install the BM apps on my TV for me by screen share.\n\nMy order reference is ${orderRef ?? "(not supplied)"}. I'll complete the Remote setup in this ticket so you can connect.\n\nThank you!`;
      const { data: cat } = await supabase.from("ticket_categories").select("id").eq("slug", "general").maybeSingle();
      if (!cat) throw new Error("Could not open the ticket. Please try again.");
      const { data: t, error } = await supabase
        .from("tickets")
        .insert({ user_id: user.id, subject, category_id: cat.id, priority: "normal" })
        .select("id")
        .single();
      if (error || !t) throw new Error(error?.message ?? "Could not open the ticket. Please try again.");
      const { error: msgErr } = await supabase.from("ticket_messages").insert({
        ticket_id: t.id, sender_id: user.id, content, is_internal: false,
      });
      if (msgErr) throw new Error(msgErr.message);
      // Fire-and-forget staff push, same as the New ticket form.
      void notifyNewTicket({ data: { ticketId: t.id, subject, categorySlug: "general" } })
        .catch((e) => console.error("[secure-order] new ticket push failed", e));
      toast.success("Ticket opened");
      await navigate({ to: "/tickets", search: { id: t.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open the ticket. Please try again.");
      setCreating(false);
    }
  };

  return <section className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/85 p-3 backdrop-blur-sm">
    <Tv className="size-5 shrink-0 text-primary" />
    <p className="min-w-0 flex-1 text-sm text-muted-foreground">
      <span className="font-semibold text-foreground">Need us to install the apps for you?</span>{" "}
      Raise a ticket and a member of staff will connect to your TV by screen share.
    </p>
    {open ? (
      <Button size="sm" onClick={createTicket} disabled={creating || !user}>
        {creating ? <Loader2 className="size-4 animate-spin" /> : <Headset className="size-4" />}
        {creating ? "Opening ticket…" : "Raise a ticket"}
      </Button>
    ) : (
      <Button size="sm" disabled><Headset className="size-4" />Raise a ticket</Button>
    )}
    {!open && <p className="w-full text-xs text-muted-foreground">Support is only available during office hours — try again when we're open and this button will create the ticket for you.</p>}
    {open && !user && <p className="w-full text-xs text-muted-foreground">Sign in to your BM account first so we can open the ticket for you.</p>}
  </section>;
}
