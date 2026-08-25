import { useEffect, useRef, useState } from "react";
import { AtSign, Check, CornerUpRight } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDistanceToNow } from "date-fns";

type MentionRow = {
  id: string;
  title: string;
  body: string | null;
  link_path: string | null;
  source_id: string | null;
  read_at: string | null;
  created_at: string;
};

/** Navigation target for a mention. Preserves any existing query params and
 *  adds `msg=<source_id>` so the talk-channel route can scroll/flash the message. */
function mentionNav(m: MentionRow): { to: string; search?: Record<string, string> } | null {
  if (!m.link_path) return null;
  const [base, qs] = m.link_path.split("?");
  const search: Record<string, string> = {};
  if (qs) {
    const params = new URLSearchParams(qs);
    params.forEach((value, key) => {
      search[key] = value;
    });
  }
  if (m.source_id) search.msg = m.source_id;
  return { to: base, search: Object.keys(search).length ? search : undefined };
}

/**
 * Live counter of unread @mentions for the current user.
 * Subscribes to realtime inserts on user_notifications and toasts/updates instantly.
 */
export function MentionsBadge() {
  const { user, isPending } = useAuth();
  const navigate = useNavigate();
  const channelInstanceId = useRef(Math.random().toString(36).slice(2)).current;
  const [pulse, setPulse] = useState(false);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MentionRow[]>([]);

  const loadList = async (uid: string) => {
    const { data } = await supabase
      .from("user_notifications")
      .select("id, title, body, link_path, source_id, read_at, created_at")
      .eq("user_id", uid)
      .eq("kind", "mention")
      .order("created_at", { ascending: false })
      .limit(20);
    setItems((data ?? []) as MentionRow[]);
  };

  useEffect(() => {
    if (!user || isPending) return;
    void loadList(user.id);
    const ch = supabase
      .channel(`mentions-badge-${user.id}-${channelInstanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_notifications" },
        (payload) => {
          const r = (payload.new ?? {}) as { user_id?: string; kind?: string };
          if (payload.eventType === "INSERT") {
            if (r.user_id !== user.id || r.kind !== "mention") return;
            setPulse(true);
            setTimeout(() => setPulse(false), 1500);
          }
          void loadList(user.id);
          // Toast is fired by NotificationBell to avoid duplicate toasts.
        },
      )
      .subscribe();
    const onFocus = () => void loadList(user.id);
    window.addEventListener("focus", onFocus);
    const poll = window.setInterval(onFocus, 60_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(poll);
      supabase.removeChannel(ch);
    };
  }, [user, isPending, channelInstanceId, navigate]);

  if (!user || isPending) return null;

  // Count is derived from the list so the badge can never disagree with it.
  const count = items.filter((m) => !m.read_at).length;

  const markAllRead = async () => {
    await supabase
      .from("user_notifications")
      .delete()
      .eq("user_id", user.id)
      .eq("kind", "mention");
    setItems([]);
  };

  const openItem = async (m: MentionRow) => {
    await supabase.from("user_notifications").delete().eq("id", m.id);
    setItems((prev) => prev.filter((x) => x.id !== m.id));
    setOpen(false);
    const nav = mentionNav(m);
    if (nav) navigate({ to: nav.to as any, search: nav.search });
  };


  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) loadList(user.id); }}>
      <PopoverTrigger asChild>
        <button
          title={count > 0 ? `${count} unread mention${count === 1 ? "" : "s"}` : "Mentions"}
          className={`relative size-9 rounded-xl flex items-center justify-center transition-all ${
            count > 0
              ? "bg-gradient-to-br from-indigo-500/30 to-fuchsia-500/30 text-indigo-200 hover:from-indigo-500/50 hover:to-fuchsia-500/50"
              : "bg-surface-2 text-muted-foreground hover:bg-primary hover:text-primary-foreground hover:rounded-xl"
          } ${pulse ? "ring-2 ring-indigo-400/70 animate-pulse" : ""}`}
        >
          <AtSign className="size-4" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-500 text-white text-[9px] font-bold grid place-items-center ring-2 ring-rail">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="text-sm font-semibold">Mentions</div>
          {count > 0 && (
            <button onClick={markAllRead} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              <Check className="size-3" /> Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-3 py-6 text-sm text-muted-foreground text-center">No mentions yet</div>
          ) : (
            items.map((m) => (
              <div
                key={m.id}
                className={`px-3 py-2 border-b last:border-b-0 ${!m.read_at ? "bg-indigo-500/5" : ""}`}
              >
                <div className="flex items-start gap-2">
                  {!m.read_at && <span className="mt-1.5 size-2 rounded-full bg-indigo-500 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{m.title}</div>
                    {m.body && <div className="text-xs text-muted-foreground line-clamp-2">{m.body}</div>}
                    <div className="text-[10px] text-muted-foreground mt-0.5">{formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}</div>
                  </div>
                </div>
                {mentionHref(m) && (
                  <button
                    type="button"
                    onClick={() => openItem(m)}
                    className="mt-2 inline-flex items-center gap-1 rounded-md bg-indigo-500/15 px-2 py-1 text-xs font-medium text-indigo-300 hover:bg-indigo-500/30"
                  >
                    <CornerUpRight className="size-3" /> Jump to mention
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
