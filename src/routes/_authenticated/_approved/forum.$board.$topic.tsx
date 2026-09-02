import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ArrowLeft, Loader2, Pin, Lock, Quote, Reply as ReplyIcon, Pencil, Trash2, Send, History, Check, X, MessageSquare, Eye, FolderInput } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useFanZoneMembership } from "@/hooks/use-fan-zone";
import { useFanAliasVersion } from "@/hooks/use-fan-alias-version";
import { formatLastSeen } from "@/lib/relative-time";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HtmlEditor } from "@/components/ui/html-editor";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { isTeamSheetPost, sortTeamSheetPosts } from "@/lib/forum-team-sheet";
import { ForumPostBody } from "@/components/app/ForumPostBody";
import { ForumPostReactions } from "@/components/app/ForumPostReactions";
import { isPreparedForumPostBody, markPreparedForumPostBody, normalizeForumPostInput, prepareForumPostBody } from "@/lib/forum-embeds";
import { useMentionCandidates, type MentionCandidate } from "@/hooks/use-mention-candidates";
import { useFanBlocks } from "@/hooks/use-fan-blocks";
import { toast } from "sonner";
import { RotatingAffiliateBanner } from "@/components/app/RotatingAffiliateBanner";
import { ForumPoll, AddPollToTopic } from "@/components/app/ForumPoll";
import { BlockUserButton } from "@/components/app/BlockUserButton";
import { censorText, useProfanityWords } from "@/lib/profanity";

