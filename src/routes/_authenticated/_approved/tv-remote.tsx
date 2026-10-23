import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { Tv } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { HelpRequests, History, LiveSessions } from "@/components/tv/TvRemote";
import { canOpenTvRemoteOverview, screenShareDestination } from "@/lib/tv-remote";

export const Route = createFileRoute("/_authenticated/_approved/tv-remote")({
  component: TvRemotePage,
  head: () => ({
    meta: [
      { title: "TV Remote | BM Support Staff" },
      { name: "description", content: "Answer customers' TV help requests and view their screen with other staff." },
      { property: "og:title", content: "TV Remote | BM Support Staff" },
      { property: "og:description", content: "Answer customers' TV help requests and view their screen with other staff." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function TvRemotePage() {
  const { roles, loading } = useAuth();
  const navigate = useNavigate();
  if (loading) return null;
  if (!canOpenTvRemoteOverview(roles)) return <Navigate to="/home" replace />;
  const open = (sessionId: string) => navigate({ to: "/tv-remote/$sessionId", params: { sessionId } });
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      <header className="flex items-center gap-3">
        <Tv className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">TV Remote</h1>
          <p className="text-sm text-muted-foreground">Each customer request gets its own page. Answer one to open it.</p>
        </div>
      </header>
      <div className="grid gap-6 lg:grid-cols-2">
        <HelpRequests onOpen={open} />
        <LiveSessions onJoin={(l) => {
          const destination = screenShareDestination(l.linkKind, l.linkId);
          if (destination) void navigate(destination);
          else void open(l.id);
        }} />
      </div>
      <History />
    </div>
  );
}
