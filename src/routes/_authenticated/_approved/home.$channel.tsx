import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Hash, Megaphone, Loader2, Send, Trash2, EyeOff, Eye, Pin, PinOff, X, ShieldOff, MoreHorizontal, SmilePlus, Pencil, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { MentionText, mentionsCurrentUser, useMentionAutocomplete } from "@/components/app/mentions";
import { StaffOnDutyStrip } from "@/components/app/StaffOnDutyStrip";
import { cn } from "@/lib/utils";
import { DEFAULT_AVATAR_URL } from "@/lib/default-avatar";

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
  edited_at?: string | null;
}

interface Profile {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

interface Reaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
}

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "🎉"];

function ChannelPage() {
  const { channel: slug } = Route.useParams();
  const { user, hasAny } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const canPin = hasAny(["admin", "management", "moderator", "staff"]);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [ignoredOpen, setIgnoredOpen] = useState(false);
  const [myUsername, setMyUsername] = useState<string | null>(null);
  const [ignoredIds, setIgnoredIds] = useState<Set<string>>(new Set());
  const [staffIds, setStaffIds] = useState<Set<string>>(new Set());
  const [ignoredProfiles, setIgnoredProfiles] = useState<Record<string, Profile>>({});
  const [selectedToUnblock, setSelectedToUnblock] = useState<Set<string>>(new Set());

  // Reset selection when the panel closes or list changes
  useEffect(() => {
    if (!ignoredOpen) setSelectedToUnblock(new Set());
  }, [ignoredOpen]);

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

  // Load profiles for ignored users (so we can show them in the manage panel)
  useEffect(() => {
    const ids = Array.from(ignoredIds);
    if (ids.length === 0) {
      setIgnoredProfiles({});
      return;
    }
    supabase
      .from("profiles")
      .select("id, display_name, username, avatar_url")
      .in("id", ids)
      .then(({ data }) => {
        const next: Record<string, Profile> = {};
        for (const p of (data as Profile[] | null) ?? []) next[p.id] = p;
        setIgnoredProfiles(next);
      });
  }, [ignoredIds]);

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
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [emojiPickerId, setEmojiPickerId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [canSend, setCanSend] = useState(true);
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

  // Check if current user can send in this channel
  useEffect(() => {
    if (!channel || !user) { setCanSend(true); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("can_in_channel", {
        _user: user.id,
        _channel: channel.id,
        _action: "send",
      });
      if (!cancelled) setCanSend(error ? true : !!data);
    })();
    return () => { cancelled = true; };
  }, [channel?.id, user?.id]);

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
      if (rows.length > 0) {
        const { data: reactRows } = await supabase
          .from("message_reactions")
          .select("id, message_id, user_id, emoji")
          .in("message_id", rows.map((r) => r.id));
        if (!cancelled) setReactions((reactRows as Reaction[] | null) ?? []);
      } else {
        setReactions([]);
      }
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
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "message_reactions" },
        (payload) => {
          const r = payload.new as Reaction;
          setReactions((prev) => (prev.some((x) => x.id === r.id) ? prev : [...prev, r]));
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "message_reactions" },
        (payload) => {
          const old = payload.old as { id: string };
          setReactions((prev) => prev.filter((r) => r.id !== old.id));
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
      const msg = error.message || "";
      const isPermission =
        /row-level security|permission denied|violates.*policy|not allowed|forbidden/i.test(msg);
      toast.error(
        msg.includes("@all") || msg.includes("@here")
          ? "Only admin and management can use @all or @here."
          : isPermission
            ? "You don't have permission to send messages in this channel."
            : msg,
      );
      setDraft(content);
    }
    setSending(false);
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("chat_messages").delete().eq("id", id);
    if (error) toast.error(error.message);
  };

  const togglePin = async (m: Message) => {
    if (!canPin || !user) return;
    const isPinned = !!m.pinned_at;
    const { error } = await supabase
      .from("chat_messages")
      .update(
        isPinned
          ? { pinned_at: null, pinned_by: null }
          : { pinned_at: new Date().toISOString(), pinned_by: user.id },
      )
      .eq("id", m.id);
    if (error) return toast.error(error.message);
    toast.success(isPinned ? "Message unpinned." : "Message pinned.");
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

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!user) return;
    const existing = reactions.find(
      (r) => r.message_id === messageId && r.user_id === user.id && r.emoji === emoji,
    );
    if (existing) {
      const { error } = await supabase.from("message_reactions").delete().eq("id", existing.id);
      if (error) toast.error(error.message);
    } else {
      const { error } = await supabase
        .from("message_reactions")
        .insert({ message_id: messageId, user_id: user.id, emoji });
      if (error) toast.error(error.message);
    }
    setEmojiPickerId(null);
    setOpenMenuId(null);
  };

  const startEdit = (m: Message) => {
    setEditingId(m.id);
    setEditDraft(m.content);
    setOpenMenuId(null);
  };

  const saveEdit = async (id: string) => {
    const content = editDraft.trim();
    if (!content) return;
    const { error } = await supabase
      .from("chat_messages")
      .update({ content, edited_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    setEditingId(null);
    setEditDraft("");
  };

  // Close menus when clicking outside
  useEffect(() => {
    if (!openMenuId && !emojiPickerId) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-msg-menu]")) {
        setOpenMenuId(null);
        setEmojiPickerId(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [openMenuId, emojiPickerId]);

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

  const pinnedMessages = messages
    .filter((m) => m.pinned_at)
    .sort((a, b) => (b.pinned_at ?? "").localeCompare(a.pinned_at ?? ""));

  return (
    <main className="flex-1 flex flex-col min-w-0 min-h-0 h-full">
      <header className="h-14 border-b border-border px-5 flex items-center gap-2 shrink-0 relative">
        <Icon className="size-4 text-muted-foreground" />
        <h1 className="font-display font-semibold">{channel.name}</h1>
        {channel.staff_only && (
          <span className="ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">staff</span>
        )}
        <div className="ml-auto relative">
          <button
            onClick={() => setPinnedOpen((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-surface-2 transition-colors"
            title="Pinned messages"
          >
            <Pin className="size-4" />
            <span className="tabular-nums">{pinnedMessages.length}</span>
          </button>
          {pinnedOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg z-30">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pinned messages</span>
                <button onClick={() => setPinnedOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="size-4" />
                </button>
              </div>
              {pinnedMessages.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  No pinned messages yet.
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {pinnedMessages.map((m) => {
                    const p = profiles[m.sender_id];
                    const name = p?.display_name ?? p?.username ?? "Unknown";
                    return (
                      <li key={m.id} className="p-3 hover:bg-surface-2/40">
                        <div className="flex items-baseline justify-between gap-2 mb-1">
                          <span className="text-xs font-medium">{name}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(m.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <MentionText content={m.content} currentUsername={myUsername} className="text-xs text-muted-foreground line-clamp-3" />
                        {canPin && (
                          <button
                            onClick={() => togglePin(m)}
                            className="mt-1 text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-1"
                          >
                            <PinOff className="size-3" /> Unpin
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
        <div className="relative">
          <button
            onClick={() => setIgnoredOpen((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-surface-2 transition-colors"
            title="Ignored users"
          >
            <ShieldOff className="size-4" />
            <span className="tabular-nums">{ignoredIds.size}</span>
          </button>
          {ignoredOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg z-30">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ignored users</span>
                <button onClick={() => setIgnoredOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="size-4" />
                </button>
              </div>
              {ignoredIds.size === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  You haven't ignored anyone.
                </div>
              ) : (
                <>
                <ul className="divide-y divide-border">
                  {Array.from(ignoredIds).map((id) => {
                    const p = ignoredProfiles[id];
                    const name = p?.display_name ?? p?.username ?? "Unknown user";
                    const checked = selectedToUnblock.has(id);
                    return (
                      <li key={id} className="p-3 flex items-center gap-3 hover:bg-surface-2/40">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setSelectedToUnblock((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(id);
                              else next.delete(id);
                              return next;
                            });
                          }}
                          className="size-4 accent-primary cursor-pointer"
                        />
                        <img
                          src={p?.avatar_url ?? DEFAULT_AVATAR_URL}
                          alt=""
                          className="size-8 rounded-full object-cover shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{name}</div>
                          {p?.username && (
                            <div className="text-[11px] text-muted-foreground truncate">@{p.username}</div>
                          )}
                        </div>
                        <button
                          onClick={() => toggleIgnore(id)}
                          className="text-xs px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                        >
                          Unblock
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <div className="sticky bottom-0 flex items-center justify-between gap-2 px-3 py-2 border-t border-border bg-popover">
                  <span className="text-[11px] text-muted-foreground">
                    {selectedToUnblock.size} selected
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedToUnblock(new Set(ignoredIds))}
                      className="text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      Select all
                    </button>
                    <button
                      disabled={selectedToUnblock.size === 0}
                      onClick={async () => {
                        if (!user || selectedToUnblock.size === 0) return;
                        const ids = Array.from(selectedToUnblock);
                        const { error } = await supabase
                          .from("user_ignores")
                          .delete()
                          .eq("ignorer_id", user.id)
                          .in("ignored_id", ids);
                        if (error) return toast.error(error.message);
                        setIgnoredIds((prev) => {
                          const next = new Set(prev);
                          for (const id of ids) next.delete(id);
                          return next;
                        });
                        setSelectedToUnblock(new Set());
                        toast.success(`Unblocked ${ids.length} user${ids.length === 1 ? "" : "s"}.`);
                      }}
                      className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Unblock selected
                    </button>
                  </div>
                </div>
                </>
              )}
            </div>
          )}
        </div>
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
            const isPinned = !!m.pinned_at;
            const msgReactions = reactions.filter((r) => r.message_id === m.id);
            const grouped = msgReactions.reduce<Record<string, Reaction[]>>((acc, r) => {
              (acc[r.emoji] ||= []).push(r);
              return acc;
            }, {});
            const isEditing = editingId === m.id;
            const menuOpen = openMenuId === m.id;
            const pickerOpen = emojiPickerId === m.id;
            const canEdit = isSelf;
            return (
              <div
                key={m.id}
                className={cn(
                  "group relative flex items-start gap-3 transition-colors",
                )}
              >
                {p?.avatar_url ? (
                  <img src={p.avatar_url} alt="" className="size-9 rounded-full object-cover shrink-0 mt-1" />
                ) : (
                  <div className="size-9 rounded-full bg-gradient-primary grid place-items-center text-xs font-semibold text-primary-foreground shrink-0 mt-1">
                    {initial}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="font-medium text-sm">{name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {isPinned && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-primary">
                        <Pin className="size-3" /> Pinned
                      </span>
                    )}
                  </div>
                  <div
                    className={cn(
                      "inline-block max-w-full rounded-2xl px-3.5 py-2 border shadow-sm",
                      isPinned
                        ? "bg-primary/10 border-primary/30 rounded-tl-sm"
                        : highlight
                        ? "bg-amber-400/10 border-amber-400/30 rounded-tl-sm"
                        : isSelf
                        ? "bg-primary/15 border-primary/20 rounded-tl-sm"
                        : "bg-surface-2 border-border rounded-tl-sm",
                    )}
                  >
                    {isEditing ? (
                      <div className="flex flex-col gap-2 min-w-[220px]">
                        <textarea
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              saveEdit(m.id);
                            } else if (e.key === "Escape") {
                              setEditingId(null);
                            }
                          }}
                          rows={2}
                          className="bg-transparent resize-none outline-none text-sm"
                          autoFocus
                        />
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <button
                            onClick={() => saveEdit(m.id)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90"
                          >
                            <Check className="size-3" /> Save
                          </button>
                          <button onClick={() => setEditingId(null)} className="hover:text-foreground">
                            Cancel
                          </button>
                          <span>Enter to save · Esc to cancel</span>
                        </div>
                      </div>
                    ) : (
                      <>
                        <MentionText content={m.content} currentUsername={myUsername} className="text-sm" />
                        {m.edited_at && (
                          <span className="ml-1 text-[10px] text-muted-foreground">(edited)</span>
                        )}
                      </>
                    )}
                  </div>
                  {Object.keys(grouped).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {Object.entries(grouped).map(([emoji, list]) => {
                        const mine = list.some((r) => r.user_id === user?.id);
                        return (
                          <button
                            key={emoji}
                            onClick={() => toggleReaction(m.id, emoji)}
                            className={cn(
                              "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors",
                              mine
                                ? "bg-primary/20 border-primary/40 text-foreground"
                                : "bg-surface-2 border-border hover:bg-surface-2/70 text-muted-foreground",
                            )}
                          >
                            <span>{emoji}</span>
                            <span className="tabular-nums">{list.length}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Discord-style hover toolbar */}
                <div
                  data-msg-menu
                  className={cn(
                    "absolute -top-3 right-2 flex items-center rounded-lg border border-border bg-popover shadow-md transition-opacity",
                    menuOpen || pickerOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                  )}
                >
                  <button
                    onClick={() => {
                      setEmojiPickerId(pickerOpen ? null : m.id);
                      setOpenMenuId(null);
                    }}
                    className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-surface-2 rounded-l-lg"
                    title="Add reaction"
                  >
                    <SmilePlus className="size-4" />
                  </button>
                  <button
                    onClick={() => {
                      setOpenMenuId(menuOpen ? null : m.id);
                      setEmojiPickerId(null);
                    }}
                    className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-surface-2 rounded-r-lg border-l border-border"
                    title="More"
                  >
                    <MoreHorizontal className="size-4" />
                  </button>

                  {pickerOpen && (
                    <div className="absolute right-0 top-full mt-1 flex gap-1 rounded-lg border border-border bg-popover p-1.5 shadow-lg z-20">
                      {QUICK_EMOJIS.map((e) => (
                        <button
                          key={e}
                          onClick={() => toggleReaction(m.id, e)}
                          className="text-base hover:bg-surface-2 rounded p-1 leading-none"
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  )}

                  {menuOpen && (
                    <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-border bg-popover shadow-lg z-20 py-1 text-sm">
                      <button
                        onClick={() => {
                          setEmojiPickerId(m.id);
                          setOpenMenuId(null);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-surface-2 text-left"
                      >
                        <SmilePlus className="size-4" /> Add reaction
                      </button>
                      {canEdit && (
                        <button
                          onClick={() => startEdit(m)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-surface-2 text-left"
                        >
                          <Pencil className="size-4" /> Edit message
                        </button>
                      )}
                      {canPin && (
                        <button
                          onClick={() => {
                            togglePin(m);
                            setOpenMenuId(null);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-surface-2 text-left"
                        >
                          {isPinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
                          {isPinned ? "Unpin" : "Pin message"}
                        </button>
                      )}
                      {!isSelf && !isStaff && (
                        <button
                          onClick={() => {
                            toggleIgnore(m.sender_id);
                            setOpenMenuId(null);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-surface-2 text-left"
                        >
                          {isIgnored ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                          {isIgnored ? "Unignore user" : "Ignore user"}
                        </button>
                      )}
                      {canDelete && (
                        <>
                          <div className="my-1 border-t border-border" />
                          <button
                            onClick={() => {
                              remove(m.id);
                              setOpenMenuId(null);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-destructive/10 text-destructive text-left"
                          >
                            <Trash2 className="size-4" /> Delete message
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
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