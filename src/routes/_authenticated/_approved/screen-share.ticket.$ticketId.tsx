import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowLeft, MonitorUp } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { TicketScreenShareWorkspace, ScreenShareOfficeBackdrop } from "@/components/app/TicketScreenShare";
import { supabase } from "@/integrations/supabase/client";
import { canUseTvRemote } from "@/lib/tv-remote";

export const Route = createFileRoute("/_authenticated/_approved/screen-share/ticket/$ticketId")({
  component: TicketScreenSharePage,
  head: () => ({ meta: [
    { title: "Ticket screen share | BM Support Staff" },
    { name: "description", content: "Screen sharing and customer chat for one support ticket." },
    { property: "og:title", content: "Ticket screen share | BM Support Staff" },
    { property: "og:description", content: "Screen sharing and customer chat for one support ticket." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
});

function TicketScreenSharePage() {
  const { ticketId } = Route.useParams();
  const { roles, loading } = useAuth();
  const allowed = canUseTvRemote(roles);
  const [ticket, setTicket] = useState<{ user_id: string; subject: string } | null>(null);
  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    void supabase.from("tickets").select("user_id,subject").eq("id", ticketId).maybeSingle().then(({ data }) => {
      if (!cancelled) setTicket(data);
    });
    return () => { cancelled = true; };
  }, [ticketId, allowed]);
  if (loading) return null;
  if (!allowed) return <Navigate to="/home" replace />;
  return (
    <div className="relative isolate mx-auto w-full min-h-full max-w-7xl space-y-4 p-4">
      <ScreenShareOfficeBackdrop />
      <header className="relative flex flex-wrap items-center gap-3">
        <Button asChild variant="outline" size="sm"><Link to="/tickets" search={{ id: ticketId }}><ArrowLeft className="mr-1 size-4" />Back to ticket</Link></Button>
        <h1 className="flex items-center gap-2 text-xl font-bold"><MonitorUp className="size-5 text-primary" />Screen share · {ticket?.subject ?? "Support ticket"}</h1>
      </header>
      {ticket && <div className="relative"><TicketScreenShareWorkspace key={ticketId} ticketId={ticketId} ownerId={ticket.user_id} staff /></div>}
    </div>
  );
}