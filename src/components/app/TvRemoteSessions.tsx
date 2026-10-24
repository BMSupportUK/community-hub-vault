import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Tv } from "lucide-react";
import { Button } from "@/components/ui/button";
import { History, LiveSessions } from "@/components/tv/TvRemote";
import { useAuth } from "@/hooks/use-auth";
import { canOpenTvRemoteOverview, screenShareDestination } from "@/lib/tv-remote";

export function TvRemoteSessions({ onBack }: { onBack: () => void }) {
  const { roles } = useAuth();
  const navigate = useNavigate();
  if (!canOpenTvRemoteOverview(roles)) return null;

  return (
    <div className="min-w-0 space-y-6">
      <header className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack} aria-label="Back to Owner tools" title="Back to Owner tools">
          <ArrowLeft className="size-4" />
        </Button>
        <Tv className="size-6 text-primary" />
        <h2 className="font-display text-2xl font-bold">TV Remote sessions</h2>
      </header>
      <LiveSessions onJoin={(session) => {
        const destination = screenShareDestination(session.linkKind, session.linkId);
        if (destination) void navigate(destination);
        else void navigate({ to: "/tv-remote/$sessionId", params: { sessionId: session.id } });
      }} />
      <History />
    </div>
  );
}