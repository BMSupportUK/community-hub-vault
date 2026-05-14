import { useEffect, useState } from "react";
import { AtSign } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

/**
 * Live counter of unread @mentions for the current user.
 * Subscribes to realtime inserts on user_notifications and toasts/updates instantly.
 */
export function MentionsBadge() {
  const { user, isPending } = useAuth();
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  const [pulse, setPulse] = useState(false);

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
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "user_notifications", filter: `user_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, [user, isPending]);

  if (!user || isPending) return null;

  return (
    <button
      onClick={async () => {
        const { data } = await supabase
          .from("user_notifications")
          .select("id, link_path")
          .eq("user_id", user.id)
          .eq("kind", "mention")
          .is("read_at", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data?.link_path) {
          await supabase.from("user_notifications").update({ read_at: new Date().toISOString() }).eq("id", data.id);
          navigate({ to: data.link_path } as never);
        } else {
          toast("No new mentions");
        }
      }}
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
  );
}
