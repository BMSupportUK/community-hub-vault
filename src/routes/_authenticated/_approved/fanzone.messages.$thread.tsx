import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2, Send, User2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatLastSeen } from "@/lib/relative-time";
import { toast } from "sonner";
import { ReportButton } from "@/components/app/ReportButton";
import { censorText, useProfanityWords } from "@/lib/profanity";

export const Route = createFileRoute("/_authenticated/_approved/fanzone/messages/$thread")({
  component: ThreadPage,
});

type Msg = { id: string; sender_id: string; body: string; created_at: string };
type ThreadInfo = { user_low: string; user_high: string };
type Alias = { user_id: string; fan_alias: string; fan_avatar_url: string };
type Viewer = { user_id: string; alias: string; avatar: string };

function ThreadPage() {
  const { thread } = Route.useParams();
  const { user } = useAuth();
  const [info, setInfo] = useState<ThreadInfo | null>(null);
  const [aliases, setAliases] = useState<Record<string, Alias>>({});
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  const otherId = info && user ? (info.user_low === user.id ? info.user_high : info.user_low) : null;

  const load = async () => {
    const { data: t } = await supabase
      .from("fan_zone_dm_threads")
      .select("user_low, user_high")
      .eq("id", thread)
      .maybeSingle();
    if (t) setInfo(t as ThreadInfo);
    const { data: m } = await supabase
      .from("fan_zone_dm_messages")
      .select("id, sender_id, body, created_at")
      .eq("thread_id", thread)
      .order("created_at", { ascending: true })
      .limit(500);
    setMsgs((m ?? []) as Msg[]);
    if (t && user) {
      const ids = [(t as ThreadInfo).user_low, (t as ThreadInfo).user_high];
      const { data: al } = await supabase.rpc("fan_zone_aliases", { _ids: ids });
      const map: Record<string, Alias> = {};
      (al ?? []).forEach((a: Alias) => { map[a.user_id] = a; });
      setAliases(map);
    }
    await supabase.rpc("mark_fan_dm_thread_read", { _thread: thread });
  };

  useEffect(() => {
    void load();
    const ch = supabase
      .channel(`fz-dm-${thread}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "fan_zone_dm_messages", filter: `thread_id=eq.${thread}` },
        (payload) => {
          setMsgs((cur) => [...(cur ?? []), payload.new as Msg]);
          void supabase.rpc("mark_fan_dm_thread_read", { _thread: thread });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread]);

  // Realtime presence: who is currently viewing this thread
  useEffect(() => {
    if (!user) return;
    const myAlias = aliases[user.id];
    const presence = supabase.channel(`fz-dm-presence-${thread}`, {
      config: { presence: { key: user.id } },
    });
    const sync = () => {
      const state = presence.presenceState() as Record<string, Array<{ user_id: string; alias: string; avatar: string }>>;
      const seen = new Set<string>();
      const list: Viewer[] = [];
      Object.values(state).forEach((metas) => {
        metas.forEach((m) => {
          if (!m?.user_id || seen.has(m.user_id)) return;
          seen.add(m.user_id);
          list.push({ user_id: m.user_id, alias: m.alias ?? "Boro Fan", avatar: m.avatar ?? "" });
        });
      });
      setViewers(list);
    };
    presence
      .on("presence", { event: "sync" }, sync)
      .on("presence", { event: "join" }, sync)
      .on("presence", { event: "leave" }, sync)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presence.track({
            user_id: user.id,
            alias: myAlias?.fan_alias ?? "Boro Fan",
            avatar: myAlias?.fan_avatar_url ?? "",
          });
        }
      });
    return () => { supabase.removeChannel(presence); };
  }, [thread, user?.id, aliases]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs?.length]);

  const send = async () => {
    const text = body.trim();
    if (!text || !user) return;
    setSending(true);
    const { error } = await supabase
      .from("fan_zone_dm_messages")
      .insert({ thread_id: thread, sender_id: user.id, body: text.slice(0, 4000) });
    setSending(false);
    if (error) return toast.error("Couldn't send", { description: error.message });
    setBody("");
  };

  const other = otherId ? aliases[otherId] : null;
  const otherViewing = otherId ? viewers.some((v) => v.user_id === otherId) : false;

  return (
    <div className="flex flex-col h-[70vh]">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border/60">
        {other ? (
          <Link to="/fanzone/u/$userId" params={{ userId: other.user_id }} className="flex items-center gap-3 group min-w-0 flex-1">
            <div className="relative shrink-0">
              <img src={other.fan_avatar_url} alt="" className="size-9 rounded-full object-cover ring-2 ring-white/10" />
              {otherViewing && <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-emerald-500 ring-2 ring-background" />}
            </div>
            <div className="min-w-0">
              <div className="font-display font-bold text-sm truncate group-hover:text-[#E11B22]">{other.fan_alias}</div>
              <div className="text-[10px] text-muted-foreground inline-flex items-center gap-1"><User2 className="size-3" />View profile</div>
            </div>
          </Link>
        ) : <div className="text-sm text-muted-foreground">Loading…</div>}
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {msgs === null ? (
          <div className="grid place-items-center py-12 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
        ) : msgs.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-10">Say hi to start the conversation.</p>
        ) : msgs.map((m) => {
          const mine = m.sender_id === user?.id;
          const senderAlias = aliases[m.sender_id];
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"} gap-2`}>
              {!mine && senderAlias && <img src={senderAlias.fan_avatar_url} alt="" className="size-7 rounded-full shrink-0" />}
              <div className="flex items-end gap-1 max-w-[75%]">
                <div className={`rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words shadow-sm ${mine ? "bg-gradient-to-br from-[#E11B22] to-[#8B0F14] text-white" : "bg-surface-2 border border-border"}`}>
                  <div>{m.body}</div>
                  <div className={`text-[10px] mt-1 ${mine ? "text-white/70" : "text-muted-foreground"}`}>{formatLastSeen(m.created_at)}</div>
                </div>
                {!mine && <ReportButton kind="dm_message" targetId={m.id} variant="icon" />}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="border-t border-border/60 p-3 flex items-end gap-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, 4000))}
          placeholder="Write a message…"
          rows={2}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
          }}
          className="resize-none"
        />
        <Button onClick={() => void send()} disabled={sending || !body.trim()} className="bg-gradient-to-r from-[#E11B22] to-[#8B0F14] hover:from-[#F02B30] hover:to-[#9B1118] border-0 text-white">
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </div>
    </div>
  );
}