import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Tv } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { LinkPicker, RemoteSession, type Live, type LinkKind } from "@/components/tv/TvRemote";
import { canUseTvRemote } from "@/lib/tv-remote";

export const Route = createFileRoute("/_authenticated/_approved/tv-remote_/$sessionId")({
  component: TvRequestPage,
  head: () => ({
    meta: [
      { title: "TV help request | BM Support Staff" },
      { name: "description", content: "One customer's TV help request: their screen, chat and the staff dealing with it." },
      { property: "og:title", content: "TV help request | BM Support Staff" },
      { property: "og:description", content: "One customer's TV help request: their screen, chat and the staff dealing with it." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Row = { id: string; topic: string; device_name: string; status: string; staff_id: string | null; link_kind: string | null; link_id: string | null };

function TvRequestPage() {
  const { sessionId } = Route.useParams();
  const { roles, loading, user } = useAuth();
  const [row, setRow] = useState<Row | null | undefined>(undefined);
  const [live, setLive] = useState<Live | null>(null);
  const [link, setLink] = useState<{ kind: LinkKind; id: string; label: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const uid = user?.id;

  useEffect(() => {
    if (live || !uid) return;
    const load = async () => {
      const { data } = await supabase.from("tv_remote_sessions")
        .select("id, topic, device_name, status, staff_id, link_kind, link_id").eq("id", sessionId).maybeSingle();
      const r = (data as Row | null) ?? null;
      setRow(r);
      if (r && r.status !== "pending" && r.staff_id) {
        setLive({ id: r.id, topic: r.topic, device: r.device_name, host: r.staff_id === uid, linkKind: (r.link_kind as LinkKind) ?? null, linkId: r.link_id, hostId: r.staff_id });
      }
    };
    void load();
    const t = window.setInterval(load, 4000);
    return () => window.clearInterval(t);
  }, [sessionId, uid, live]);

  const answer = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("answer_tv_request", { _id: sessionId, _link_kind: link?.kind, _link_id: link?.id });
    setBusy(false);
    const r = Array.isArray(data) ? data[0] : null;
    if (error || !r) { toast.error(error?.message ?? "Could not answer this request"); return; }
    setLive({ id: r.id, topic: r.topic, device: r.device_name, host: true, linkKind: link?.kind ?? (row?.link_kind as LinkKind | null) ?? null, linkId: link?.id ?? row?.link_id ?? null, hostId: uid ?? null });
  };

  if (loading) return null;
  if (!canUseTvRemote(roles)) return <Navigate to="/portal" replace />;
  // A request raised from a sale's secure checkout belongs on that order's own
  // screen share page — send any generic session link there instead (but never
  // yank staff out of a session they have already answered here).
  if (!live && row?.link_kind === "order" && row.link_id) return <Navigate to="/screen-share/order/$orderId" params={{ orderId: row.link_id }} replace />;
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      <header className="flex items-center gap-3">
        <Link to="/tv-remote" className="rounded-full p-2 hover:bg-muted" aria-label="Back to TV Remote"><ArrowLeft className="h-5 w-5" /></Link>
        <Tv className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">{row?.device_name ?? "TV help request"}</h1>
          <p className="text-sm text-muted-foreground">Request {sessionId.slice(0, 8)}</p>
        </div>
      </header>
      {live ? <RemoteSession key={live.id} live={live} onEnd={() => { setLive(null); setRow(null); }} />
        : row === undefined ? null
        : !row || row.status !== "pending" ? <p className="rounded-2xl border bg-card p-6 text-muted-foreground">This request has ended or expired.</p>
        : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,28rem)_1fr]">
            <LinkPicker title="Link a sale or ticket (for the chat)" onPick={(kind, id, label) => setLink({ kind, id, label })} />
            <section className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
              <p className="text-sm">{link ? <>Chat: <strong>{link.label}</strong></> : row.link_kind === "order" ? "Requested from the customer's secure checkout — the sale chat will open." : "No chat linked yet — pick a sale or ticket, or answer without one."}</p>
              <Button className="w-full" disabled={busy} onClick={() => void answer()}>{busy ? "Answering…" : "Answer request"}</Button>
            </section>
          </div>
        )}
    </div>
  );
}
