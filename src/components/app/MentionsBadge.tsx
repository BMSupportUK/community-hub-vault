import { useEffect, useState } from "react";
import { AtSign, Check } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDistanceToNow } from "date-fns";

type MentionRow = {
  id: string;
  title: string;
  body: string | null;
  link_path: string | null;
  read_at: string | null;
  created_at: string;
};

/**
 * Live counter of unread @mentions for the current user.
 * Subscribes to realtime inserts on user_notifications and toasts/updates instantly.
 */
export function MentionsBadge() {
  const { user, isPending } = useAuth();
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  const [pulse, setPulse] = useState(false);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MentionRow[]>([]);

  const loadList = async (uid: string) => {
    const { data } = await supabase
      .from("user_notifications")
      .select("id, title, body, link_path, read_at, created_at")
      .eq("user_id", uid)
      .eq("kind", "mention")
      .order("created_at", { ascending: false })
      .limit(20);
    setItems((data ?? []) as MentionRow[]);
  };

  useEffect(() => {
    if (!user || isPending) return;
    let active = true;
    const load = async () => {
      const { count: c } = await supabase
        .from("user_notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("kind", "mention")
        .is("read_at", null);
      if (active) setCount(c ?? 0);
    };
    load();
    loadList(user.id);
    const ch = supabase
      .channel(`mentions-badge-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "user_notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const r = payload.new as { kind: string; title: string; body?: string | null; link_path?: string | null };
          if (r.kind !== "mention") return;
          setCount((n) => n + 1);
          setPulse(true);
          setTimeout(() => setPulse(false), 1500);
          loadList(user.id);
          toast(r.title, {
            description: r.body ?? undefined,
            action: r.link_path
              ? { label: "Open", onClick: () => navigate({ to: r.link_path! } as never) }
              : undefined,
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "user_notifications", filter: `user_id=eq.${user.id}` },
        () => { load(); loadList(user.id); },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "user_notifications", filter: `user_id=eq.${user.id}` },
        () => { load(); loadList(user.id); },
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, [user, isPending]);

  if (!user || isPending) return null;

  const markAllRead = async () => {
    await supabase
      .from("user_notifications")
      .delete()
      .eq("user_id", user.id)
      .eq("kind", "mention");
    loadList(user.id);
    setCount(0);
  };

  const openItem = async (m: MentionRow) => {
    await supabase.from("user_notifications").delete().eq("id", m.id);
    setItems((prev) => prev.filter((x) => x.id !== m.id));
    if (!m.read_at) setCount((n) => Math.max(0, n - 1));
    setOpen(false);
    if (m.link_path) navigate({ to: m.link_path } as never);
  };

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) loadList(user.id); }}>
      <PopoverTrigger asChild>
        <button
          title={count > 0 ? `${count} unread mention${count === 1 ? "" : "s"}` : "Mentions"}
          className={`relative size-12 rounded-2xl flex items-center justify-center transition-all ${
            count > 0
              ? "bg-gradient-to-br from-indigo-500/30 to-fuchsia-500/30 text-indigo-200 hover:from-indigo-500/50 hover:to-fuchsia-500/50"
              : "bg-surface-2 text-muted-foreground hover:bg-primary hover:text-primary-foreground hover:rounded-xl"
          } ${pulse ? "ring-2 ring-indigo-400/70 animate-pulse" : ""}`}
        >
          <AtSign className="size-5" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-indigo-500 text-white text-[10px] font-bold grid place-items-center ring-2 ring-rail">
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
              <button
                key={m.id}
                onClick={() => openItem(m)}
                className={`w-full text-left px-3 py-2 border-b last:border-b-0 hover:bg-muted/50 ${!m.read_at ? "bg-indigo-500/5" : ""}`}
              >
                <div className="flex items-start gap-2">
                  {!m.read_at && <span className="mt-1.5 size-2 rounded-full bg-indigo-500 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{m.title}</div>
                    {m.body && <div className="text-xs text-muted-foreground line-clamp-2">{m.body}</div>}
                    <div className="text-[10px] text-muted-foreground mt-0.5">{formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}</div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
