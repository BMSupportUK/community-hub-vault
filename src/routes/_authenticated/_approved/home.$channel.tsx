import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Hash, Megaphone, Loader2, Send, Trash2, EyeOff, Eye, Pin, PinOff, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { MentionText, mentionsCurrentUser, useMentionAutocomplete } from "@/components/app/mentions";
import { StaffOnDutyStrip } from "@/components/app/StaffOnDutyStrip";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_approved/home/$channel")({
  component: ChannelPage,
});

interface Channel {
  id: string;
  slug: string;
  name: string;
  icon: string;
  staff_only: boolean;
}

interface Message {
  id: string;
  channel_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  pinned_at: string | null;
  pinned_by: string | null;
}

interface Profile {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

function ChannelPage() {
  const { channel: slug } = Route.useParams();
  const { user, hasAny } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const canPin = hasAny(["admin", "management", "moderator", "staff"]);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [myUsername, setMyUsername] = useState<string | null>(null);
  const [ignoredIds, setIgnoredIds] = useState<Set<string>>(new Set());
  const [staffIds, setStaffIds] = useState<Set<string>>(new Set());

  // Load my ignore list
  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_ignores")
      .select("ignored_id")
      .eq("ignorer_id", user.id)
      .then(({ data }) => {
        setIgnoredIds(new Set((data ?? []).map((r: { ignored_id: string }) => r.ignored_id)));
      });
  }, [user?.id]);

  // Load staff role memberships (so we know who can't be ignored)
  useEffect(() => {
    supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["admin", "management", "moderator", "staff"])
      .then(({ data }) => {
        setStaffIds(new Set((data ?? []).map((r: { user_id: string }) => r.user_id)));
      });
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setMyUsername(data?.username ?? null));
  }, [user?.id]);

  const [channel, setChannel] = useState<Channel | null>(null);
  const [missing, setMissing] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const mention = useMentionAutocomplete({
    value: draft,
    onChange: setDraft,
    textareaRef: taRef,
    canBroadcast: isAdmin,
  });

  // Load channel
  useEffect(() => {
    setChannel(null);
    setMissing(false);
    setMessages([]);
    (async () => {
      const { data } = await supabase
        .from("chat_channels")
        .select("id, slug, name, icon, staff_only")
        .eq("slug", slug)
        .maybeSingle();
      if (!data) setMissing(true);
      else setChannel(data as Channel);
    })();
  }, [slug]);

  // Load messages + subscribe
  useEffect(() => {
    if (!channel) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("id, channel_id, sender_id, content, created_at, pinned_at, pinned_by")
        .eq("channel_id", channel.id)
        .order("created_at", { ascending: true })
        .limit(200);
      if (cancelled) return;
      const rows = (data as Message[] | null) ?? [];
      setMessages(rows);
      await loadProfiles(rows.map((r) => r.sender_id));
    })();

    const ch = supabase
      .channel(`chat:${channel.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `channel_id=eq.${channel.id}` },
        async (payload) => {
          const m = payload.new as Message;
          setMessages((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m]));
          await loadProfiles([m.sender_id]);
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "chat_messages", filter: `channel_id=eq.${channel.id}` },
        (payload) => {
          const old = payload.old as { id: string };
          setMessages((prev) => prev.filter((m) => m.id !== old.id));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_messages", filter: `channel_id=eq.${channel.id}` },
        (payload) => {
          const updated = payload.new as Message;
          setMessages((prev) => prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.id]);

  const loadProfiles = async (ids: string[]) => {
    const need = Array.from(new Set(ids)).filter((id) => id && !profiles[id]);
    if (need.length === 0) return;
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, username, avatar_url")
      .in("id", need);
    if (!data) return;
    setProfiles((prev) => {
      const next = { ...prev };
      for (const p of data as Profile[]) next[p.id] = p;
      return next;
    });
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  const send = async () => {
    if (!user || !channel || !draft.trim()) return;
    setSending(true);
    const content = draft.trim();
    setDraft("");
    const { error } = await supabase
      .from("chat_messages")
      .insert({ channel_id: channel.id, sender_id: user.id, content });
    if (error) {
      toast.error(error.message.includes("@all") || error.message.includes("@here")
        ? "Only admin and management can use @all or @here."
        : error.message);
      setDraft(content);
    }
    setSending(false);
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("chat_messages").delete().eq("id", id);
    if (error) toast.error(error.message);
  };

  const toggleIgnore = async (targetId: string) => {
    if (!user) return;
    if (staffIds.has(targetId)) {
      toast.error("Staff members cannot be ignored.");
      return;
    }
    if (ignoredIds.has(targetId)) {
      const { error } = await supabase
        .from("user_ignores")
        .delete()
        .eq("ignorer_id", user.id)
        .eq("ignored_id", targetId);
      if (error) return toast.error(error.message);
      setIgnoredIds((prev) => {
        const next = new Set(prev);
        next.delete(targetId);
        return next;
      });
      toast.success("User unignored.");
    } else {
      const { error } = await supabase
        .from("user_ignores")
        .insert({ ignorer_id: user.id, ignored_id: targetId });
      if (error) return toast.error(error.message);
      setIgnoredIds((prev) => new Set(prev).add(targetId));
      toast.success("User ignored. Their messages are now hidden.");
    }
  };

  if (missing) {
    return (
      <main className="flex-1 grid place-items-center text-muted-foreground">
        Channel not found.
      </main>
    );
  }
  if (!channel) {
    return (
      <main className="flex-1 grid place-items-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </main>
    );
  }

  const Icon = channel.icon === "Megaphone" ? Megaphone : Hash;

  return (
    <main className="flex-1 flex flex-col min-w-0 min-h-0 h-full">
      <header className="h-14 border-b border-border px-5 flex items-center gap-2 shrink-0">
        <Icon className="size-4 text-muted-foreground" />
        <h1 className="font-display font-semibold">{channel.name}</h1>
        {channel.staff_only && (
          <span className="ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">staff</span>
        )}
      </header>

      <StaffOnDutyStrip />

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-12">
            No messages yet — say hi.
          </div>
        ) : (
          messages
            .filter((m) => !ignoredIds.has(m.sender_id) || m.sender_id === user?.id)
            .map((m) => {
            const p = profiles[m.sender_id];
            const name = p?.display_name ?? p?.username ?? "Unknown";
            const initial = (name || "?").slice(0, 1).toUpperCase();
            const canDelete = m.sender_id === user?.id || isAdmin;
            const isSelf = m.sender_id === user?.id;
            const isStaff = staffIds.has(m.sender_id);
            const isIgnored = ignoredIds.has(m.sender_id);
            const highlight = mentionsCurrentUser(m.content, myUsername);
            return (
              <div
                key={m.id}
                className={cn(
                  "group flex items-start gap-3 rounded-md -mx-2 px-2 py-1 transition-colors",
                  highlight
                    ? "bg-amber-400/10 border-l-2 border-amber-400 hover:bg-amber-400/15"
                    : "border-l-2 border-transparent hover:bg-surface-2/40",
                )}
              >
                {p?.avatar_url ? (
                  <img src={p.avatar_url} alt="" className="size-9 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="size-9 rounded-full bg-gradient-primary grid place-items-center text-xs font-semibold text-primary-foreground shrink-0">
                    {initial}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium text-sm">{name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <MentionText content={m.content} currentUsername={myUsername} className="text-sm" />
                </div>
                {!isSelf && !isStaff && (
                  <button
                    onClick={() => toggleIgnore(m.sender_id)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                    title={isIgnored ? "Unignore user" : "Ignore user"}
                  >
                    {isIgnored ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                  </button>
                )}
                {canDelete && (
                  <button
                    onClick={() => remove(m.id)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                    title="Delete"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="p-4 border-t border-border shrink-0">
        <div className="relative flex items-end gap-2 rounded-xl bg-surface-2 border border-border focus-within:border-primary px-3 py-2">
          {mention.dropdown}
          <textarea
            ref={taRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (mention.onKeyDown(e)) return;
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder={`Message #${channel.name} — type @ to mention`}
            className="flex-1 bg-transparent resize-none outline-none text-sm py-1 max-h-32"
          />
          <button
            onClick={send}
            disabled={sending || !draft.trim()}
            className="size-8 rounded-lg bg-primary text-primary-foreground grid place-items-center disabled:opacity-50"
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </div>
      </div>
    </main>
  );
}