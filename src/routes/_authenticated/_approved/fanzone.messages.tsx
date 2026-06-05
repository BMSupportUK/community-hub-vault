import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, MessageSquare, Ban } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useFanZoneMembership } from "@/hooks/use-fan-zone";
import { formatLastSeen } from "@/lib/relative-time";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/_approved/fanzone/messages")({
  component: MessagesLayout,
});

type Thread = {
  thread_id: string;
  other_user_id: string;
  other_alias: string;
  other_avatar: string;
  last_message_at: string | null;
  last_body: string | null;
  last_sender_id: string | null;
  unread: boolean;
};

function MessagesLayout() {
  const matches = useMatches();
  const isNested = matches.some((m) => m.routeId.startsWith("/_authenticated/_approved/fanzone/messages/"));
  const { user, hasAny } = useAuth();
  const isStaff = hasAny(["admin", "boro_fan_zone_moderator"]);
  const info = useFanZoneMembership(user?.id ?? null);
  const canEnter = isStaff || info?.status === "approved";

  const [threads, setThreads] = useState<Thread[] | null>(null);

  const load = async () => {
    const { data } = await supabase.rpc("list_my_fan_dm_threads");
    setThreads((data ?? []) as Thread[]);
  };
  useEffect(() => {
    if (!canEnter || !user) return;
    void load();
    const ch = supabase
      .channel(`fz-inbox-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "fan_zone_dm_messages" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "fan_zone_dm_threads" }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [canEnter, user?.id]);

  if (!canEnter) {
    return <div className="p-6 text-sm text-center">Boro Fan Zone members only.</div>;
  }

  return (
    <div className="boro-theme max-w-5xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/forum"><ArrowLeft className="size-4 mr-1" />Forum</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/fanzone/blocks"><Ban className="size-4 mr-1" />Ignore list</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-[#E11B22]/30 bg-surface-1/85 backdrop-blur-sm shadow-soft overflow-hidden">
          <div className="px-4 py-3 border-b border-border/60 flex items-center gap-2">
            <MessageSquare className="size-4 text-[#E11B22]" />
            <h2 className="font-display font-bold text-sm">Fan zone inbox</h2>
          </div>
          {threads === null ? (
            <div className="grid place-items-center py-12 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
          ) : threads.length === 0 ? (
            <p className="p-6 text-xs text-muted-foreground text-center">No conversations yet. Visit a fan's profile to start one.</p>
          ) : (
            <ul className="divide-y divide-border/60 max-h-[70vh] overflow-y-auto">
              {threads.map((t) => (
                <li key={t.thread_id}>
                  <Link
                    to="/fanzone/messages/$thread"
                    params={{ thread: t.thread_id }}
                    activeProps={{ className: "bg-[#E11B22]/10" }}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/60 transition-colors"
                  >
                    <img src={t.other_avatar} alt="" className="size-10 rounded-full object-cover ring-2 ring-white/10 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm font-semibold truncate ${t.unread ? "text-foreground" : ""}`}>{t.other_alias}</span>
                        {t.last_message_at && <span className="text-[10px] text-muted-foreground shrink-0">{formatLastSeen(t.last_message_at)}</span>}
                      </div>
                      <p className={`text-xs truncate ${t.unread ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                        {t.last_body ?? "No messages yet"}
                      </p>
                    </div>
                    {t.unread && <span className="size-2 rounded-full bg-[#E11B22] shrink-0" />}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="rounded-2xl border border-border bg-surface-1/85 backdrop-blur-sm shadow-soft min-h-[60vh] overflow-hidden">
          {isNested ? (
            <Outlet />
          ) : (
            <div className="grid place-items-center h-full p-10 text-center text-muted-foreground text-sm">
              Select a conversation, or open a fan's profile to start one.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}