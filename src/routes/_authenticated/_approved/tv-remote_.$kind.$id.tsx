import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Tv } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { LiveSessions, PairForm, RemoteSession, type Live } from "@/components/tv/TvRemote";
import { canUseTvRemote } from "@/lib/tv-remote";

export const Route = createFileRoute("/_authenticated/_approved/tv-remote_/$kind/$id")({
  component: TvHelpPage,
  head: () => ({
    meta: [
      { title: "TV help session | BM Support Staff" },
      { name: "description", content: "TV screen and customer chat for one sale or support ticket." },
      { property: "og:title", content: "TV help session | BM Support Staff" },
      { property: "og:description", content: "TV screen and customer chat for one sale or support ticket." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function TvHelpPage() {
  const { kind: rawKind, id } = Route.useParams();
  const kind = rawKind === "sale" ? "order" : "ticket";
  const { roles, loading } = useAuth();
  const [live, setLive] = useState<Live | null>(null);
  const [title, setTitle] = useState("");
  useEffect(() => {
    void (async () => {
      if (kind === "order") {
        const { data } = await supabase.from("orders").select("order_ref, existing_username").eq("id", id).maybeSingle();
        setTitle(data ? `Sale ${data.order_ref ?? ""}${data.existing_username ? ` · ${data.existing_username}` : ""}` : "Sale");
      } else {
        const { data } = await supabase.from("tickets").select("subject").eq("id", id).maybeSingle();
        setTitle(data?.subject ? `Ticket · ${data.subject}` : "Ticket");
      }
    })();
  }, [kind, id]);
  if (loading) return null;
  if (!canUseTvRemote(roles)) return <Navigate to="/portal" replace />;
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      <header className="flex items-center gap-3">
        <Link to="/tv-remote" className="rounded-full p-2 hover:bg-muted" aria-label="Back to TV Remote"><ArrowLeft className="h-5 w-5" /></Link>
        <Tv className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">{title || "TV help"}</h1>
          <p className="text-sm text-muted-foreground">Ask the customer to open BM Remote Helper on their TV and read you the 6-digit code.</p>
        </div>
      </header>
      {live ? <RemoteSession key={live.id} live={live} onEnd={() => setLive(null)} /> : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,28rem)_1fr]">
          <PairForm kind={kind} linkId={id} onPaired={setLive} />
          <LiveSessions kind={kind} linkId={id} onJoin={setLive} />
        </div>
      )}
    </div>
  );
}
