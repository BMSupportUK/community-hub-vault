import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { Tv } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { History, LinkPicker, LiveSessions } from "@/components/tv/TvRemote";
import { canSeeTvRemoteHistory, canUseTvRemote } from "@/lib/tv-remote";

export const Route = createFileRoute("/_authenticated/_approved/tv-remote")({
  component: TvRemotePage,
  head: () => ({
    meta: [
      { title: "TV Remote | BM Support Staff" },
      { name: "description", content: "View a customer's TV screen with staff during a BM Support help session." },
      { property: "og:title", content: "TV Remote | BM Support Staff" },
      { property: "og:description", content: "View a customer's TV screen with staff during a BM Support help session." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function TvRemotePage() {
  const { roles, loading } = useAuth();
  const navigate = useNavigate();
  if (loading) return null;
  if (!canUseTvRemote(roles)) return <Navigate to="/portal" replace />;
  const go = (kind: "order" | "ticket", id: string) =>
    navigate({ to: "/tv-remote/$kind/$id", params: { kind: kind === "order" ? "sale" : "ticket", id } });
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      <header className="flex items-center gap-3">
        <Tv className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">TV Remote</h1>
          <p className="text-sm text-muted-foreground">Pick the sale or ticket — each one opens its own TV help page with its chat.</p>
        </div>
      </header>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,28rem)_1fr]">
        <LinkPicker onPick={go} />
        <LiveSessions onJoin={(l) => l.linkKind && l.linkId && go(l.linkKind, l.linkId)} />
      </div>
      {canSeeTvRemoteHistory(roles) && <History />}
    </div>
  );
}
