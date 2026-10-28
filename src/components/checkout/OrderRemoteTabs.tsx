import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { BookOpen, Headset, Loader2, Tv } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { orderStaffHelpTicket } from "@/lib/order-remote-tabs";
import { useAuth } from "@/hooks/use-auth";
import { useBusinessOpen } from "@/hooks/use-business-open";
import { supabase } from "@/integrations/supabase/client";

/** Customer secure order: the order page itself, plus raising a ticket for remote installation help. */
export function OrderRemoteTabs({ orderRef, claimToken, manual = false, children }: { orderRef: string | null; claimToken?: string; manual?: boolean; children: ReactNode }) {
  return <>
    <div className="w-full px-3 pt-3">
      <RemoteHelpBar orderRef={orderRef} claimToken={claimToken} manual={manual} />
    </div>
    {children}
  </>;
}

function RemoteHelpBar({ orderRef, claimToken, manual }: { orderRef: string | null; claimToken?: string; manual: boolean }) {
  const open = useBusinessOpen();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [creating, setCreating] = useState(false);

  const createTicket = async () => {
    if (!user || creating || !open) return;
    setCreating(true);
    try {
      const content = `Hi,\n\nI'd like a member of staff to install the BM apps on my TV for me by screen share.\n\nMy order reference is ${orderRef ?? "(not supplied)"}. I'll complete the Remote setup in this ticket so you can connect.\n\nThank you!`;
      const { data: cat } = await supabase.from("ticket_categories").select("id").eq("slug", "general").maybeSingle();
      if (!cat) throw new Error("Could not open the ticket. Please try again.");
      const { data: t, error } = await supabase
        .from("tickets")
        .insert(orderStaffHelpTicket(user.id, cat.id, orderRef))
        .select("id")
        .single();
      if (error || !t) throw new Error(error?.message ?? "Could not open the ticket. Please try again.");
      const { error: msgErr } = await supabase.from("ticket_messages").insert({
        ticket_id: t.id, sender_id: user.id, content, is_internal: false,
      });
      if (msgErr) throw new Error(msgErr.message);
      // The ticket layout sends the staff alert only after remote setup is confirmed.
      toast.success("Let's set up your TV for staff help");
      await navigate({ to: "/tickets", search: { id: t.id, tab: "setup" } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open the ticket. Please try again.");
      setCreating(false);
    }
  };

  return <section className="flex flex-wrap items-center gap-3 border-y border-border bg-card/85 p-3 backdrop-blur-sm">
    <Tv className="size-5 shrink-0 text-primary" />
    <p className="min-w-0 flex-1 text-sm text-muted-foreground">
      <span className="font-semibold text-foreground">How would you like to install your apps?</span>{" "}
      Install them yourself with our guides, or set up your TV so staff can help by screen share.
    </p>
    <Button asChild size="sm" variant="outline">
      {manual && claimToken ? <Link to="/checkout-install/$token" params={{ token: claimToken }}><BookOpen className="size-4" />Self install</Link>
        : <Link to="/install-guides" search={{ tab: "guides", ...(claimToken ? { checkout: claimToken } : {}) }}><BookOpen className="size-4" />Self install</Link>}
    </Button>
    {open ? (
      <Button size="sm" onClick={createTicket} disabled={creating || !user}>
        {creating ? <Loader2 className="size-4 animate-spin" /> : <Headset className="size-4" />}
        {creating ? "Opening setup…" : "I need staff help"}
      </Button>
    ) : (
      <Button size="sm" disabled><Headset className="size-4" />I need staff help</Button>
    )}
    {!open && <p className="w-full text-xs text-muted-foreground">Support is only available during office hours — try again when we're open and this button will create the ticket for you.</p>}
    {open && !user && <p className="w-full text-xs text-muted-foreground">Sign in to your BM account first so we can open the ticket for you.</p>}
    {open && user && <p className="w-full text-xs text-muted-foreground">Staff help follows the ticket's Remote setup steps. Staff receive your request once your TV connection is confirmed.</p>}
  </section>;
}