export const Route = createFileRoute("/_authenticated/_approved/forum/$board/$topic")({
  head: () => ({
    meta: [
      { title: "Forum Topic | Boro Fan Zone" },
      { name: "description", content: "Read and reply to a Middlesbrough supporter discussion in the Boro Fan Zone." },
      { property: "og:title", content: "Forum Topic | Boro Fan Zone" },
      { property: "og:description", content: "Read and reply to a Middlesbrough supporter discussion in the Boro Fan Zone." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TopicPage,
});

type Topic = {
  id: string;
  board_id: string;
  author_id: string;
  title: string;
  is_sticky: boolean;
  is_locked: boolean;
  view_count: number;
  reply_count: number;
};
type Board = {
  id: string;
  name: string;
  slug: string;
  affiliate_banner_url: string | null;
  affiliate_banner_link: string | null;
  affiliate_banner_alt: string | null;
};
type Post = {
  id: string;
  topic_id: string;
  author_id: string;
  body: string;
  quote_of: string | null;
  edited_at: string | null;
  is_op: boolean;
  is_pinned?: boolean;
  created_at: string;
};
type Profile = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  is_private?: boolean | null;
};
type EditEntry = { id: string; previous_body: string; edited_at: string; edited_by: string };
type Viewer = { user_id: string; alias: string; avatar: string };

type TopicPostArticleProps = {
  post: Post;
  displayIndex: number;
  author: Profile | undefined;
  currentUserId: string | null;
  canPost: boolean;
  canReact: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canBlock: boolean;
  isEditing: boolean;
  editText: string;
  mentionCandidates: MentionCandidate[];
  onReplyToPost: (post: Post) => void;
  onQuotePost: (post: Post) => void;
  onStartEdit: (post: Post) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onEditTextChange: (html: string) => void;
  onDeletePost: (post: Post) => void;
  onOpenHistory: (post: Post) => void;
  onBlocksChanged: () => void;
};

function TopicPostArticleComponent({
  post,
  displayIndex,
  author,
  currentUserId,
  canPost,
  canReact,
  canEdit,
  canDelete,
  canBlock,
  isEditing,
  editText,
  mentionCandidates,
  onReplyToPost,
  onQuotePost,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onEditTextChange,
  onDeletePost,
  onOpenHistory,
  onBlocksChanged,
}: TopicPostArticleProps) {
  const navigate = useNavigate();
  const name = author?.display_name || author?.username || "Someone";
  const profileLink = {
    to: "/fanzone/u/$userId",
    params: { userId: post.author_id },
  } as const;

  return (
    <article
      className={`boro-topic-post rounded-xl overflow-hidden transition-shadow hover:shadow-[0_14px_42px_-14px_rgba(225,27,34,0.5)] ${
        post.is_op
          ? "border-[#E11B22]/65 ring-1 ring-[#E11B22]/25"
          : post.is_pinned
            ? "border-[#F4B400]/60 ring-1 ring-[#F4B400]/25"
            : "border-white/15 hover:border-[#E11B22]/45"
      }`}
    >
      <header
        className={`boro-topic-post-header grid grid-cols-[auto_1fr_auto] gap-3 px-5 py-3 items-center border-b ${
          post.is_op ? "border-[#E11B22]/35" : post.is_pinned ? "border-[#F4B400]/30" : "border-white/10"
        }`}
      >
        <Link
          {...profileLink}
          className="size-8 rounded-full bg-gradient-to-br from-[#E11B22] to-[#8B0F14] grid place-items-center text-[11px] font-bold text-white overflow-hidden ring-2 ring-white/10 shadow-sm hover:ring-[#E11B22]/60 transition"
          title={author?.is_private ? `${name}'s profile is private` : `View ${name}'s profile`}
        >
          {author?.avatar_url ? <img src={author.avatar_url} alt="" className="size-8 object-cover" loading="lazy" decoding="async" /> : name.slice(0, 1).toUpperCase()}
        </Link>
        <div className="min-w-0">
          <Link
            {...profileLink}
            className="font-semibold text-sm text-foreground hover:text-[#E11B22] transition-colors hover:underline"
            title={author?.is_private ? `${name}'s profile is private` : `View ${name}'s profile`}
          >
            {name}
          </Link>
          {canBlock && (
            <BlockUserButton
              targetId={post.author_id}
              name={name}
              onBlocked={onBlocksChanged}
              className="ml-1"
            />
          )}
          {author?.is_private && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-white/10 text-muted-foreground text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 align-middle">
              <Lock className="size-2.5" />Private profile
            </span>
          )}
          {post.is_op && (
            <span className="ml-2 inline-block rounded-md bg-[#E11B22] text-white text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 align-middle shadow-sm">
              OP
            </span>
          )}
          {!post.is_op && post.is_pinned && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-[#F4B400] text-black text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 align-middle shadow-sm">
              <Pin className="size-2.5" />Pinned
            </span>
          )}
          <span className="text-muted-foreground text-[11px] ml-1.5">
            {displayIndex > 0 ? ` · #${displayIndex}` : ""} · {formatLastSeen(post.created_at)}
          </span>
          {post.edited_at && (
            <button onClick={() => onOpenHistory(post)} className="ml-2 inline-flex items-center gap-1 text-[10px] text-[#F4B400] hover:underline">
              <History className="size-3" />edited {formatLastSeen(post.edited_at)}
            </button>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {canPost && <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onReplyToPost(post)} title="Reply with quote"><ReplyIcon className="size-3.5" /></Button>}
          {canPost && <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onQuotePost(post)} title="Quote"><Quote className="size-3.5" /></Button>}
          {canEdit && !isEditing && <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onStartEdit(post)} title="Edit"><Pencil className="size-3.5" /></Button>}
          {canDelete && <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive/80 hover:text-destructive" onClick={() => onDeletePost(post)} title="Delete"><Trash2 className="size-3.5" /></Button>}
          {canBlock && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-[#E11B22]"
              title={`Message ${name}`}
              onClick={async () => {
                const { data, error } = await supabase.rpc("get_or_create_fan_dm_thread", { _other: post.author_id });
                if (error) return toast.error("Can't message", { description: error.message });
                navigate({ to: "/fanzone/messages/$thread", params: { thread: data as string } });
              }}
            >
              <MessageSquare className="size-3.5" />
            </Button>
          )}
        </div>
      </header>
      <div className="boro-topic-post-content px-5 py-5 sm:px-6">
        {isEditing ? (
          <div className="space-y-3">
            <HtmlEditor value={editText} onChange={onEditTextChange} mentions={mentionCandidates} imageUpload={{ userId: currentUserId }} />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={onCancelEdit}><X className="size-3.5 mr-1" />Cancel</Button>
              <Button size="sm" onClick={onSaveEdit}><Check className="size-3.5 mr-1" />Save</Button>
            </div>
          </div>
        ) : (
          <ForumPostBody html={post.body} className="boro-readable-copy" />
        )}
      </div>
      <ForumPostReactions
        postId={post.id}
        userId={currentUserId}
        canReact={canReact}
      />
    </article>
  );
}

const TopicPostArticle = memo(TopicPostArticleComponent, (prev, next) => {
  if (prev.post !== next.post) return false;
  if (prev.displayIndex !== next.displayIndex) return false;
  if (prev.currentUserId !== next.currentUserId) return false;
  if (prev.canPost !== next.canPost || prev.canReact !== next.canReact || prev.canEdit !== next.canEdit || prev.canDelete !== next.canDelete || prev.canBlock !== next.canBlock) return false;
  if (prev.isEditing !== next.isEditing) return false;
  if (next.isEditing && (prev.editText !== next.editText || prev.mentionCandidates !== next.mentionCandidates)) return false;
  const prevAuthor = prev.author;
  const nextAuthor = next.author;
  return prevAuthor?.display_name === nextAuthor?.display_name
    && prevAuthor?.username === nextAuthor?.username
    && prevAuthor?.avatar_url === nextAuthor?.avatar_url;
});

function isForumPost(value: Partial<Post> | undefined): value is Post {
  return !!value
    && typeof value.id === "string"
    && typeof value.topic_id === "string"
    && typeof value.author_id === "string"
    && typeof value.body === "string"
    && (value.quote_of === null || typeof value.quote_of === "string")
    && (value.edited_at === null || typeof value.edited_at === "string")
    && typeof value.is_op === "boolean"
    && typeof value.created_at === "string";
}

function sortPostsForTopic(a: Post, b: Post) {
  if (a.is_op && !b.is_op) return -1;
  if (!a.is_op && b.is_op) return 1;
  if (a.is_pinned && !b.is_pinned) return -1;
  if (!a.is_pinned && b.is_pinned) return 1;
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

function shouldShowInsertedReply(currentPage: number, replyCountBeforeInsert: number, repliesPerPage: number) {
  const targetPage = Math.max(1, Math.ceil((replyCountBeforeInsert + 1) / repliesPerPage));
  return targetPage === currentPage;
}

function prepareForumPostBodyForSubmit(raw: string): string {
  const normalized = normalizeForumPostInput(raw);
  if (isPreparedForumPostBody(normalized)) return normalized;
  return markPreparedForumPostBody(prepareForumPostBody(normalized, { skipDomParserFallback: true }));
}

function escapeForumQuoteText(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);
}

function quoteExcerptFromHtml(html: string): string {
  const text = html
    .replace(/<blockquote\b[^>]*>[\s\S]*?<\/blockquote>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim();
  const clipped = text.length > 650 ? `${text.slice(0, 650).trim()}…` : text;
  return escapeForumQuoteText(clipped || "quoted post").replace(/\n/g, "<br/>");
}

function TopicPage() {
  const { board: slug, topic: topicId } = Route.useParams();
  const navigate = useNavigate();
  const { user, hasAny } = useAuth();
  const isStaff = hasAny(["admin", "boro_fan_zone_moderator"]);
  const canUseSpecialMentions = hasAny(["admin", "management", "staff", "moderator"]);
  const info = useFanZoneMembership(user?.id ?? null);
  const canEnter = isStaff || hasAny(["staff"]) || info?.status === "approved";
  const aliasVersion = useFanAliasVersion();
  const mentionCandidates = useMentionCandidates(canUseSpecialMentions);
  const { blocked, reload: reloadBlocks } = useFanBlocks();
  useProfanityWords();

  const [board, setBoard] = useState<Board | null>(null);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [moderatorIds, setModeratorIds] = useState<Set<string>>(new Set());
  const [reply, setReply] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const locallyInsertedPostIdsRef = useRef<Set<string>>(new Set());
  const userIdRef = useRef<string | null>(user?.id ?? null);
  const replyBoxRef = useRef<HTMLDivElement>(null);
  const pendingReplyScrollRef = useRef(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [historyFor, setHistoryFor] = useState<Post | null>(null);
  const [history, setHistory] = useState<EditEntry[]>([]);
  const [tab, setTab] = useState<"posts" | "reply" | "teams">("posts");
  const [page, setPage] = useState(1);
  const REPLIES_PER_PAGE = 20;
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [moveOpen, setMoveOpen] = useState(false);
  const [boardList, setBoardList] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [moveTargetId, setMoveTargetId] = useState<string>("");
  const [moving, setMoving] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);

  const isBoardMod = isStaff || (user ? moderatorIds.has(user.id) : false);
  const canPost = canEnter && !!topic && !topic.is_locked;
  const canEditTitle = !!user && !!topic && (topic.author_id === user.id || isBoardMod);

  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user?.id]);

  useEffect(() => {
    if (tab !== "reply" || !pendingReplyScrollRef.current) return;
    pendingReplyScrollRef.current = false;
    replyBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [tab, reply]);

  const startEditTitle = () => {
    if (!topic) return;
    setTitleDraft(topic.title);
    setEditingTitle(true);
  };
  const saveTitle = async () => {
    if (!topic) return;
    const next = titleDraft.trim();
    if (!next) { toast.error("Title cannot be empty"); return; }
    if (next.length > 200) { toast.error("Title too long"); return; }
    if (next === topic.title) { setEditingTitle(false); return; }
    setSavingTitle(true);
    const { error } = await supabase.from("forum_topics").update({ title: next }).eq("id", topic.id);
    setSavingTitle(false);
    if (error) { toast.error(error.message); return; }
    setTopic({ ...topic, title: next });
    setEditingTitle(false);
    toast.success("Title updated");
  };

  const loadAliases = useCallback(async (ids: string[], replace = false) => {
    const unique = Array.from(new Set(ids.filter(Boolean)));
    if (unique.length === 0) {
      if (replace) setProfiles({});
      return;
    }
    const { data: aliases } = await supabase.rpc("fan_zone_aliases", { _ids: unique });
    const map: Record<string, Profile> = {};
    (aliases ?? []).forEach((a: { user_id: string; fan_alias: string | null; fan_avatar_url: string | null }) => {
      map[a.user_id] = {
        id: a.user_id,
        display_name: a.fan_alias ?? "Boro Fan",
        username: null,
        avatar_url: a.fan_avatar_url ?? null,
      };
    });
    // Fan Zone privacy only — never mix in BM Support profile identity here.
    const { data: fanRows } = await supabase.rpc("fan_zone_privacy", { _ids: unique });
    (fanRows ?? []).forEach((m: { user_id: string; is_private: boolean | null }) => {
      const existing = map[m.user_id] ?? { id: m.user_id, display_name: "Boro Fan", username: null, avatar_url: null };
      map[m.user_id] = { ...existing, is_private: m.is_private };
    });
    setProfiles((prev) => (replace ? map : { ...prev, ...map }));
  }, []);

  const load = useCallback(async () => {
    const { data: t } = await supabase
      .from("forum_topics")
      .select("id, board_id, author_id, title, is_sticky, is_locked, view_count, reply_count")
      .eq("id", topicId)
      .maybeSingle();
    if (!t) { setTopic(null); setPosts([]); return; }
    setTopic(t as Topic);
    const { data: b } = await supabase
      .from("forum_boards")
      .select("id, name, slug, affiliate_banner_url, affiliate_banner_link, affiliate_banner_alt")
      .eq("id", (t as Topic).board_id)
      .maybeSingle();
    setBoard((b as Board | null) ?? null);
    const { data: mods } = await supabase.from("forum_board_moderators").select("user_id").eq("board_id", (t as Topic).board_id);
    setModeratorIds(new Set(((mods ?? []) as { user_id: string }[]).map((m) => m.user_id)));
    const from = (page - 1) * REPLIES_PER_PAGE;
    const to = from + REPLIES_PER_PAGE - 1;
    const { data: opRows } = await supabase
      .from("forum_posts")
      .select("id, topic_id, author_id, body, quote_of, edited_at, is_op, is_pinned, created_at")
      .eq("topic_id", topicId)
      .eq("is_op", true)
      .order("created_at")
      .limit(1);
    const { data: pinnedRows } = await supabase
      .from("forum_posts")
      .select("id, topic_id, author_id, body, quote_of, edited_at, is_op, is_pinned, created_at")
      .eq("topic_id", topicId)
      .eq("is_op", false)
      .eq("is_pinned", true)
      .order("created_at");
    const { data: replyRows } = await supabase
      .from("forum_posts")
      .select("id, topic_id, author_id, body, quote_of, edited_at, is_op, is_pinned, created_at")
      .eq("topic_id", topicId)
      .eq("is_op", false)
      .eq("is_pinned", false)
      .order("created_at")
      .range(from, to);
    const list = [
      ...((opRows ?? []) as Post[]),
      ...((pinnedRows ?? []) as Post[]),
      ...((replyRows ?? []) as Post[]),
    ];
    setPosts(list);
    await loadAliases(list.map((p) => p.author_id), true);
  }, [loadAliases, page, topicId]);

  useEffect(() => {
    if (!canEnter) return;
    void supabase.rpc("forum_increment_view", { _topic: topicId });
  }, [topicId, canEnter]);

  // Keep the newest `load` reachable without making it a subscription dep —
  // otherwise every page/alias change tears down and re-subscribes the channel.
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);

  useEffect(() => {
    if (!canEnter) return;
    void loadRef.current();
  }, [topicId, canEnter, page, aliasVersion]);

  useEffect(() => {
    if (!canEnter) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const scheduleLoad = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => { t = null; void loadRef.current(); }, 400);
    };
    type ForumRealtimePayload = { new?: Record<string, unknown>; old?: Record<string, unknown> };
    const schedulePostLoad = (payload: ForumRealtimePayload) => {
      const nextId = typeof payload.new?.id === "string" ? payload.new.id : null;
      const eventType = typeof (payload as { eventType?: unknown }).eventType === "string" ? (payload as { eventType: string }).eventType : null;
      const nextAuthorId = typeof payload.new?.author_id === "string" ? payload.new.author_id : null;
      const nextPost = payload.new as Partial<Post> | undefined;
      const oldId = typeof payload.old?.id === "string" ? payload.old.id : null;

      // The user's own INSERT can reach Realtime before the insert response
      // returns, so the local id set is not enough. Ignore it by author too;
      // submitReply already appends the row optimistically from the insert result.
      if (eventType === "INSERT" && nextAuthorId && nextAuthorId === userIdRef.current) {
        if (nextId) locallyInsertedPostIdsRef.current.delete(nextId);
        return;
      }
      if (nextId && locallyInsertedPostIdsRef.current.has(nextId)) {
        locallyInsertedPostIdsRef.current.delete(nextId);
        return;
      }

      if (eventType === "INSERT" && isForumPost(nextPost)) {
        setPosts((current) => {
          if (!current) return [nextPost];
          if (current.some((p) => p.id === nextPost.id)) return current;
          return [...current, nextPost].sort(sortPostsForTopic);
        });
        setTopic((current) => current ? { ...current, reply_count: (current.reply_count ?? 0) + (nextPost.is_op ? 0 : 1) } : current);
        void loadAliases([nextPost.author_id]);
        return;
      }

      if (eventType === "UPDATE" && isForumPost(nextPost)) {
        setPosts((current) => current?.map((p) => (p.id === nextPost.id ? { ...p, ...nextPost } : p)) ?? current);
        return;
      }

      if (eventType === "DELETE" && oldId) {
        setPosts((current) => current?.filter((p) => p.id !== oldId) ?? current);
        setTopic((current) => current ? { ...current, reply_count: Math.max(0, (current.reply_count ?? 0) - 1) } : current);
        return;
      }

      scheduleLoad();
    };
    // The reply_count trigger fires a forum_topics UPDATE for our OWN post too.
    // Patch the row in place instead of reloading the whole topic (that reload
    // was re-rendering every post and re-hydrating all embeds = the freeze).
    const onTopicUpdate = (payload: ForumRealtimePayload) => {
      const next = payload.new as Partial<Topic> | undefined;
      if (!next || typeof next.id !== "string") { scheduleLoad(); return; }
      setTopic((cur) => (cur ? { ...cur, ...next } as Topic : cur));
    };
    const ch = supabase
      .channel(`forum-topic-${topicId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "forum_posts", filter: `topic_id=eq.${topicId}` }, (payload) => schedulePostLoad(payload as ForumRealtimePayload))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "forum_topics", filter: `id=eq.${topicId}` }, (payload) => onTopicUpdate(payload as ForumRealtimePayload))
      .subscribe();
    return () => { if (t) clearTimeout(t); supabase.removeChannel(ch); };
  }, [topicId, canEnter, loadAliases]);

  // Realtime presence: who is currently viewing this topic
  useEffect(() => {
    if (!user || !canEnter) return;
    const presence = supabase.channel(`forum-topic-presence-${topicId}`, {
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
          list.push({ user_id: m.user_id, alias: m.alias || "Fan", avatar: m.avatar ?? "" });
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
          let alias = profiles[user.id]?.display_name;
          let avatar = profiles[user.id]?.avatar_url ?? "";
          if (!alias || alias === "Boro Fan") {
            const { data: aliasRows } = await supabase.rpc("fan_zone_aliases", { _ids: [user.id] });
            const row = (aliasRows ?? [])[0] as { fan_alias: string | null; fan_avatar_url: string | null } | undefined;
            if (row?.fan_alias) { alias = row.fan_alias; avatar = row.fan_avatar_url ?? avatar; }
          }
          if (!alias) {
            const { data: prof } = await supabase
              .from("profiles")
              .select("display_name, username, avatar_url")
              .eq("id", user.id)
              .maybeSingle();
            alias = prof?.display_name || prof?.username || (user.email ? user.email.split("@")[0] : "Fan");
            avatar = avatar || prof?.avatar_url || "";
          }
          await presence.track({
            user_id: user.id,
            alias,
            avatar,
          });
        }
      });
    return () => { supabase.removeChannel(presence); };
    // Intentionally NOT depending on `profiles` — it changes on every load(),
    // which would tear down/re-track the channel after every post and freeze
    // the UI. Alias/avatar are resolved once inside the subscribe callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId, user?.id, canEnter]);

  const submitReply = async () => {
    if (!user || !topic) return;
    if (submittingRef.current) return;
    const raw = normalizeForumPostInput(reply).trim();
    const replySnapshot = reply;
    if (raw.length < 1 || raw === "<p><br></p>") return;
    submittingRef.current = true;
    flushSync(() => {
      setSubmitting(true);
      setReply("");
    });
    const body = prepareForumPostBodyForSubmit(raw);
    const { data, error } = await supabase
      .from("forum_posts")
      .insert({ topic_id: topic.id, author_id: user.id, body, is_op: false })
      .select("id, topic_id, author_id, body, quote_of, edited_at, is_op, is_pinned, created_at")
      .single();
    submittingRef.current = false;
    if (error) {
      flushSync(() => {
        setSubmitting(false);
        setReply(replySnapshot);
      });
      toast.error("Couldn't post", { description: error.message });
      return;
    }
    const inserted = data as Post | null;
    flushSync(() => {
      setSubmitting(false);
      if (inserted) {
        locallyInsertedPostIdsRef.current.add(inserted.id);
        const replyCountBeforeInsert = topic.reply_count ?? 0;
        const showOnCurrentPage = shouldShowInsertedReply(page, replyCountBeforeInsert, REPLIES_PER_PAGE);
        setTopic((current) => current ? { ...current, reply_count: (current.reply_count ?? 0) + 1 } : current);
        if (showOnCurrentPage) {
          setPosts((current) => {
            if (!current) return [inserted];
            const withoutDuplicate = current.filter((p) => p.id !== inserted.id);
            return [...withoutDuplicate, inserted].sort(sortPostsForTopic);
          });
        }
      }
    });
    if (inserted) void loadAliases([inserted.author_id]);
    toast.success("Reply posted");
    // The new post is shown immediately. Realtime refreshes other users, while
    // this client skips its own insert event so the page does not lock up.
  };

  const quotePost = (p: Post) => {
    const author = profiles[p.author_id];
    const name = author?.display_name || author?.username || "someone";
    const safeName = escapeForumQuoteText(name);
    const block = `<blockquote data-quote-of="${p.id}"><p><strong>${safeName}</strong> wrote:</p><p>${quoteExcerptFromHtml(p.body)}</p></blockquote><p><br/></p>`;
    setReply((cur) => (cur || "") + block);
  };

  const replyToPost = (p: Post) => {
    quotePost(p);
    pendingReplyScrollRef.current = true;
    setTab("reply");
  };

  const startEdit = (p: Post) => { setEditingId(p.id); setEditText(p.body); };
  const saveEdit = async () => {
    if (!editingId) return;
    const raw = normalizeForumPostInput(editText).trim();
    if (!raw || raw === "<p><br></p>") return;
    const body = prepareForumPostBodyForSubmit(raw);
    const { error } = await supabase.from("forum_posts").update({ body }).eq("id", editingId);
    if (error) { toast.error("Couldn't save", { description: error.message }); return; }
    setEditingId(null); setEditText("");
  };
  const deletePost = async (p: Post) => {
    if (!confirm("Delete this post?")) return;
    const { error } = await supabase.from("forum_posts").delete().eq("id", p.id);
    if (error) { toast.error("Couldn't delete", { description: error.message }); return; }
  };

  const openHistory = async (p: Post) => {
    setHistoryFor(p);
    const { data } = await supabase
      .from("forum_post_edits")
      .select("id, previous_body, edited_at, edited_by")
      .eq("post_id", p.id)
      .order("edited_at", { ascending: false });
    setHistory((data ?? []) as EditEntry[]);
  };

  const toggleSticky = async () => {
    if (!topic) return;
    await supabase.from("forum_topics").update({ is_sticky: !topic.is_sticky }).eq("id", topic.id);
  };
  const toggleLock = async () => {
    if (!topic) return;
    await supabase.from("forum_topics").update({ is_locked: !topic.is_locked }).eq("id", topic.id);
  };
  const deleteTopic = async () => {
    if (!topic) return;
    if (!confirm("Delete the entire topic and all replies?")) return;
    const { error } = await supabase.from("forum_topics").delete().eq("id", topic.id);
    if (error) { toast.error("Couldn't delete topic", { description: error.message }); return; }
    void navigate({ to: "/forum/$board", params: { board: slug } });
  };

  const openMoveDialog = async () => {
    if (!topic) return;
    const { data } = await supabase
      .from("forum_boards")
      .select("id, name, slug, is_locked")
      .order("is_pinned", { ascending: false })
      .order("sort_order");
    const list = ((data ?? []) as { id: string; name: string; slug: string; is_locked: boolean }[])
      .filter((b) => !b.is_locked && b.id !== topic.board_id)
      .map(({ id, name, slug }) => ({ id, name, slug }));
    setBoardList(list);
    setMoveTargetId(list[0]?.id ?? "");
    setMoveOpen(true);
  };
  const confirmMove = async () => {
    if (!topic || !moveTargetId) return;
    setMoving(true);
    const { error } = await supabase.rpc("forum_move_topic", { _topic_id: topic.id, _new_board_id: moveTargetId });
    setMoving(false);
    if (error) { toast.error("Couldn't move topic", { description: error.message }); return; }
    const target = boardList.find((b) => b.id === moveTargetId);
    setMoveOpen(false);
    toast.success(`Moved to ${target?.name ?? "board"}`);
    if (target) void navigate({ to: "/forum/$board/$topic", params: { board: target.slug, topic: topic.id } });
  };

  const visiblePosts = useMemo(() => {
    if (!posts) return { opPost: null as Post | null, replies: [] as Post[], pinnedReplies: [] as Post[], teamPosts: [] as Post[] };
    const visible = posts.filter((p) => p.is_op || !blocked.has(p.author_id));
    return {
      opPost: visible.find((p) => p.is_op) ?? null,
      replies: visible.filter((p) => !p.is_op && !p.is_pinned && !isTeamSheetPost(p.body)),
      pinnedReplies: visible.filter((p) => !p.is_op && p.is_pinned && !isTeamSheetPost(p.body)),
      teamPosts: sortTeamSheetPosts(visible.filter((p) => !p.is_op && isTeamSheetPost(p.body))),
    };
  }, [posts, blocked]);

  if (!canEnter) return <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-sm text-center">Members only.</div>;
  if (topic === null && posts !== null) {
    return <div className="text-center text-sm text-muted-foreground">Topic not found. <Link to="/forum/$board" params={{ board: slug }} className="underline">Back to board</Link></div>;
  }
  if (!topic || !posts) return <div className="grid place-items-center py-20 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>;
  const renderSponsorAdvert = () => (
    <RotatingAffiliateBanner
      boardId={board?.id ?? null}
      paused={submitting || editingId !== null}
      fallback={{
        image_url: board?.affiliate_banner_url ?? null,
        link_url: board?.affiliate_banner_link ?? null,
        alt_text: board?.affiliate_banner_alt || `${board?.name ?? "Forum"} sponsor`,
      }}
    />
  );
  const { opPost, replies, pinnedReplies, teamPosts } = visiblePosts;

  return (
    <div className="boro-topic-page space-y-4">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
          <Link to="/forum/$board" params={{ board: slug }}><ArrowLeft className="size-4 mr-1" />{board?.name ?? "Board"}</Link>
        </Button>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          {editingTitle ? (
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <input
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); void saveTitle(); }
                  else if (e.key === "Escape") setEditingTitle(false);
                }}
                maxLength={200}
                className="flex-1 min-w-0 rounded-md border border-white/20 bg-black/30 px-3 py-1.5 font-display text-xl font-bold text-white outline-none focus:border-[#E11B22]"
              />
              <Button size="sm" onClick={() => void saveTitle()} disabled={savingTitle}>
                {savingTitle ? <Loader2 className="size-3.5 animate-spin" /> : <><Check className="size-3.5 mr-1" />Save</>}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditingTitle(false)} disabled={savingTitle}><X className="size-3.5" /></Button>
            </div>
          ) : (
            <h2 className="font-display text-xl font-bold flex items-center gap-2 min-w-0">
              {topic.is_sticky && <Pin className="size-4 text-[#F4B400]" />}
              {topic.is_locked && <Lock className="size-4 text-muted-foreground" />}
              <span className="truncate">{censorText(topic.title)}</span>
              {canEditTitle && (
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={startEditTitle} title="Edit title">
                  <Pencil className="size-3.5" />
                </Button>
              )}
            </h2>
          )}
          {isBoardMod && (
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" onClick={toggleSticky}>{topic.is_sticky ? "Unpin" : "Pin"}</Button>
              <Button size="sm" variant="outline" onClick={toggleLock}>{topic.is_locked ? "Unlock" : "Lock"}</Button>
              <Button size="sm" variant="outline" onClick={() => void openMoveDialog()} title="Move to another board"><FolderInput className="size-3.5 mr-1" />Move</Button>
              <Button size="sm" variant="destructive" onClick={deleteTopic}><Trash2 className="size-3.5" /></Button>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px] lg:grid-cols-[minmax(0,1fr)_256px] md:items-start">
        <div className="min-w-0">
      {(() => {
        const totalPages = Math.max(1, Math.ceil((topic.reply_count ?? replies.length) / REPLIES_PER_PAGE));
        const safePage = Math.min(page, totalPages);
        const start = (safePage - 1) * REPLIES_PER_PAGE;
        const pageReplies = replies;
        const renderPost = (p: Post, i: number) => {
          const canEdit = !!user && (p.author_id === user.id || isBoardMod);
          const canDelete = !!user && ((p.author_id === user.id && !p.is_op) || isBoardMod);
          const canBlock = !!user && p.author_id !== user.id;
          return (
            <TopicPostArticle
              key={p.id}
              post={p}
              displayIndex={i + 1}
              author={profiles[p.author_id]}
              currentUserId={user?.id ?? null}
              canPost={canPost}
              canReact={canEnter}
              canEdit={canEdit}
              canDelete={canDelete}
              canBlock={canBlock}
              isEditing={editingId === p.id}
              editText={editText}
              mentionCandidates={mentionCandidates}
              onReplyToPost={replyToPost}
              onQuotePost={quotePost}
              onStartEdit={startEdit}
              onCancelEdit={() => setEditingId(null)}
              onSaveEdit={() => void saveEdit()}
              onEditTextChange={setEditText}
              onDeletePost={(post) => void deletePost(post)}
              onOpenHistory={(post) => void openHistory(post)}
              onBlocksChanged={() => void reloadBlocks()}
            />
          );
        };

        const ViewingBox = () => (
          <div className="mt-3 rounded-2xl border border-border/60 bg-surface-2/25 px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <Eye className="size-4 text-emerald-500 shrink-0" />
              <div className="text-xs font-semibold text-foreground">
                {viewers.length === 0 ? "No one viewing" : `${viewers.length} viewing now`}
              </div>
            </div>
            {viewers.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {viewers.map((v) => {
                  const isMe = user && v.user_id === user.id;
                  return (
                    <Link
                      key={v.user_id}
                      to="/fanzone/u/$userId"
                      params={{ userId: v.user_id }}
                      className="flex items-center gap-1.5 rounded-full border border-border/60 bg-surface-1/40 pl-1 pr-2.5 py-0.5 hover:border-[#E11B22]/60"
                    >
                      {v.avatar ? (
                        <img src={v.avatar} alt="" className="size-6 rounded-full object-cover" />
                      ) : (
                        <div className="size-6 rounded-full bg-gradient-to-br from-[#E11B22] to-[#8B0F14] grid place-items-center text-white text-[10px] font-bold">
                          {(v.alias || "F").slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <span className="text-xs font-medium text-foreground">
                        {v.alias}{isMe ? " (you)" : ""}
                      </span>
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );

        return (
          <Tabs value={tab} onValueChange={(v) => setTab(v as "posts" | "reply" | "teams")} className="w-full">
            <div className="mb-3">
              <ForumPoll
                topicId={topic.id}
                userId={user?.id ?? null}
                canManage={isBoardMod || (!!user && topic.author_id === user.id)}
                canVote={canPost}
              />
            </div>
            <TabsList>
              <TabsTrigger value="posts">Original Post</TabsTrigger>
              {teamPosts.length > 0 && <TabsTrigger value="teams">Teams ({teamPosts.length})</TabsTrigger>}
              <TabsTrigger value="reply">
                Replies ({teamPosts.length > 0 ? replies.length + pinnedReplies.length : (topic.reply_count ?? replies.length)})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="posts" className="space-y-3 mt-3">
              {opPost ? renderPost(opPost, 0) : (
                <div className="text-sm text-muted-foreground text-center py-6">No original post.</div>
              )}
            </TabsContent>

            <TabsContent value="teams" className="space-y-3 mt-3">
              {teamPosts.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-6">The team sheet hasn't been announced yet.</div>
              ) : (
                teamPosts.map((p, idx) => renderPost(p, idx))
              )}
            </TabsContent>


            <TabsContent value="reply" className="space-y-3 mt-3">
              {pinnedReplies.map((p) => renderPost(p, 0))}
              {pageReplies.length === 0 && pinnedReplies.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-6">No replies yet.</div>
              ) : (
                pageReplies.map((p, idx) => renderPost(p, start + idx + 1))
              )}

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-2">
                  <Button size="sm" variant="outline" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    Previous
                  </Button>
                  <span className="text-xs text-muted-foreground">Page {safePage} of {totalPages}</span>
                  <Button size="sm" variant="outline" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                    Next
                  </Button>
                </div>
              )}

              {canPost ? (
                <div ref={replyBoxRef} id="forum-reply-box" className="rounded-2xl border border-[#E11B22]/40 bg-surface-1 shadow-glow p-5 space-y-3 mt-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <ReplyIcon className="size-4 text-[#E11B22]" />
                    <span>Write a reply</span>
                  </div>
                  <HtmlEditor
                    value={reply}
                    onChange={setReply}
                    placeholder="What's on your mind? Paste an X or Facebook URL on its own line to embed it."
                    mentions={mentionCandidates}
                    imageUpload={{ userId: user?.id }}
                  />
                  {user && (isBoardMod || topic.author_id === user.id) && (
                    <AddPollToTopic topicId={topic.id} userId={user.id} />
                  )}
                  <div className="flex justify-end pt-1">
                    <Button
                      onClick={() => void submitReply()}
                      disabled={submitting || !reply.trim()}
                      className="bg-gradient-to-r from-[#E11B22] to-[#8B0F14] hover:from-[#F02B30] hover:to-[#9B1118] border-0 text-white shadow-[0_4px_20px_-6px_rgba(225,27,34,0.6)] font-semibold"
                    >
                      {submitting ? <><Loader2 className="size-4 mr-1.5 animate-spin" />Posting…</> : <><Send className="size-4 mr-1.5" />Post reply</>}
                    </Button>
                  </div>
                </div>
              ) : topic.is_locked ? (
                <div className="rounded-2xl border border-muted-foreground/20 bg-muted/20 p-4 text-sm text-center text-muted-foreground">
                  <Lock className="size-4 inline mr-1" /> This topic is locked.
                </div>
              ) : null}
              <ViewingBox />
            </TabsContent>
          </Tabs>
        );
      })()}
        </div>
        <aside className="hidden w-full min-w-0 md:grid md:place-items-center md:sticky md:top-4" aria-label="Sponsored advert">
          {renderSponsorAdvert()}
        </aside>
      </div>

      <Dialog open={!!historyFor} onOpenChange={(o) => !o && setHistoryFor(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit history</DialogTitle></DialogHeader>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No previous versions.</p>
          ) : (
            <ol className="space-y-3">
              {history.map((h) => (
                <li key={h.id} className="rounded border border-border p-3 text-sm">
                  <div className="text-[11px] text-muted-foreground mb-1">{formatLastSeen(h.edited_at)}</div>
                  <ForumPostBody html={h.previous_body} />
                </li>
              ))}
            </ol>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Move topic to another board</DialogTitle></DialogHeader>
          {boardList.length === 0 ? (
            <p className="text-sm text-muted-foreground">No other boards available.</p>
          ) : (
            <select
              value={moveTargetId}
              onChange={(e) => setMoveTargetId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
            >
              {boardList.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setMoveOpen(false)} disabled={moving}>Cancel</Button>
            <Button onClick={() => void confirmMove()} disabled={!moveTargetId || moving}>
              {moving ? <Loader2 className="size-4 animate-spin" /> : "Move"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}