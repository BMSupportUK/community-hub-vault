import { createFileRoute, Link, Outlet, useMatches, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Loader2, MessageSquare, Ban, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useFanZoneMembership } from "@/hooks/use-fan-zone";
import { formatLastSeen } from "@/lib/relative-time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

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

type Member = {
  user_id: string;
  fan_alias: string | null;
  fan_avatar_url: string | null;
};

function MessagesLayout() {
  const matches = useMatches();
  const isNested = matches.some((m) => m.routeId.startsWith("/_authenticated/_approved/fanzone/messages/"));
  const { user, hasAny } = useAuth();
  const isStaff = hasAny(["admin", "boro_fan_zone_moderator"]);
  const info = useFanZoneMembership(user?.id ?? null);
  const canEnter = isStaff || info?.status === "approved";
  const navigate = useNavigate();

  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [search, setSearch] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    const { data } = await supabase.rpc("list_my_fan_dm_threads");
    setThreads((data ?? []) as Thread[]);
  };

  const loadMembers = async () => {
    if (!user) return;
    const { data, error } = await (supabase.rpc as unknown as (fn: string) => Promise<{ data: unknown; error: { message: string } | null }>)(
      "list_fan_zone_approved_members",
    );
    if (error) {
      toast.error("Couldn't load Fan Zone members", { description: error.message });
      return;
    }
    const arr = (data ?? []) as Member[];
    setMembers(arr.filter((m) => m.user_id !== user.id));
  };

  useEffect(() => {
    if (!canEnter || !user) return;
    void load();
    void loadMembers();
    const ch = supabase
      .channel(`fz-inbox-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "fan_zone_dm_messages" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "fan_zone_dm_threads" }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [canEnter, user?.id]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!searchBoxRef.current?.contains(e.target as Node)) setShowResults(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return members
      .filter((m) => (m.fan_alias ?? "").toLowerCase().includes(q))
      .slice(0, 8);
  }, [members, search]);

  const startChat = async (otherId: string) => {
    setStarting(otherId);
    const { data, error } = await supabase.rpc("get_or_create_fan_dm_thread", { _other: otherId });
    setStarting(null);
    if (error || !data) {
      toast.error(error?.message ?? "Could not start chat");
      return;
    }
    setSearch("");
    setShowResults(false);
    navigate({ to: "/fanzone/messages/$thread", params: { thread: data as string } });
  };

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
          <div ref={searchBoxRef} className="relative px-3 py-2 border-b border-border/60">
            <Search className="size-4 absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setShowResults(true); }}
              onFocus={() => { setShowResults(true); void loadMembers(); }}
              placeholder="Search a fan to start a chat…"
              className="h-9 pl-8 pr-8 bg-surface-2/60 border-border text-sm"
            />
            {search && (
              <button
                type="button"
                onClick={() => { setSearch(""); setShowResults(false); }}
                className="absolute right-5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="size-3.5" />
              </button>
            )}
            {showResults && search.trim() && (
              <div className="absolute z-20 left-3 right-3 mt-1 rounded-lg border border-border bg-surface-1 shadow-lg max-h-72 overflow-y-auto">
                {filteredMembers.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-muted-foreground text-center">No fans match.</p>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {filteredMembers.map((m) => {
                      const name = m.fan_alias || "Boro Fan";
                      return (
                        <li key={m.user_id}>
                          <button
                            type="button"
                            disabled={starting === m.user_id}
                            onClick={() => void startChat(m.user_id)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-2/60 disabled:opacity-60"
                          >
                            {m.fan_avatar_url ? (
                              <img src={m.fan_avatar_url} alt="" className="size-7 rounded-full object-cover" />
                            ) : (
                              <div className="size-7 rounded-full bg-gradient-to-br from-rose-600 to-amber-600 grid place-items-center text-white text-[10px] font-bold">
                                {name.slice(0, 1).toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-semibold truncate">{name}</div>
                            </div>
                            {starting === m.user_id && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
          {threads === null ? (
            <div className="grid place-items-center py-12 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
          ) : threads.length === 0 ? (
            <p className="p-6 text-xs text-muted-foreground text-center">No conversations yet. Search a fan above to start one.</p>
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