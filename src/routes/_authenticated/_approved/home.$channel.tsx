import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import {
  Hash,
  Megaphone,
  Loader2,
  Send,
  Trash2,
  EyeOff,
  Eye,
  Pin,
  PinOff,
  X,
  ShieldOff,
  MoreHorizontal,
  SmilePlus,
  Plus,
  Pencil,
  Check,
  Timer,
  MicOff,
  Mic,
  Reply,
  CornerUpRight,
  Users,
  UserRoundCog,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  MentionText,
  mentionsCurrentUser,
  useMentionAutocomplete,
  STAFF_ROLE_TAGS,
  MEMBER_ROLE_TAGS,
} from "@/components/app/mentions";
import { GifPicker, extractStandaloneGif, extractImageUrl } from "@/components/app/GifPicker";
import { ChatMessageBody, isRichChatContent } from "@/components/app/ChatMessageBody";
import { ChatFormatToolbar } from "@/components/app/ChatFormatToolbar";
import { TalkMemberMiniProfile } from "@/components/app/TalkMemberProfileCard";
import { EmojiPicker } from "@/components/app/EmojiPicker";
import { resolveGifLink } from "@/lib/giphy.functions";

import { StaffOnDutySidebar } from "@/components/app/StaffOnDutyStrip";
import { OnlineMembersDialog } from "@/components/app/OnlineMembersDialog";
import { TalkChannelMembersPanel } from "@/components/app/TalkChannelMembersPanel";
import { QuickRepliesPill, useQuickReplies } from "@/components/app/QuickRepliesDialog";
import { useChannelJump } from "@/components/app/ChannelJump";
import { useQuickReplySlash } from "@/components/app/QuickReplySlash";


import { cn } from "@/lib/utils";
import { DEFAULT_AVATAR_URL } from "@/lib/default-avatar";
import { Nameplate } from "@/components/app/Nameplate";
import { useOnlineUsers } from "@/hooks/use-online-users";
import { useTalkChannelPresence } from "@/hooks/use-talk-channel-presence";
import { PresenceMiniDot, PresenceMiniLabel } from "@/components/app/PresenceIndicators";
import { formatLastSeen } from "@/lib/relative-time";
import { useRoleFlashMap, roleFlashClass, resolveAvatarUrl } from "@/lib/role-flash";
import { useHomeChannelContentReady } from "@/components/app/HomeChannelReadyContext";
import { WorkingStatusBox } from "@/components/app/WorkingStatusBox";
import { Sheet, SheetContent } from "@/components/ui/sheet";

