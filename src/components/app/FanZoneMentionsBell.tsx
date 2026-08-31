import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Check, CornerUpRight } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatDistanceToNow } from "date-fns";

type MentionRow = {
  id: string;
  title: string;
  body: string | null;
  link_path: string | null;
  read_at: string | null;
  created_at: string;
};

const isForumMention = (r: { link_path?: string | null }) =>
  !!r.link_path && r.link_path.startsWith("/forum");

/** Live @mention notifications for Boro Fan Zone forum posts. */
export function FanZoneMentionsBell() {
  const { user, isPending } = useAuth();
  const navigate = useNavigate();
  const instance = useRef(Math.random().toString(36).slice(2)).current;
  const [items, setItems] = useState<MentionRow[]>([]);
  const [open, setOpen] = useState(false);
  const [pulse, setPulse] = useState(false);

  const load = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from("user_notifications")
      .select("id, title, body, link_path, read_at, created_at")
      .eq("user_id", uid)
      .eq("kind", "mention")
      .order("created_at", { ascending: false })
      .limit(30);
    setItems(((data ?? []) as MentionRow[]).filter(isForumMention));
  }, []);

  useEffect(() => {
    if (!user || isPending) return;
    void load(user.id);
    const ch = supabase
      .channel(`fanzone-mentions-${user.id}-${instance}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = (payload.new ?? {}) as { kind?: string; link_path?: string | null };
          if (payload.eventType === "INSERT" && row.kind === "mention" && isForumMention(row)) {
            setPulse(true);
            setTimeout(() => setPulse(false), 2500);
          }
          void load(user.id);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, isPending, instance, load]);

  if (!user || isPending) return null;

  const unread = items.filter((m) => !m.read_at).length;

  const openItem = async (m: MentionRow) => {
    setItems((prev) => prev.filter((x) => x.id !== m.id));
    setOpen(false);
    await supabase.from("user_notifications").delete().eq("id", m.id);
    if (m.link_path) navigate({ to: m.link_path as any });
  };

  const clearAll = async () => {
    const ids = items.map((m) => m.id);
    setItems([]);
    if (ids.length) await supabase.from("user_notifications").delete().in("id", ids);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) void load(user.id); }}>
      <DialogTrigger asChild>
        <button
          type="button"
          title={unread > 0 ? `${unread} new mention${unread === 1 ? "" : "s"}` : "Mentions"}
          className={`relative inline-flex h-8 items-center justify-center rounded-md border px-2.5 backdrop-blur transition-all ${
            unread > 0
              ? "border-amber-300/70 bg-amber-400/25 text-white shadow-[0_0_18px_rgba(251,191,36,0.55)] hover:bg-amber-400/40"
              : "border-white/30 bg-black/40 text-white hover:bg-black/60"
          } ${pulse ? "animate-pulse ring-2 ring-amber-300/80" : ""}`}
        >
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#E11B22] text-white text-[10px] font-bold grid place-items-center ring-2 ring-white/70">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </DialogTrigger>
      <DialogContent className="w-[min(30rem,calc(100vw-2rem))] p-0 overflow-hidden gap-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <DialogTitle className="text-sm font-semibold">Forum mentions</DialogTitle>
          {items.length > 0 && (
            <button onClick={clearAll} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mr-6">
              <Check className="size-3" /> Clear all
            </button>
          )}
        </div>
        <div className="max-h-[min(70vh,32rem)] overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-3 py-6 text-sm text-muted-foreground text-center">No mentions yet</div>
          ) : (
            items.map((m) => (
              <div
                key={m.id}
                className={`px-3 py-2 border-b border-border last:border-b-0 ${!m.read_at ? "bg-[#E11B22]/5" : ""}`}
              >
                <div className="flex items-start gap-2">
                  {!m.read_at && <span className="mt-1.5 size-2 rounded-full bg-[#E11B22] shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{m.title}</div>
                    {m.body && <div className="text-xs text-muted-foreground line-clamp-2">{m.body}</div>}
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                    </div>
                  </div>
                </div>
                {m.link_path && (
                  <button
                    type="button"
                    onClick={() => void openItem(m)}
                    className="mt-2 inline-flex items-center gap-1 rounded-md bg-[#E11B22]/15 px-2 py-1 text-xs font-medium text-[#E11B22] hover:bg-[#E11B22]/25"
                  >
                    <CornerUpRight className="size-3" /> Jump to mention
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