export const Route = createFileRoute("/_authenticated/_approved/home/$channel")({
  validateSearch: (search: Record<string, unknown>): { msg?: string } =>
    typeof search.msg === "string" ? { msg: search.msg } : {},
  component: ChannelPage,
  head: () => ({
    meta: [
      { title: "Talk Channels | BM Support" },
      { name: "description", content: "Join live BM Support community conversations and keep in touch with staff and members." },
      { property: "og:title", content: "Talk Channels | BM Support" },
      { property: "og:description", content: "Join live BM Support community conversations and keep in touch with staff and members." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

interface Channel {
  id: string;
  slug: string;
  name: string;
  icon: string;
  staff_only: boolean;
  slow_mode_seconds: number;
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
  reply_to?: string | null;
}

interface Profile {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  equipped_nameplate_id: string | null;
  custom_status: string | null;
  last_seen_at?: string | null;
}

interface Reaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
}

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "🎉"];
const CHANNEL_READ_EVENT = "bm-support:channel-read";

function formatSlow(s: number): string {
  if (s <= 0) return "off";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 3600)}h`;
}

function ChannelPage() {
  const onlineUsers = useOnlineUsers();
  const markContentReady = useHomeChannelContentReady();
  const { channel: slug } = Route.useParams();
  const { user, hasAny, roles } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const canPin = hasAny(["admin", "management", "moderator", "staff"]);
  const canManageSlow = hasAny(["admin", "management", "moderator", "staff"]);
  const isModOrAdmin = hasAny(["admin", "management", "moderator", "staff"]);
  const canMute = hasAny(["admin", "management", "moderator", "staff"]);
  const hideMembersPanel = slug === "welcome" || slug === "rules";
  const [muteSubmenuId, setMuteSubmenuId] = useState<string | null>(null);
  const [sideTab, setSideTab] = useState<"staff" | "members">("staff");
  const [mobilePeopleOpen, setMobilePeopleOpen] = useState(false);

  const [myMuteExpires, setMyMuteExpires] = useState<Date | null>(null);
  const [muteTick, setMuteTick] = useState(0);
  const [mutedUserIds, setMutedUserIds] = useState<Set<string>>(new Set());
  const [unmuteTarget, setUnmuteTarget] = useState<{ id: string; name: string } | null>(null);
  const [unmuting, setUnmuting] = useState(false);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [ignoredOpen, setIgnoredOpen] = useState(false);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [myUsername, setMyUsername] = useState<string | null>(null);
  const [ignoredIds, setIgnoredIds] = useState<Set<string>>(new Set());
  const [staffIds, setStaffIds] = useState<Set<string>>(new Set());
  const roleFlashMap = useRoleFlashMap();
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
      .select("id, display_name, username, avatar_url, equipped_nameplate_id")
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

  // Load my active mute status and subscribe to mute changes
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const refresh = async () => {
      const { data } = await supabase
        .from("chat_mutes")
        .select("expires_at")
        .eq("user_id", user.id)
        .gt("expires_at", new Date().toISOString())
        .order("expires_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      setMyMuteExpires(data?.expires_at ? new Date(data.expires_at) : null);
    };
    refresh();
    const ch = supabase
      .channel(`my-mutes:${user.id}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_mutes", filter: `user_id=eq.${user.id}` },
        () => refresh(),
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [user?.id]);

  // Tick countdown while muted; clear when expired
  useEffect(() => {
    if (!myMuteExpires) return;
    const id = window.setInterval(() => {
      if (myMuteExpires.getTime() <= Date.now()) {
        setMyMuteExpires(null);
      } else {
        setMuteTick((t) => t + 1);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [myMuteExpires]);

  const muteUser = async (targetId: string, seconds: number) => {
    const { data, error } = await supabase.rpc("mute_user", {
      _user_id: targetId,
      _duration_seconds: seconds,
    });
    if (error) return toast.error(error.message);
    const label = seconds === 3600 ? "1 hour" : seconds === 10800 ? "3 hours" : "24 hours";
    toast.success(
      `User muted for ${label} (until ${new Date(data as string).toLocaleTimeString("en-GB")}).`,
    );
    setMuteSubmenuId(null);
    setOpenMenuId(null);
    setMutedUserIds((prev) => new Set(prev).add(targetId));
  };

  // Track which users currently have an active mute (for staff UI).
  useEffect(() => {
    if (!canMute) return;
    let cancelled = false;
    const refresh = async () => {
      const { data } = await supabase
        .from("chat_mutes")
        .select("user_id")
        .gt("expires_at", new Date().toISOString());
      if (cancelled) return;
      setMutedUserIds(new Set((data ?? []).map((r: { user_id: string }) => r.user_id)));
    };
    refresh();
    const ch = supabase
      .channel(`all-mutes-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_mutes" }, () =>
        refresh(),
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [canMute]);

  const confirmUnmute = async () => {
    if (!unmuteTarget) return;
    setUnmuting(true);
    const { error } = await supabase.rpc("unmute_user", { _user_id: unmuteTarget.id });
    setUnmuting(false);
    if (error) return toast.error(error.message);
    toast.success(`${unmuteTarget.name} has been unmuted.`);
    setMutedUserIds((prev) => {
      const n = new Set(prev);
      n.delete(unmuteTarget.id);
      return n;
    });
    setUnmuteTarget(null);
    setOpenMenuId(null);
  };

  const [channel, setChannel] = useState<Channel | null>(null);
  const [missing, setMissing] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [draft, setDraft] = useState("");
  /** Rich HTML of the composer, used when the formatting toolbar was applied. */
  const [draftHtml, setDraftHtml] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [flashMsgId, setFlashMsgId] = useState<string | null>(null);

  useTalkChannelPresence({
    userId: user?.id,
    channelId: channel?.id,
    track: Boolean(user?.id && channel?.id),
  });

  /** Scroll to the original message of a reply and briefly highlight it. */
  const jumpToMessage = (id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) {
      toast.error("The original message is no longer available.");
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashMsgId(id);
    window.setTimeout(() => setFlashMsgId((cur) => (cur === id ? null : cur)), 2000);
  };

  // Deep link support: /home/<channel>?msg=<id> scrolls to that message once loaded.
  const { msg: targetMsgId } = Route.useSearch();
  const jumpedToTargetRef = useRef<string | null>(null);
  useEffect(() => {
    if (!targetMsgId || jumpedToTargetRef.current === targetMsgId) return;
    if (!messages.some((m) => m.id === targetMsgId)) return;
    jumpedToTargetRef.current = targetMsgId;
    requestAnimationFrame(() => jumpToMessage(targetMsgId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetMsgId, messages]);

  const [pendingGif, setPendingGif] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [uploadingPaste, setUploadingPaste] = useState(false);
  const resolveGif = useServerFn(resolveGifLink);

  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [emojiPickerId, setEmojiPickerId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editDraftHtml, setEditDraftHtml] = useState("");
  const editEditorRef = useRef<HTMLDivElement>(null);
  const [canSend, setCanSend] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Discord-style "jump to last read" support. Captured once per channel load
  // so the divider stays visible until the user navigates away.
  const [firstUnreadId, setFirstUnreadId] = useState<string | null>(null);
  // Frozen last-read timestamp captured when the channel was opened. Used for
  // the per-message read/unread labels so they don't all flip to "Read" as soon
  // as the marker advances while the user is reading.
  const [baselineReadAt, setBaselineReadAt] = useState<string | null>(null);

  const initialScrollDoneRef = useRef(false);
  const keepScrollPinnedRef = useRef(true);
  const lastReadAtRef = useRef<string | null>(null);
  const firstUnreadRef = useRef<HTMLDivElement | null>(null);
  const latestMessageRef = useRef<Message | null>(null);

  // Messages flip from "Unread" to "Read" 10s after they first appear on screen.
  const seenAtRef = useRef<Map<string, number>>(new Map());
  const [readTick, setReadTick] = useState(0);
  const READ_DELAY_MS = 10_000;

  useEffect(() => {
    const now = Date.now();
    for (const m of messages) {
      if (!seenAtRef.current.has(m.id)) seenAtRef.current.set(m.id, now);
    }
    setReadTick((t) => t + 1);
  }, [messages]);

  useEffect(() => {
    const id = setInterval(() => setReadTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const isReadByDwell = (messageId: string) => {
    const seen = seenAtRef.current.get(messageId);
    return seen !== undefined && Date.now() - seen >= READ_DELAY_MS;
  };

  const isAtBottom = () => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  // Message rows finish rendering in stages (profiles, reactions and media).
  // Keep a reader who is already at the bottom anchored there when any of
  // those late updates change the list height, rather than letting the rows
  // visibly jump up the screen.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const rememberPosition = () => {
      keepScrollPinnedRef.current = isAtBottom();
    };
    const observer = new ResizeObserver(() => {
      if (!initialScrollDoneRef.current || !keepScrollPinnedRef.current) return;
      requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight }));
    });

    const observeRows = () => {
      for (const child of Array.from(el.children)) observer.observe(child);
    };
    const mutations = new MutationObserver(observeRows);

    el.addEventListener("scroll", rememberPosition, { passive: true });
    observer.observe(el);
    observeRows();
    mutations.observe(el, { childList: true });

    return () => {
      el.removeEventListener("scroll", rememberPosition);
      mutations.disconnect();
      observer.disconnect();
    };
  }, [channel?.id]);

  const persistLastRead = (iso: string) => {
    if (!channel || !user) return;
    const prev = lastReadAtRef.current;
    const nextTime = Date.parse(iso);
    const prevTime = prev ? Date.parse(prev) : 0;
    if (Number.isFinite(nextTime) && Number.isFinite(prevTime) && prevTime >= nextTime) return;
    lastReadAtRef.current = iso;
    const detail = { channelId: channel.id, slug: channel.slug, readAt: iso };
    window.dispatchEvent(new CustomEvent(CHANNEL_READ_EVENT, { detail }));
    void supabase
      .from("channel_reads")
      .upsert(
        { user_id: user.id, channel_id: channel.id, last_read_at: iso },
        { onConflict: "user_id,channel_id" },
      )
      .then(({ error }) => {
        if (error) {
          console.error("Could not update channel read marker", error);
          return;
        }
        window.dispatchEvent(new CustomEvent(CHANNEL_READ_EVENT, { detail }));
      });
  };

  const { expand: expandQuickReply } = useQuickReplies();

  const mention = useMentionAutocomplete({
    value: draft,
    onChange: setDraft,
    textareaRef: taRef,
    canBroadcast: isAdmin,
    // Staff roles can tag any staff role; everyone else can tag management/moderator/staff only.
    roleMentions: isModOrAdmin ? [...STAFF_ROLE_TAGS] : [...MEMBER_ROLE_TAGS],
  });

  // `#` command — jump to another Talk channel from the composer.
  const channelJump = useChannelJump({
    value: draft,
    onChange: setDraft,
    editorRef: taRef,
  });

  // `/` command — pick a saved staff shortcut straight from the composer.
  const quickSlash = useQuickReplySlash({
    value: draft,
    onChange: setDraft,
    editorRef: taRef,
    // Confirming a shortcut sends it straight into chat.
    onSend: (text) => void send(text),
  });


  useEffect(() => {
    const editor = taRef.current;
    if (!editor || editor.innerText.replace(/\n$/, "") === draft) return;
    editor.textContent = draft;
    setDraftHtml(editor.innerHTML);
  }, [draft]);

  /** Sync both the plain-text and rich-HTML drafts from the live composer. */
  const syncComposer = () => {
    const editor = taRef.current;
    if (!editor) return;
    setDraft(editor.innerText.replace(/\n$/, ""));
    setDraftHtml(editor.innerHTML);
  };

  /** Drop a staff quick-reply sentence into the message bar and focus the caret. */
  const insertQuickReply = (text: string) => {
    setDraft((d) => (d && !d.endsWith(" ") ? `${d} ${text}` : `${d}${text}`));
    requestAnimationFrame(() => {
      const editor = taRef.current;
      if (!editor) return;
      editor.focus();
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    });
  };

  // Load channel
  useEffect(() => {
    setChannel(null);
    setMissing(false);
    setMessages([]);
    (async () => {
      const { data } = await supabase
        .from("chat_channels")
        .select("id, slug, name, icon, staff_only, slow_mode_seconds")
        .eq("slug", slug)
        .maybeSingle();
      if (!data) setMissing(true);
      else setChannel(data as Channel);
    })();
  }, [slug]);

  useEffect(() => {
    if (channel || missing) markContentReady();
  }, [channel, missing, markContentReady]);

  // Clear unread @mention notifications for this channel when the user views it.
  // This makes the AtSign badge and per-channel counters reset on read.
  useEffect(() => {
    if (!user || !slug) return;
    void supabase
      .from("user_notifications")
      .delete()
      .eq("user_id", user.id)
      .eq("kind", "mention")
      .eq("link_path", `/home/${slug}`);
  }, [slug, user?.id]);

  // Check if current user can send in this channel
  useEffect(() => {
    if (!channel || !user) {
      setCanSend(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("can_in_channel", {
        _user: user.id,
        _channel: channel.id,
        _action: "send",
      });
      if (!cancelled) setCanSend(error ? true : !!data);
    })();
    return () => {
      cancelled = true;
    };
  }, [channel?.id, user?.id]);

  // Load messages + subscribe
  useEffect(() => {
    if (!channel) return;
    // Reset scroll/unread tracking when switching channels
    initialScrollDoneRef.current = false;
    setFirstUnreadId(null);
    lastReadAtRef.current = null;
    latestMessageRef.current = null;
    setBaselineReadAt(null);
    let cancelled = false;
    (async () => {
      // Fetch the persisted last-read marker BEFORE messages so the
      // initial-scroll effect and read/unread labels use the stored value.
      if (user) {
        const { data: readRow } = await supabase
          .from("channel_reads")
          .select("last_read_at")
          .eq("user_id", user.id)
          .eq("channel_id", channel.id)
          .maybeSingle();
        if (cancelled) return;
        if (readRow?.last_read_at) {
          lastReadAtRef.current = readRow.last_read_at;
          setBaselineReadAt(readRow.last_read_at);
        }
      }

      const { data } = await supabase
        .from("chat_messages")
        .select("id, channel_id, sender_id, content, created_at, pinned_at, pinned_by, reply_to")
        .eq("channel_id", channel.id)
        .order("created_at", { ascending: true })
        .limit(200);
      if (cancelled) return;
      const rows = (data as Message[] | null) ?? [];
      latestMessageRef.current = rows[rows.length - 1] ?? null;
      setMessages(rows);
      if (user) {
        const mine = [...rows].reverse().find((r) => r.sender_id === user.id);
        setLastSentAt(mine ? new Date(mine.created_at).getTime() : null);
      }
      await loadProfiles(rows.map((r) => r.sender_id));
      if (rows.length > 0) {
        const { data: reactRows } = await supabase
          .from("message_reactions")
          .select("id, message_id, user_id, emoji")
          .in(
            "message_id",
            rows.map((r) => r.id),
          );
        if (!cancelled) setReactions((reactRows as Reaction[] | null) ?? []);
      } else {
        setReactions([]);
      }
    })();

    const ch = supabase
      .channel(`chat:${channel.id}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `channel_id=eq.${channel.id}`,
        },
        async (payload) => {
          const m = payload.new as Message;
          latestMessageRef.current = m;
          setMessages((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m]));
          await loadProfiles([m.sender_id]);
          if (document.visibilityState === "visible") persistLastRead(m.created_at);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_channels",
          filter: `id=eq.${channel.id}`,
        },
        (payload) => {
          const updated = payload.new as Channel;
          setChannel((prev) => (prev ? { ...prev, ...updated } : prev));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "chat_messages",
          filter: `channel_id=eq.${channel.id}`,
        },
        (payload) => {
          const old = payload.old as { id: string };
          setMessages((prev) => prev.filter((m) => m.id !== old.id));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_messages",
          filter: `channel_id=eq.${channel.id}`,
        },
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
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        (payload) => {
          const updated = payload.new as Profile;
          setProfiles((prev) =>
            prev[updated.id]
              ? { ...prev, [updated.id]: { ...prev[updated.id], ...updated } }
              : prev,
          );
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
      .select("id, display_name, username, avatar_url, equipped_nameplate_id, custom_status, last_seen_at")
      .in("id", need);
    if (!data) return;
    setProfiles((prev) => {
      const next = { ...prev };
      for (const p of data as Profile[]) next[p.id] = p;
      return next;
    });
  };

  useEffect(() => {
    if (!scrollRef.current || messages.length === 0) return;
    const el = scrollRef.current;
    if (!initialScrollDoneRef.current) {
      // First render of this channel: jump to first unread, else bottom.
      const lr = lastReadAtRef.current;
      // With no saved marker this is the user's first visit, so the first
      // message from another user is genuinely unread rather than silently
      // suppressing the divider and every Unread badge.
      const firstUnread = lr
        ? messages.find((m) => m.created_at > lr && m.sender_id !== user?.id)
        : messages.find((m) => m.sender_id !== user?.id);
      if (firstUnread) {
        setFirstUnreadId(firstUnread.id);
        // Defer to next frame so the divider DOM exists before scrolling.
        requestAnimationFrame(() => {
          firstUnreadRef.current?.scrollIntoView({ block: "start" });
        });
      } else {
        el.scrollTo({ top: el.scrollHeight });
      }
      initialScrollDoneRef.current = true;
      const latest = messages[messages.length - 1];
      if (latest) persistLastRead(latest.created_at);
    } else if (isAtBottom()) {
      // New message arrived while user is at the bottom -> follow it.
      el.scrollTo({ top: el.scrollHeight });
      const latest = messages[messages.length - 1];
      if (latest) persistLastRead(latest.created_at);
    }
  }, [messages, user?.id]);

  useEffect(() => {
    if (!channel || !user) return;
    const markVisibleMessagesRead = () => {
      if (document.visibilityState !== "visible") return;
      const latest = latestMessageRef.current;
      if (latest) persistLastRead(latest.created_at);
    };
    const timer = window.setTimeout(markVisibleMessagesRead, READ_DELAY_MS);
    document.addEventListener("visibilitychange", markVisibleMessagesRead);
    window.addEventListener("focus", markVisibleMessagesRead);
    window.addEventListener("online", markVisibleMessagesRead);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", markVisibleMessagesRead);
      window.removeEventListener("focus", markVisibleMessagesRead);
      window.removeEventListener("online", markVisibleMessagesRead);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.id, user?.id, messages.length]);

  // Mark as read when leaving the channel (or on unmount).
  useEffect(() => {
    return () => {
      if (!channel || !user) return;
      const latest = latestMessageRef.current;
      if (!latest) return;
      void supabase
        .from("channel_reads")
        .upsert(
          { user_id: user.id, channel_id: channel.id, last_read_at: latest.created_at },
          { onConflict: "user_id,channel_id" },
        );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.id, user?.id]);

  const send = async (overrideText?: unknown) => {
    // A confirmed `/` shortcut passes its sentence straight in and skips the composer.
    const directText = typeof overrideText === "string" ? overrideText : null;
    if (!user || !channel || (!(directText ?? draft).trim() && !pendingGif)) return;
    if (channel.slow_mode_seconds > 0 && !isModOrAdmin && lastSentAt) {
      const remain = channel.slow_mode_seconds * 1000 - (Date.now() - lastSentAt);
      if (remain > 0) {
        toast.error(`Slow mode: wait ${Math.ceil(remain / 1000)}s.`);
        return;
      }
    }
    setSending(true);
    // Keep the formatted HTML when the toolbar was used, otherwise send plain text.
    const richHtml = directText ? "" : draftHtml.trim();
    const originalContent = directText ?? (richHtml && isRichChatContent(richHtml) ? richHtml : draft.trim());
    const originalGif = pendingGif;
    const originalPlain = draft.trim();
    const originalHtml = richHtml;
    const restoreDraft = () => {
      setDraft(originalPlain);
      setDraftHtml(originalHtml);
      if (taRef.current) taRef.current.innerHTML = originalHtml;
    };
    let content = directText ?? pendingGif ?? originalContent;
    // A confirmed `/` shortcut sends on its own; whatever the user was already
    // typing (and any attached GIF) must stay untouched in the composer.
    if (!directText) {
      setDraft("");
      setDraftHtml("");
      if (taRef.current) taRef.current.innerHTML = "";
      setPendingGif(null);
    }
    if (/^https?:\/\/\S+$/i.test(content) && /(tenor\.com|giphy\.com|gph\.is)\//i.test(content)) {
      setUploadingPaste(true);
      try {
        const resolved = await resolveGif({ data: { url: content } });
        if (!resolved.url) {
          toast.error("That GIF could not be loaded. Please choose it again.");
          restoreDraft();
          setPendingGif(originalGif);
          setSending(false);
          return;
        }
        content = resolved.url;
      } catch {
        toast.error("That GIF could not be loaded. Please choose it again.");
        restoreDraft();
        setPendingGif(originalGif);
        setSending(false);
        return;
      } finally {
        setUploadingPaste(false);
      }
    }
    const { error } = await supabase.from("chat_messages").insert({
      channel_id: channel.id,
      sender_id: user.id,
      content,
      reply_to: replyTo?.id ?? null,
    });
    if (error) {
      const msg = error.message || "";
      const isPermission =
        /row-level security|permission denied|violates.*policy|not allowed|forbidden/i.test(msg);
      toast.error(
        msg.includes("@all") || msg.includes("@here")
          ? "Only owner and management can use @all or @here."
          : isPermission
            ? "You don't have permission to send messages in this channel."
            : msg,
      );
      restoreDraft();
      setPendingGif(originalGif);
    } else {
      setLastSentAt(Date.now());
      setReplyTo(null);
    }

    setSending(false);
  };

  /** Insert an emote at the caret in the composer. */
  const insertEmoji = (emoji: string) => {
    const ta = taRef.current;
    if (!ta) {
      setDraft((d) => d + emoji);
      return;
    }
    const selection = window.getSelection();
    const range =
      selection?.rangeCount && ta.contains(selection.anchorNode) ? selection.getRangeAt(0) : null;
    const beforeRange = range?.cloneRange();
    beforeRange?.selectNodeContents(ta);
    if (range) beforeRange?.setEnd(range.startContainer, range.startOffset);
    const start = beforeRange?.toString().length ?? draft.length;
    const selectedLength = range?.toString().length ?? 0;
    const end = start + selectedLength;
    const next = draft.slice(0, start) + emoji + draft.slice(end);
    setDraft(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.textContent = next;
      const node = ta.firstChild;
      if (!node) return;
      const range = document.createRange();
      range.setStart(node, Math.min(start + emoji.length, node.textContent?.length ?? 0));
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
  };

  /** Upload a pasted image/GIF and hold it as an attachment until Enter or Send. */
  const sendPastedImages = async (files: File[]) => {
    if (!user || !channel || files.length === 0) return;
    setUploadingPaste(true);
    for (const file of files) {
      const ext = (file.type.split("/")[1] || "png").split("+")[0];
      const path = `${user.id}/chat/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { contentType: file.type, cacheControl: "3600", upsert: false });
      if (upErr) {
        toast.error(upErr.message || "Could not upload pasted image");
        continue;
      }
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      setPendingGif(data.publicUrl);
      break;
    }
    setUploadingPaste(false);
  };

  /**
   * The Windows GIF tray copies a Tenor/Giphy share link instead of the image
   * itself. Resolve it to a direct animated URL and attach it to the composer.
   */
  const sendPastedGifLink = async (rawUrl: string) => {
    setUploadingPaste(true);
    try {
      if (/\.(gif|webp|png|jpe?g)(\?|$)/i.test(rawUrl)) {
        setPendingGif(rawUrl);
        return;
      }
      const res = await resolveGif({ data: { url: rawUrl } });
      if (!res.url) {
        toast.error("That GIF could not be loaded. Please choose it again.");
        return;
      }
      setPendingGif(res.url);
    } catch {
      toast.error("That GIF could not be loaded. Please choose it again.");
    } finally {
      setUploadingPaste(false);
    }
  };

  const gifCandidateFromTransfer = (transfer: DataTransfer | null): string | null => {
    if (!transfer) return null;
    const plain = (
      transfer.getData("text/uri-list") ||
      transfer.getData("text/plain") ||
      ""
    ).trim();
    const html = transfer.getData("text/html") || "";
    const htmlImg = html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] ?? "";
    const htmlLink = html.match(/<a[^>]+href=["']([^"']+)["']/i)?.[1] ?? "";
    return (
      [plain, htmlImg, htmlLink].find(
        (value) =>
          value &&
          !/\s/.test(value) &&
          /^https?:\/\//i.test(value) &&
          (/(tenor\.com|giphy\.com|gph\.is)\//i.test(value) ||
            /\.(gif|gifv|webp|png|jpe?g)(\?|$)/i.test(value)),
      ) ?? null
    );
  };

  const imageFilesFromTransfer = (transfer: DataTransfer | null): File[] => {
    if (!transfer) return [];
    const files = Array.from(transfer.files).filter((file) => file.type.startsWith("image/"));
    if (files.length) return files;
    return Array.from(transfer.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
  };

  const attachGifTransfer = (transfer: DataTransfer | null): boolean => {
    const files = imageFilesFromTransfer(transfer);
    if (files.length) {
      void sendPastedImages(files);
      return true;
    }
    const candidate = gifCandidateFromTransfer(transfer);
    if (candidate) {
      void sendPastedGifLink(candidate);
      return true;
    }
    return false;
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
    setEditDraftHtml(
      isRichChatContent(m.content)
        ? m.content
        : m.content
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\n/g, "<br>"),
    );
    setOpenMenuId(null);
  };

  const saveEdit = async (id: string) => {
    const editor = editEditorRef.current;
    const content = (editor?.innerHTML.trim() || editDraftHtml.trim()).replace(/<br\s*\/?>$/i, "");
    if (!content) return;
    const { error } = await supabase
      .from("chat_messages")
      .update({ content, edited_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    setEditingId(null);
    setEditDraft("");
    setEditDraftHtml("");
  };

  const setSlowMode = async (seconds: number) => {
    if (!channel || !canManageSlow) return;
    const { error } = await supabase
      .from("chat_channels")
      .update({ slow_mode_seconds: seconds })
      .eq("id", channel.id);
    if (error) return toast.error(error.message);
    setChannel({ ...channel, slow_mode_seconds: seconds });
    toast.success(seconds > 0 ? `Slow mode: ${formatSlow(seconds)}` : "Slow mode off");
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

  // Populate and focus the full-size edit composer when editing starts.
  useEffect(() => {
    if (editingId && editEditorRef.current) {
      editEditorRef.current.innerHTML = editDraftHtml;
      editEditorRef.current.focus();
    }
  }, [editingId]);

  // Tick once a second while slow mode cooldown is active.
  useEffect(() => {
    if (!channel || channel.slow_mode_seconds <= 0 || isModOrAdmin || !lastSentAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [channel?.slow_mode_seconds, isModOrAdmin, lastSentAt]);

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

  const slowRemaining = (() => {
    if (!channel || channel.slow_mode_seconds <= 0 || isModOrAdmin || !lastSentAt) return 0;
    const r = channel.slow_mode_seconds * 1000 - (now - lastSentAt);
    return r > 0 ? Math.ceil(r / 1000) : 0;
  })();

  const isMuted = !!myMuteExpires && myMuteExpires.getTime() > Date.now();
  const muteCountdown = (() => {
    if (!isMuted || !myMuteExpires) return "";
    void muteTick;
    const total = Math.max(0, Math.floor((myMuteExpires.getTime() - Date.now()) / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
  })();

  return (
    <main className="flex h-full max-h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className={cn("relative z-[60] flex shrink-0 flex-col items-stretch gap-2 border-b border-border px-2 py-2 md:flex-row md:items-center md:gap-3 md:px-5 md:py-0")}>
        <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-primary/30 bg-card/50 px-3 py-1.5 shadow-[0_0_20px_-4px_color-mix(in_oklab,var(--primary)_35%,transparent),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl">
          <Icon className="size-4 text-primary" />
          <h1 className="min-w-0 truncate font-display font-semibold text-foreground">{channel.name}</h1>
          {channel.staff_only && (
            <span className="ml-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20">
              staff
            </span>
          )}
        </div>
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto rounded-2xl border border-primary/30 bg-card/50 px-2 py-1.5 shadow-[0_0_24px_-4px_color-mix(in_oklab,var(--primary)_40%,transparent),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl scrollbar-hide md:ml-auto md:px-3 md:py-2">
          <div className="flex shrink-0 items-center gap-1.5 md:hidden">
            <button
              type="button"
              onClick={() => {
                setSideTab("staff");
                setMobilePeopleOpen(true);
              }}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface-2/60 px-3 py-1.5 text-xs font-semibold text-foreground"
              aria-label="Open staff list"
            >
              <UserRoundCog className="size-4 shrink-0 text-primary" />
              Staff
            </button>
            {!hideMembersPanel && (
              <button
                type="button"
                onClick={() => {
                  setSideTab("members");
                  setMobilePeopleOpen(true);
                }}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface-2/60 px-3 py-1.5 text-xs font-semibold text-foreground"
                aria-label="Open members list"
              >
                <Users className="size-4 shrink-0 text-primary" />
                Members
              </button>
            )}
          </div>
          <Sheet open={mobilePeopleOpen} onOpenChange={setMobilePeopleOpen}>
            <SheetContent side="right" className="flex h-dvh w-[min(92vw,24rem)] flex-col gap-0 border-l border-border bg-surface p-0">
              {!hideMembersPanel && (
                <div className="grid shrink-0 grid-cols-2 gap-1 border-b border-border p-2 pr-12">
                  {(["staff", "members"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setSideTab(tab)}
                      className={cn(
                        "rounded-md px-3 py-2 text-xs font-semibold uppercase transition-colors",
                        sideTab === tab
                          ? "bg-primary/20 text-primary ring-1 ring-primary/40"
                          : "text-muted-foreground hover:bg-surface-2",
                      )}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              )}
              <div className={cn("min-h-0 flex-1 overflow-hidden", hideMembersPanel && "pt-10")}>
                {hideMembersPanel || sideTab === "staff" ? (
                  <StaffOnDutySidebar channelId={channel?.id ?? null} />
                ) : (
                  <TalkChannelMembersPanel channelId={channel?.id ?? null} />
                )}
              </div>
            </SheetContent>
          </Sheet>
          {!hideMembersPanel && <span className="hidden md:block"><OnlineMembersDialog /></span>}
          <WorkingStatusBox variant="header" />
          {canManageSlow && (
            <button
              onClick={() => setSlowMode(channel.slow_mode_seconds > 0 ? 0 : 30)}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface-2/60 hover:bg-surface-2 border border-white/10 hover:border-white/20 transition-all cursor-pointer group shadow-lg shadow-black/20"
              title={channel.slow_mode_seconds > 0 ? "Disable slow mode" : "Enable 30s slow mode"}
            >
              <Timer className="size-4 text-success group-hover:rotate-12 transition-transform" />
              <span className="hidden text-xs font-semibold tracking-wide text-foreground/90 transition-colors group-hover:text-foreground sm:inline">
                Slow mode {channel.slow_mode_seconds > 0 ? "on" : "off"}
              </span>
            </button>
          )}
          <div className="relative">
            {pinnedMessages.length > 0 && (
              <button
                onClick={() => setPinnedOpen((v) => !v)}
                className={cn(
                  "group relative flex items-center gap-2 rounded-full transition-all duration-300 cursor-pointer overflow-hidden",
                  pinnedOpen
                    ? "px-3.5 py-1.5 bg-primary/15 border border-primary/60 shadow-[0_0_20px_-4px_color-mix(in_oklab,var(--primary)_35%,transparent)]"
                    : "pl-1 pr-3.5 py-1 bg-gradient-to-r from-primary/20 via-fuchsia-500/15 to-primary/10 border border-primary/40 hover:border-primary/70 shadow-[0_0_16px_-4px_color-mix(in_oklab,var(--primary)_25%,transparent)] hover:shadow-[0_0_24px_-4px_color-mix(in_oklab,var(--primary)_45%,transparent)]",
                )}
                title="Pinned messages"
              >
                <span className={cn(
                  "flex items-center justify-center rounded-full shrink-0 transition-all",
                  pinnedOpen ? "size-7 bg-primary/20" : "size-7 bg-primary/25 group-hover:bg-primary/35 group-hover:scale-110"
                )}>
                  <Pin className={cn(
                    "size-3.5 transition-transform",
                    pinnedOpen ? "text-primary fill-primary/30 rotate-45" : "text-primary fill-primary/20 group-hover:-translate-y-0.5"
                  )} />
                </span>
                <span className={cn(
                  "text-xs font-bold transition-colors",
                  pinnedOpen ? "text-primary" : "text-foreground/90 group-hover:text-foreground"
                )}>
                  {pinnedMessages.length}
                </span>
                <span className="text-[9px] font-semibold text-primary/80 uppercase tracking-wider hidden sm:inline">
                  pinned
                </span>

              </button>
            )}
            {pinnedMessages.length === 0 && (
              <button
                onClick={() => setPinnedOpen((v) => !v)}
                className="flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-surface-2/60 px-2.5 py-1.5 shadow-lg shadow-black/20 transition-all hover:border-white/20 hover:bg-surface-2 md:px-3.5"
                title="Pinned messages"
              >
                <Pin className="size-4 text-primary/60 group-hover:-translate-y-0.5 transition-transform" />
                <span className="text-xs font-bold text-foreground/60">0</span>
              </button>
            )}
            {pinnedOpen && (
               <div className="fixed inset-x-2 top-28 z-[100] max-h-[70vh] overflow-y-auto rounded-2xl border-2 border-primary/60 bg-surface shadow-[0_24px_70px_-12px_rgb(0_0_0/0.75),0_0_60px_-12px_color-mix(in_oklab,var(--primary)_55%,transparent)] animate-scale-in sm:left-auto sm:right-4 sm:w-[440px] md:right-[14.75rem] xl:right-[16.75rem]">
                <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b-2 border-primary/30 bg-surface">
                  <div className="flex items-center gap-2">
                    <Pin className="size-4 text-primary fill-primary/40" />
                    <span className="text-sm font-extrabold uppercase tracking-wider text-primary">
                      Pinned messages
                    </span>

                  </div>
                  <button
                    onClick={() => setPinnedOpen(false)}
                    className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                {pinnedMessages.length === 0 ? (
                  <div className="p-6 text-center text-xs text-muted-foreground">
                    No pinned messages yet.
                  </div>
                ) : (
                  <ul className="p-3 space-y-3">
                    {pinnedMessages.map((m, idx) => {
                      const p = profiles[m.sender_id];
                      const name = p?.display_name ?? p?.username ?? "Unknown";
                      return (
                        <li
                          key={m.id}
                          className="p-4 rounded-xl border border-primary/30 bg-surface-2 shadow-[0_6px_24px_-10px_rgb(0_0_0/0.8)] hover:border-primary/60 transition-all animate-fade-in"
                          style={{ animationDelay: `${idx * 60}ms` }}
                        >
                          <div className="flex items-baseline justify-between gap-2 mb-2">
                            <span
                              className={cn(
                                "text-sm font-bold",
                                roleFlashClass(roleFlashMap.get(m.sender_id)),
                              )}
                            >
                              {name}
                            </span>
                            <span className="text-[11px] text-muted-foreground shrink-0">
                              {new Date(m.created_at).toLocaleDateString("en-GB")}
                            </span>
                          </div>
                          {(() => {
                            const img = extractImageUrl(m.content);
                            if (img) {
                              return (
                                <div className="space-y-2">
                                  <img
                                    src={img.url}
                                    alt="Pinned image"
                                    loading="lazy"
                                    className="max-w-full max-h-[240px] w-auto h-auto rounded-lg border border-border"
                                  />
                                  {img.rest && (
                                    <MentionText
                                      content={img.rest}
                                      currentUsername={myUsername}
                                      className="text-sm leading-relaxed text-foreground break-words [overflow-wrap:anywhere]"
                                    />
                                  )}
                                </div>
                              );
                            }
                            return (
                              <MentionText
                                content={m.content}
                                currentUsername={myUsername}
                                className="text-sm leading-relaxed text-foreground break-words [overflow-wrap:anywhere]"
                              />
                            );
                          })()}

                          {canPin && (
                            <button
                              onClick={() => togglePin(m)}
                              className="mt-2 text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors"
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
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface-2/60 hover:bg-surface-2 border border-white/10 hover:border-white/20 transition-all cursor-pointer group shadow-lg shadow-black/20"
              title="Ignored users"
            >
              <ShieldOff className="size-4 text-destructive group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold text-foreground/90">{ignoredIds.size}</span>
            </button>
            {ignoredOpen && (
              <div className="fixed inset-x-2 top-32 z-30 max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-popover shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 sm:max-h-96">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Ignored users
                  </span>
                  <button
                    onClick={() => setIgnoredOpen(false)}
                    className="text-muted-foreground hover:text-foreground"
                  >
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
                          <li
                            key={id}
                            className="p-3 flex items-center gap-3 hover:bg-surface-2/40"
                          >
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
                              src={resolveAvatarUrl(id, p?.avatar_url, roleFlashMap)}
                              alt=""
                              className="size-8 rounded-full object-cover shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium truncate">{name}</div>
                              {p?.username && (
                                <div className="text-[11px] text-muted-foreground truncate">
                                  @{p.username}
                                </div>
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
                            toast.success(
                              `Unblocked ${ids.length} user${ids.length === 1 ? "" : "s"}.`,
                            );
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
        </div>
      </header>
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
           <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-2 py-3 [overflow-anchor:auto] sm:px-5 sm:py-4">
            {channel.slug !== "welcome" && channel.slug !== "rules" && (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-xs text-muted-foreground">
                <Trash2 className="size-3.5 text-primary shrink-0" />
                <span>
                  Messages in this channel are automatically cleared every 24 hours. Pinned messages
                  are kept.
                </span>
              </div>
            )}
            {messages.length === 0
              ? null
              : messages
                  .filter((m) => !ignoredIds.has(m.sender_id) || m.sender_id === user?.id)
                  .map((m) => {
                    const p = profiles[m.sender_id];
                    const name = p?.display_name ?? p?.username ?? "Unknown";
                    const initial = (name || "?").slice(0, 1).toUpperCase();
                    const canDelete = m.sender_id === user?.id || isAdmin;
                    const isSelf = m.sender_id === user?.id;
                    const isStaff = staffIds.has(m.sender_id);
                    const isIgnored = ignoredIds.has(m.sender_id);
                    const highlight = mentionsCurrentUser(m.content, myUsername, roles);
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
                    void readTick;
                    const isUnread =
                      !isSelf &&
                      (baselineReadAt === null || m.created_at > baselineReadAt) &&
                      !isReadByDwell(m.id);
                    const showUnreadDivider = m.id === firstUnreadId && isUnread;
                    const parent = m.reply_to
                      ? messages.find((x) => x.id === m.reply_to)
                      : undefined;
                    const parentProfile = parent ? profiles[parent.sender_id] : undefined;
                    const parentName =
                      parentProfile?.display_name ?? parentProfile?.username ?? "Unknown";
                    const senderRole = roleFlashMap.get(m.sender_id) ?? null;
                    const senderMiniProfile = {
                      userId: m.sender_id,
                      name,
                      username: p?.username ?? null,
                      avatarUrl: resolveAvatarUrl(m.sender_id, p?.avatar_url, roleFlashMap),
                      hasAvatar:
                        !!p?.avatar_url ||
                        senderRole === "staff" ||
                        senderRole === "management" ||
                        senderRole === "moderator",
                      nameplateId: p?.equipped_nameplate_id ?? null,
                      role: senderRole,
                      isOnline: p?.id ? onlineUsers.has(p.id) : false,
                      lastSeenAt: p?.last_seen_at ?? null,
                      customStatus: p?.custom_status ?? null,
                      isSelf,
                    };
                    const senderFallbackRow = {
                      display_name: p?.display_name ?? null,
                      username: p?.username ?? null,
                      avatar_url: p?.avatar_url ?? null,
                      equipped_nameplate_id: p?.equipped_nameplate_id ?? null,
                      roles: null,
                      created_at: null,
                      last_seen_at: p?.last_seen_at ?? null,
                    };

                    return (
                      <div key={m.id} className="[overflow-anchor:auto]">
                        {showUnreadDivider && (
                          <div
                            ref={firstUnreadRef}
                            className="flex scroll-mt-20 items-center gap-3 my-3"
                            aria-label="Unread messages start here"
                          >
                            <div className="h-0.5 flex-1 bg-destructive" />
                            <span className="rounded-full border border-destructive bg-destructive/15 px-3 py-1 text-xs font-bold uppercase text-destructive">
                              Unread messages
                            </span>
                            <div className="h-0.5 flex-1 bg-destructive" />
                          </div>
                        )}
                        <div
                          id={`msg-${m.id}`}
                          className={cn(
                            "group relative mb-4 flex items-start gap-1.5 rounded-xl transition-colors scroll-mt-24 sm:gap-3",
                            flashMsgId === m.id && "ring-2 ring-primary bg-primary/10",
                          )}
                        >
                          {(() => {
                            const resolvedAvatar = resolveAvatarUrl(
                              m.sender_id,
                              p?.avatar_url,
                              roleFlashMap,
                            );
                            const hasAvatar =
                              !!p?.avatar_url ||
                              roleFlashMap.get(m.sender_id) === "staff" ||
                              roleFlashMap.get(m.sender_id) === "management" ||
                              roleFlashMap.get(m.sender_id) === "moderator";
                            const profileId = p?.id;
                            const isOnline = profileId ? onlineUsers.has(profileId) : false;
                            const rawAvatarEl = hasAvatar ? (
                              <img
                                src={resolvedAvatar}
                                alt=""
                                className="size-9 rounded-full object-cover shrink-0 mt-1"
                              />
                            ) : (
                              <div className="size-9 rounded-full bg-gradient-primary grid place-items-center text-xs font-semibold text-primary-foreground shrink-0 mt-1">
                                {initial}
                              </div>
                            );
                            const avatarEl = (
                              <TalkMemberMiniProfile
                                userId={m.sender_id}
                                online={senderMiniProfile.isOnline}
                                fallback={senderFallbackRow}
                              >
                                {rawAvatarEl}
                              </TalkMemberMiniProfile>
                            );
                            return (
                              // Fixed-width column: the presence label text changes over
                              // time ("Online" -> "Active 5 minutes ago"), so a fluid
                              // width would shift the whole message row sideways.
                              <div className="mt-0.5 flex w-11 shrink-0 flex-col items-center gap-0.5 sm:w-16">
                                {avatarEl}
                                 <div className="flex h-4 w-11 items-center justify-center gap-1 text-[9px] text-muted-foreground sm:w-16 sm:text-[10px]">
                                  {profileId && (
                                    <>
                                    <PresenceMiniDot userId={profileId} isOnline={isOnline} />
                                    <span className="min-w-0 truncate">
                                      <PresenceMiniLabel
                                        userId={profileId}
                                        isOnline={isOnline}
                                        offlineText={`Active ${formatLastSeen(p?.last_seen_at)}`}
                                      />
                                    </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })()}

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <div className="flex flex-col min-w-0">
                                <TalkMemberMiniProfile
                                  userId={m.sender_id}
                                  online={senderMiniProfile.isOnline}
                                  fallback={senderFallbackRow}
                                  className="min-w-0"
                                >
                                  <Nameplate
                                    id={p?.equipped_nameplate_id}
                                     className="inline-flex h-7 max-h-7 min-w-0 max-w-full items-center rounded-md px-2 py-1 pr-7 shadow-sm isolate sm:px-3 sm:pr-12"
                                    fallbackStyle={{
                                      background:
                                        "linear-gradient(135deg, #1a4a2a 0%, #2d6a3f 50%, #1a4a2a 100%)",
                                    }}
                                  >
                                    <span
                                      className={cn(
                                        "relative z-10 font-semibold text-sm truncate px-2 -mx-2 rounded",
                                        roleFlashClass(roleFlashMap.get(m.sender_id)),
                                      )}
                                      style={{
                                        background:
                                          "linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.35) 12%, rgba(0,0,0,0.35) 88%, transparent 100%)",
                                      }}
                                    >
                                      {name}
                                    </span>
                                  </Nameplate>
                                </TalkMemberMiniProfile>
                                <span className="block h-3 text-[10px] leading-3 text-muted-foreground truncate px-1 -mt-0.5">
                                  {p?.custom_status ?? ""}
                                </span>
                              </div>
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {new Date(m.created_at).toLocaleTimeString("en-GB", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                              <span
                                className={cn(
                                  // Fixed width so flipping Unread -> Read never nudges the row.
                                  "inline-flex w-[62px] justify-center items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase shrink-0",
                                  isUnread
                                    ? "border-destructive text-destructive bg-destructive/15"
                                    : "border-border bg-surface-2 text-muted-foreground",
                                )}
                              >
                                {isUnread ? "Unread" : "Read"}
                              </span>


                              {isPinned && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-primary">
                                  <Pin className="size-3" /> Pinned
                                </span>
                              )}
                            </div>
                            {m.reply_to && (
                              <div className="mb-1 flex items-center gap-2 rounded-lg border border-border/70 bg-surface-2/70 px-2.5 py-1.5 text-xs">
                                <Reply className="size-3.5 shrink-0 text-primary" />
                                <span className="shrink-0 font-semibold text-foreground">
                                  {parent ? parentName : "Original message"}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                                  {parent
                                    ? /^https?:\/\/\S+$/i.test(parent.content.trim())
                                      ? "Attachment"
                                      : parent.content
                                    : "This message is no longer available"}
                                </span>
                                {parent && (
                                  <button
                                    type="button"
                                    onClick={() => jumpToMessage(parent.id)}
                                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-surface-1 px-2 py-0.5 text-[10px] font-semibold text-foreground hover:bg-surface-2"
                                    title="Jump to original message"
                                  >
                                    <CornerUpRight className="size-3" /> Jump
                                  </button>
                                )}
                              </div>
                            )}
                            <div
                              className={cn(
                                "block w-full rounded-2xl px-3.5 py-2 border shadow-sm",
                                isPinned
                                  ? "bg-primary/10 border-primary/40 rounded-tl-sm ring-1 ring-primary/40 shadow-[0_0_14px_var(--primary-glow)]"
                                  : highlight
                                    ? "bg-amber-400/10 border-amber-400/40 rounded-tl-sm ring-1 ring-warning/40 shadow-[0_0_14px_var(--warning)]"
                                    : isSelf
                                      ? "bg-primary/15 border-primary/20 rounded-tl-sm"
                                      : "bg-surface-2 border-border rounded-tl-sm",
                              )}
                            >
                              {isEditing ? (
                                <div className="flex min-w-0 w-full flex-col gap-2">
                                  <div className="relative flex min-w-0 flex-wrap items-end gap-2 rounded-xl border border-primary bg-surface-2 px-2 py-2 focus-within:ring-1 focus-within:ring-primary/40 sm:flex-nowrap sm:px-3">
                                    <div
                                      ref={editEditorRef}
                                      contentEditable
                                      suppressContentEditableWarning
                                      role="textbox"
                                      aria-multiline="true"
                                      aria-label="Edit message"
                                      data-placeholder="Edit your message…"
                                      onInput={(e) => {
                                        const editor = e.currentTarget;
                                        setEditDraft(editor.innerText.replace(/\n$/, ""));
                                        setEditDraftHtml(editor.innerHTML);
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" && !e.shiftKey) {
                                          e.preventDefault();
                                          saveEdit(m.id);
                                        } else if (e.key === "Escape") {
                                          setEditingId(null);
                                          setEditDraft("");
                                          setEditDraftHtml("");
                                        }
                                      }}
                                      className="min-h-[80px] min-w-0 basis-full overflow-y-auto bg-transparent py-1 text-sm outline-none max-h-40 whitespace-pre-wrap break-words empty:before:content-[attr(data-placeholder)] empty:before:pointer-events-none empty:before:text-muted-foreground sm:basis-auto sm:flex-1"
                                    />
                                    <ChatFormatToolbar
                                      editorRef={editEditorRef}
                                      onAfterCommand={() => {
                                        const editor = editEditorRef.current;
                                        if (editor) {
                                          setEditDraft(editor.innerText.replace(/\n$/, ""));
                                          setEditDraftHtml(editor.innerHTML);
                                        }
                                      }}
                                      disabled={false}
                                    />
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                                    <button
                                      onClick={() => saveEdit(m.id)}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90"
                                    >
                                      <Check className="size-3" /> Save
                                    </button>
                                    <button
                                      onClick={() => {
                                        setEditingId(null);
                                        setEditDraft("");
                                        setEditDraftHtml("");
                                      }}
                                      className="hover:text-foreground"
                                    >
                                      Cancel
                                    </button>
                                    <span className="hidden sm:inline">Enter to save · Esc to cancel</span>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  {(() => {
                                    const gif = extractStandaloneGif(m.content);
                                    if (gif) {
                                      return (
                                        <span className="block h-[240px] w-[320px] max-w-full overflow-hidden rounded-lg border border-border bg-surface-1">
                                          <img
                                            src={gif}
                                            alt="GIF"
                                            loading="lazy"
                                            width={320}
                                            height={240}
                                            className="size-full object-contain"
                                          />
                                        </span>
                                      );
                                    }
                                    return (
                                      <ChatMessageBody
                                        content={m.content}
                                        currentUsername={myUsername}
                                        className="text-sm"
                                      />
                                    );
                                  })()}
                                  {m.edited_at && (
                                    <span className="ml-1 text-[10px] text-muted-foreground">
                                      (edited)
                                    </span>
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
                               "absolute -top-2 right-1 z-10 flex min-h-9 items-center rounded-lg border border-border bg-popover shadow-md transition-opacity sm:-top-3 sm:right-2 sm:min-h-0",
                              menuOpen || pickerOpen
                                ? "opacity-100"
                                 : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100",
                            )}
                          >
                            <button
                              onClick={() => {
                                setEmojiPickerId(pickerOpen ? null : m.id);
                                setOpenMenuId(null);
                              }}
                               className="hidden p-1.5 text-muted-foreground hover:text-foreground hover:bg-surface-2 rounded-l-lg sm:block"
                              title="Add reaction"
                            >
                              <SmilePlus className="size-4" />
                            </button>
                            <button
                              onClick={() => {
                                setReplyTo(m);
                                setOpenMenuId(null);
                                setEmojiPickerId(null);
                                taRef.current?.focus();
                              }}
                               className="hidden p-1.5 text-muted-foreground hover:text-foreground hover:bg-surface-2 border-l border-border sm:block"
                              title="Reply"
                            >
                              <Reply className="size-4" />
                            </button>
                             {canEdit && (
                               <button
                                 onClick={() => {
                                   startEdit(m);
                                   setOpenMenuId(null);
                                   setEmojiPickerId(null);
                                 }}
                                 className="grid size-9 place-items-center text-muted-foreground hover:bg-surface-2 hover:text-foreground sm:hidden"
                                 title="Edit message"
                                 aria-label="Edit message"
                               >
                                 <Pencil className="size-4" />
                               </button>
                             )}
                            {canDelete && (
                              <button
                                onClick={() => {
                                  if (
                                    window.confirm("Delete this message? This cannot be undone.")
                                  ) {
                                    remove(m.id);
                                    setOpenMenuId(null);
                                    setEmojiPickerId(null);
                                  }
                                }}
                                 className="grid size-9 place-items-center border-l border-border text-destructive hover:bg-destructive/10 sm:size-auto sm:p-1.5"
                                title="Delete message"
                                aria-label="Delete message"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setOpenMenuId(menuOpen ? null : m.id);
                                setEmojiPickerId(null);
                              }}
                               className="grid size-9 place-items-center rounded-r-lg border-l border-border text-muted-foreground hover:bg-surface-2 hover:text-foreground sm:size-auto sm:p-1.5"
                              title="More"
                               aria-label="More message actions"
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
                                    setReplyTo(m);
                                    setOpenMenuId(null);
                                    taRef.current?.focus();
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-surface-2 text-left"
                                >
                                  <Reply className="size-4" /> Reply
                                </button>
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
                                    {isPinned ? (
                                      <PinOff className="size-4" />
                                    ) : (
                                      <Pin className="size-4" />
                                    )}
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
                                    {isIgnored ? (
                                      <Eye className="size-4" />
                                    ) : (
                                      <EyeOff className="size-4" />
                                    )}
                                    {isIgnored ? "Unignore user" : "Ignore user"}
                                  </button>
                                )}
                                {canMute &&
                                  !isSelf &&
                                  !isStaff &&
                                  (mutedUserIds.has(m.sender_id) ? (
                                    <button
                                      onClick={() => {
                                        const p = profiles[m.sender_id];
                                        const name = p?.display_name ?? p?.username ?? "this user";
                                        setUnmuteTarget({ id: m.sender_id, name });
                                      }}
                                      className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-surface-2 text-left text-emerald-500"
                                    >
                                      <Mic className="size-4" /> Unmute user…
                                    </button>
                                  ) : (
                                    <div className="relative">
                                      <button
                                        onClick={() =>
                                          setMuteSubmenuId(muteSubmenuId === m.id ? null : m.id)
                                        }
                                        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-surface-2 text-left text-destructive"
                                      >
                                        <MicOff className="size-4" /> Mute user…
                                      </button>
                                      {muteSubmenuId === m.id && (
                                        <div className="absolute right-full top-0 mr-1 w-36 rounded-lg border border-border bg-popover shadow-lg py-1">
                                          <button
                                            onClick={() => muteUser(m.sender_id, 3600)}
                                            className="w-full px-3 py-1.5 text-left hover:bg-surface-2 text-sm"
                                          >
                                            Mute 1 hour
                                          </button>
                                          <button
                                            onClick={() => muteUser(m.sender_id, 10800)}
                                            className="w-full px-3 py-1.5 text-left hover:bg-surface-2 text-sm"
                                          >
                                            Mute 3 hours
                                          </button>
                                          <button
                                            onClick={() => muteUser(m.sender_id, 86400)}
                                            className="w-full px-3 py-1.5 text-left hover:bg-surface-2 text-sm"
                                          >
                                            Mute 24 hours
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                {canDelete && (
                                  <>
                                    <div className="my-1 border-t border-border" />
                                    <button
                                      onClick={() => {
                                         if (window.confirm("Delete this message? This cannot be undone.")) {
                                           remove(m.id);
                                           setOpenMenuId(null);
                                         }
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
                      </div>
                    );
                  })}
          </div>

          <div className="shrink-0 border-t border-border bg-background p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:p-4">
            {replyTo && (
              <div className="mb-2 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-2 py-2 text-xs sm:flex sm:px-3">
                <Reply className="size-3.5 shrink-0 text-primary" />
                <span className="truncate font-semibold sm:shrink-0">
                  Replying to{" "}
                  {profiles[replyTo.sender_id]?.display_name ??
                    profiles[replyTo.sender_id]?.username ??
                    "Unknown"}
                </span>
                <span className="col-start-2 min-w-0 truncate text-muted-foreground sm:flex-1">
                  {/^https?:\/\/\S+$/i.test(replyTo.content.trim())
                    ? "Attachment"
                    : replyTo.content}
                </span>
                <button
                  type="button"
                  onClick={() => jumpToMessage(replyTo.id)}
                  className="hidden shrink-0 items-center gap-1 rounded-md border border-border bg-surface-1 px-2 py-0.5 text-[10px] font-semibold hover:bg-surface-2 sm:inline-flex"
                  title="Jump to original message"
                >
                  <CornerUpRight className="size-3" /> Jump
                </button>
                <button
                  type="button"
                  onClick={() => setReplyTo(null)}
                  className="col-start-3 row-start-1 grid size-6 shrink-0 place-items-center rounded-md hover:bg-surface-2 sm:col-auto sm:row-auto"
                  title="Cancel reply"
                  aria-label="Cancel reply"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            )}
            {pendingGif && (
              <div className="mb-2 flex items-start">
                <div className="relative overflow-hidden rounded-lg border border-border bg-surface-2 p-1">
                  <img
                    src={pendingGif}
                    alt="GIF attachment ready to send"
                    className="max-h-36 max-w-56 rounded-md object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => setPendingGif(null)}
                    className="absolute right-1 top-1 grid size-7 place-items-center rounded-md bg-background/90 text-foreground shadow hover:bg-background"
                    title="Remove GIF attachment"
                    aria-label="Remove GIF attachment"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>
            )}
            <div className="relative flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface-2 px-2 py-2 focus-within:border-primary sm:flex-nowrap sm:px-3">
              {mention.dropdown}
              {channelJump.dropdown}
              {quickSlash.dropdown}

              <div
                ref={taRef}
                contentEditable={canSend && slowRemaining <= 0 && !isMuted}
                suppressContentEditableWarning
                role="textbox"
                aria-multiline="true"
                aria-label={`Message ${channel.name}`}
                data-placeholder={
                  isMuted
                    ? `You are muted — chat unlocks in ${muteCountdown}`
                    : !canSend
                      ? `You don't have permission to send messages in this channel`
                      : slowRemaining > 0
                        ? `Slow mode: wait ${slowRemaining}s before sending another message`
                        : pendingGif
                          ? "GIF attached — press Enter or Send"
                          : `Message #${channel.name} — @ to mention · # to jump to a channel · paste or Win + . for emotes & GIFs`
                }
                onBeforeInput={(e) => {
                  const inputEvent = e.nativeEvent as InputEvent;
                  if (!inputEvent.inputType.startsWith("insert")) return;
                  if (attachGifTransfer(inputEvent.dataTransfer)) e.preventDefault();
                }}
                onInput={(e) => {
                  const editor = e.currentTarget;
                  const embedded = editor.querySelector("img")?.getAttribute("src");
                  const linked = editor.querySelector("a")?.getAttribute("href");
                  const next = editor.innerText.replace(/\n$/, "");
                  setDraft(next);
                  setDraftHtml(editor.innerHTML);
                  // Windows 11's GIF panel commonly reports a GIF URL as a plain
                  // `insertText` input rather than a paste. Detect the inserted
                  // media itself instead of relying on the browser's input type.
                  const candidate = (embedded || linked || next.trim())
                    .replace(/[\u200B-\u200D\uFEFF]/g, "")
                    .trim();
                  if (
                    /^https?:\/\/\S+$/i.test(candidate) &&
                    (/(tenor\.com|giphy\.com|gph\.is)\//i.test(candidate) ||
                      /\.(gif|gifv|webp|png|jpe?g)(\?|$)/i.test(candidate))
                  ) {
                    editor.textContent = "";
                    setDraft("");
                    void sendPastedGifLink(candidate);
                  }
                }}
                onClick={(e) => {
                  // Never let a rich GIF insertion become a navigable link inside
                  // the composer while it is being converted to an attachment.
                  if ((e.target as HTMLElement).closest("a")) e.preventDefault();
                }}
                onKeyDown={(e) => {
                  if (mention.onKeyDown(e)) return;
                  if (channelJump.onKeyDown(e)) return;
                  if (quickSlash.onKeyDown(e)) return;

                  if (e.key === " " || e.key === "Tab") {
                    const current = e.currentTarget.innerText.replace(/\n$/, "");
                    const expanded = expandQuickReply(current);
                    if (expanded) {
                      e.preventDefault();
                      setDraft(expanded);
                      requestAnimationFrame(() => {
                        const editor = taRef.current;
                        if (!editor) return;
                        const range = document.createRange();
                        range.selectNodeContents(editor);
                        range.collapse(false);
                        const sel = window.getSelection();
                        sel?.removeAllRanges();
                        sel?.addRange(range);
                      });
                      return;
                    }
                  }
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                onPaste={(e) => {
                  if (attachGifTransfer(e.clipboardData)) e.preventDefault();
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  attachGifTransfer(e.dataTransfer);
                }}
                className="min-h-10 min-w-0 basis-full overflow-y-auto bg-transparent py-1 text-sm outline-none max-h-32 whitespace-pre-wrap break-words empty:before:content-[attr(data-placeholder)] empty:before:pointer-events-none empty:before:text-muted-foreground sm:min-h-7 sm:basis-auto sm:flex-1"
              />
              {uploadingPaste && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground px-2 py-1">
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Uploading…</span>
                </div>
              )}
              {slowRemaining > 0 && (
                <div className="flex items-center gap-1 text-xs text-primary tabular-nums px-2 py-1 rounded-md bg-primary/10 border border-primary/30">
                  <Timer className="size-3.5" />
                  <span>{slowRemaining}s</span>
                </div>
              )}
              {isMuted && (
                <div className="flex items-center gap-1 text-xs text-destructive tabular-nums px-2 py-1 rounded-md bg-destructive/10 border border-destructive/30">
                  <MicOff className="size-3.5" />
                  <span>{muteCountdown}</span>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []).filter((f) =>
                    f.type.startsWith("image/"),
                  );
                  if (files.length) void sendPastedImages(files);
                  e.target.value = "";
                }}
              />
              <ChatFormatToolbar
                editorRef={taRef}
                onAfterCommand={syncComposer}
                disabled={!canSend || slowRemaining > 0 || isMuted}
              />
              <button
                type="button"
                title="Add an attachment"
                aria-label="Add an attachment"
                disabled={!canSend || slowRemaining > 0 || isMuted || uploadingPaste}
                onClick={() => fileInputRef.current?.click()}
                className="size-8 rounded-lg bg-surface-2 border border-border text-muted-foreground hover:text-foreground hover:bg-surface-2/70 grid place-items-center disabled:opacity-50"
              >
                <Plus className="size-4" />
              </button>
              <EmojiPicker
                disabled={!canSend || slowRemaining > 0 || isMuted}
                onSelect={insertEmoji}
              />

              <GifPicker
                disabled={!canSend || slowRemaining > 0 || isMuted}
                onSelect={(url) => setPendingGif(url)}
              />

              <button
                onClick={send}
                disabled={
                  sending ||
                  (!draft.trim() && !pendingGif) ||
                  !canSend ||
                  slowRemaining > 0 ||
                  isMuted
                }
                className="size-8 rounded-lg bg-primary text-primary-foreground grid place-items-center disabled:opacity-50"
              >
                {sending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
              </button>
            </div>
          </div>
        </div>
        <aside className="relative z-0 hidden h-full max-h-full min-h-0 w-56 shrink-0 overflow-hidden border-l border-border bg-surface/40 md:flex md:flex-col xl:w-64">
          {hideMembersPanel ? (
            <div className="flex-1 min-h-0 overflow-hidden">
              <StaffOnDutySidebar channelId={channel?.id ?? null} />
            </div>
          ) : (
            <>
              <div className="shrink-0 grid grid-cols-2 gap-1 border-b border-border p-1.5">
                {(["staff", "members"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSideTab(t)}
                    className={`rounded-md px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                      sideTab === t
                        ? "bg-primary/20 text-primary ring-1 ring-primary/40"
                        : "text-muted-foreground hover:bg-surface-2"
                    }`}
                  >
                    {t === "staff" ? "Staff" : "Members"}
                  </button>
                ))}
              </div>
              {isModOrAdmin && (
                <div className="shrink-0 border-b border-border px-1.5 py-1.5">
                  <QuickRepliesPill
                    onInsert={insertQuickReply}
                    onSend={(text) => void send(text)}
                    className="w-full justify-center"
                  />
                </div>
              )}
              <div className="flex h-full max-h-full min-h-0 flex-1 overflow-hidden">
                {sideTab === "staff" ? (
                  <StaffOnDutySidebar channelId={channel?.id ?? null} />
                ) : (
                  <TalkChannelMembersPanel channelId={channel?.id ?? null} />
                )}
              </div>
            </>
          )}
        </aside>

      </div>

      {isMuted && (
        <div className="pointer-events-none fixed inset-x-2 bottom-[calc(0.5rem+env(safe-area-inset-bottom))] z-50 rounded-xl border-2 border-red-500 bg-neutral-950/95 px-3 py-2 shadow-2xl shadow-red-500/30 ring-1 ring-red-500/20 backdrop-blur-md sm:left-auto sm:right-4 sm:max-w-sm sm:px-4 sm:py-3">
          <div className="flex items-start gap-3">
            <div className="grid place-items-center size-9 rounded-lg bg-red-500/15 border border-red-500/40 shrink-0">
              <MicOff className="size-5 text-red-400" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-red-400 leading-tight">
                You've been muted from chat
              </div>
              <div className="text-xs text-neutral-300 mt-1">
                Unlocks in{" "}
                <span className="font-mono font-bold text-white tabular-nums">{muteCountdown}</span>
                {myMuteExpires && (
                  <span className="text-neutral-400">
                    {" "}
                    · ends {myMuteExpires.toLocaleTimeString("en-GB")}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-neutral-400 mt-1.5">
                You can keep using the rest of the site.
              </div>
            </div>
          </div>
        </div>
      )}

      <AlertDialog
        open={!!unmuteTarget}
        onOpenChange={(o) => {
          if (!o) setUnmuteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Mic className="size-5 text-emerald-500" /> Unmute {unmuteTarget?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will immediately lift the chat mute on {unmuteTarget?.name}. They'll be able to
              send messages again right away. Are you sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unmuting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmUnmute();
              }}
              disabled={unmuting}
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              {unmuting ? "Unmuting…" : "Yes, unmute"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
