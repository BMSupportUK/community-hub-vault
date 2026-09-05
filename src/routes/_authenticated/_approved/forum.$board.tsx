import { createFileRoute, Link, Outlet, useMatches, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Pin, Lock, Loader2, Plus, ArrowLeft, Eye, MessageSquare, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useFanZoneMembership } from "@/hooks/use-fan-zone";
import { useFanAliasVersion } from "@/hooks/use-fan-alias-version";
import { formatLastSeen } from "@/lib/relative-time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HtmlEditor } from "@/components/ui/html-editor";
import { markPreparedForumPostBody, normalizeForumPostInput, prepareForumPostBody } from "@/lib/forum-embeds";
import { useMentionCandidates } from "@/hooks/use-mention-candidates";
import { useFanBlocks } from "@/hooks/use-fan-blocks";
import { toast } from "sonner";
import { censorText, useProfanityWords } from "@/lib/profanity";
import { RotatingAffiliateBanner } from "@/components/app/RotatingAffiliateBanner";
import { PollDraftEditor, persistDraftPoll, type DraftPoll } from "@/components/app/ForumPoll";
import { BarChart3 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_approved/forum/$board")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.board.replace(/-/g, " ")} | Boro Fan Zone` },
      { name: "description", content: `Browse Middlesbrough supporter topics and discussions in the ${params.board.replace(/-/g, " ")} board.` },
      { property: "og:title", content: `${params.board.replace(/-/g, " ")} | Boro Fan Zone` },
      { property: "og:description", content: `Browse Middlesbrough supporter topics and discussions in the ${params.board.replace(/-/g, " ")} board.` },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BoardRoute,
});

function BoardRoute() {
  const matches = useMatches();
  const isNested = matches.some((m) =>
    m.routeId.startsWith("/_authenticated/_approved/forum/$board/"),
  );
  return isNested ? <Outlet /> : <BoardPage />;
}

type Board = {
  id: string;
  name: string;
  slug: string;
  description: string;
  is_locked: boolean;
  affiliate_banner_url: string | null;
  affiliate_banner_link: string | null;
  affiliate_banner_alt: string | null;
};
type Topic = {
  id: string;
  title: string;
  author_id: string;
  is_sticky: boolean;
  is_locked: boolean;
  view_count: number;
  reply_count: number;
  last_post_at: string;
  last_post_by: string | null;
  created_at: string;
};
type Profile = { id: string; display_name: string | null; username: string | null };

function isTopicRow(value: Record<string, unknown> | undefined): value is Topic {
  return !!value
    && typeof value.id === "string"
    && typeof value.title === "string"
    && typeof value.author_id === "string"
    && typeof value.is_sticky === "boolean"
    && typeof value.is_locked === "boolean"
    && typeof value.view_count === "number"
    && typeof value.reply_count === "number"
    && typeof value.last_post_at === "string"
    && (value.last_post_by === null || typeof value.last_post_by === "string")
    && typeof value.created_at === "string";
}

function sortBoardTopics(a: Topic, b: Topic) {
  if (a.is_sticky !== b.is_sticky) return a.is_sticky ? -1 : 1;
  return new Date(b.last_post_at).getTime() - new Date(a.last_post_at).getTime();
}

function BoardPage() {
  const { board: slug } = Route.useParams();
  const navigate = useNavigate();
  const { user, hasAny } = useAuth();
  const goToTopic = (topicId: string) =>
    navigate({ to: "/forum/$board/$topic", params: { board: slug, topic: topicId } });
  const isStaff = hasAny(["admin", "boro_fan_zone_moderator"]);
  const canUseSpecialMentions = hasAny(["admin", "management", "staff", "moderator"]);
  const info = useFanZoneMembership(user?.id ?? null);
  const { mute: myMute } = useFanZoneMute(user?.id ?? null);
  const canEnter = isStaff || info?.status === "approved";
  const aliasVersion = useFanAliasVersion();
  const mentionCandidates = useMentionCandidates(canUseSpecialMentions);
  const { blocked } = useFanBlocks();
  useProfanityWords();

  const [board, setBoard] = useState<Board | null>(null);
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [totalTopics, setTotalTopics] = useState(0);
  const [page, setPage] = useState(1);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [moderatorIds, setModeratorIds] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const locallyCreatedTopicsRef = useRef<Map<string, number>>(new Map());
  const userIdRef = useRef<string | null>(user?.id ?? null);
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [poll, setPoll] = useState<DraftPoll | null>(null);

  const PAGE_SIZE = 20;
  const totalPages = Math.max(1, Math.ceil(totalTopics / PAGE_SIZE));

  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user?.id]);

  useEffect(() => {
    if (!canEnter) return;
    void (async () => {
      const { data: b } = await supabase
        .from("forum_boards")
        .select("id, name, slug, description, is_locked, affiliate_banner_url, affiliate_banner_link, affiliate_banner_alt")
        .eq("slug", slug)
        .maybeSingle();
      if (!b) { setBoard(null); setTopics([]); return; }
      setBoard(b as Board);
      const { data: mods } = await supabase
        .from("forum_board_moderators")
        .select("user_id")
        .eq("board_id", (b as Board).id);
      setModeratorIds(new Set(((mods ?? []) as { user_id: string }[]).map((m) => m.user_id)));
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data: ts, count } = await supabase
        .from("forum_topics")
        .select("id, title, author_id, is_sticky, is_locked, view_count, reply_count, last_post_at, last_post_by, created_at", { count: "exact" })
        .eq("board_id", (b as Board).id)
        .order("is_sticky", { ascending: false })
        .order("last_post_at", { ascending: false })
        .range(from, to);
      const list = (ts ?? []) as Topic[];
      setTotalTopics(count ?? list.length);
      setTopics(list);
      const ids = Array.from(new Set([
        ...list.map((t) => t.author_id),
        ...list.map((t) => t.last_post_by).filter((x): x is string => !!x),
      ]));
      if (ids.length) {
        const map: Record<string, Profile> = {};
        const { data: aliases } = await supabase.rpc("fan_zone_aliases", { _ids: ids });
        (aliases ?? []).forEach((a: { user_id: string; fan_alias: string | null }) => {
          map[a.user_id] = { id: a.user_id, display_name: a.fan_alias ?? "Boro Fan", username: null };
        });
        setProfiles(map);
      }
    })();
  }, [slug, canEnter, page, aliasVersion]);

  // Live updates: refresh the topic list when topics or posts change in this board.
  useEffect(() => {
    if (!canEnter || !board) return;
    type TopicRealtimePayload = { new?: Record<string, unknown>; old?: Record<string, unknown> };
    const handleTopicChange = (payload: TopicRealtimePayload) => {
      const eventType = typeof (payload as { eventType?: unknown }).eventType === "string" ? (payload as { eventType: string }).eventType : null;
      const id = typeof payload.new?.id === "string" ? payload.new.id : typeof payload.old?.id === "string" ? payload.old.id : null;
      const authorId = typeof payload.new?.author_id === "string" ? payload.new.author_id : null;
      const expiresAt = id ? locallyCreatedTopicsRef.current.get(id) : undefined;
      if (expiresAt && expiresAt > Date.now()) return;
      if (id && expiresAt) locallyCreatedTopicsRef.current.delete(id);

      // New-topic inserts can reach Realtime before the insert call returns.
      // Ignore our own INSERT; submit() adds the topic locally from the DB row.
      if (eventType === "INSERT" && authorId && authorId === userIdRef.current) return;

      if (eventType === "INSERT" && isTopicRow(payload.new)) {
        const next = payload.new;
        setTopics((current) => {
          if (!current || current.some((t) => t.id === next.id)) return current;
          return [next, ...current].sort(sortBoardTopics).slice(0, PAGE_SIZE);
        });
        setTotalTopics((current) => current + 1);
        void loadTopicAliases([next]);
        return;
      }

      if (eventType === "UPDATE" && isTopicRow(payload.new)) {
        const next = payload.new;
        setTopics((current) => current?.map((t) => (t.id === next.id ? { ...t, ...next } : t)).sort(sortBoardTopics) ?? current);
        void loadTopicAliases([next]);
        return;
      }

      if (eventType === "DELETE" && id) {
        setTopics((current) => current?.filter((t) => t.id !== id) ?? current);
        setTotalTopics((current) => Math.max(0, current - 1));
        return;
      }

      void reloadTopics();
    };
    const ch = supabase
      .channel(`forum-board-${board.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "forum_topics", filter: `board_id=eq.${board.id}` },
        (payload) => handleTopicChange(payload as TopicRealtimePayload),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEnter, board?.id, page]);

  const reloadTopics = async () => {
    if (!board) return;
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data: ts, count } = await supabase
      .from("forum_topics")
      .select("id, title, author_id, is_sticky, is_locked, view_count, reply_count, last_post_at, last_post_by, created_at", { count: "exact" })
      .eq("board_id", board.id)
      .order("is_sticky", { ascending: false })
      .order("last_post_at", { ascending: false })
      .range(from, to);
    setTotalTopics(count ?? (ts?.length ?? 0));
    setTopics((ts ?? []) as Topic[]);
  };

  const loadTopicAliases = async (rows: Topic[]) => {
    const ids = Array.from(new Set([
      ...rows.map((t) => t.author_id),
      ...rows.map((t) => t.last_post_by).filter((x): x is string => !!x),
    ]));
    if (!ids.length) return;
    const { data: aliases } = await supabase.rpc("fan_zone_aliases", { _ids: ids });
    const map: Record<string, Profile> = {};
    (aliases ?? []).forEach((a: { user_id: string; fan_alias: string | null }) => {
      map[a.user_id] = { id: a.user_id, display_name: a.fan_alias ?? "Boro Fan", username: null };
    });
    setProfiles((current) => ({ ...current, ...map }));
  };

  const saveTopicEdit = async () => {
    if (!editingTopic) return;
    const newTitle = editTitle.trim().slice(0, 200);
    if (newTitle.length < 3) { toast.error("Title too short"); return; }
    setSavingEdit(true);
    const { error } = await supabase
      .from("forum_topics")
      .update({ title: newTitle })
      .eq("id", editingTopic.id);
    setSavingEdit(false);
    if (error) { toast.error("Couldn't update", { description: error.message }); return; }
    setEditingTopic(null);
    setEditTitle("");
    await reloadTopics();
    toast.success("Topic renamed");
  };

  const deleteTopic = async (t: Topic) => {
    if (!confirm(`Delete topic "${t.title}" and all replies?`)) return;
    const { error } = await supabase.from("forum_topics").delete().eq("id", t.id);
    if (error) { toast.error("Couldn't delete", { description: error.message }); return; }
    await reloadTopics();
    toast.success("Topic deleted");
  };

  const submit = async () => {
    if (!user || !board) return;
    if (submittingRef.current) return;
    const t = title.trim();
    const bRaw = normalizeForumPostInput(body).trim();
    const titleSnapshot = title;
    const bodySnapshot = body;
    if (t.length < 3) { toast.error("Title too short"); return; }
    if (bRaw.length < 1 || bRaw === "<p><br></p>") { toast.error("Add some body text"); return; }
    submittingRef.current = true;
    flushSync(() => {
      setSubmitting(true);
      setTitle("");
      setBody("");
    });
    const b = markPreparedForumPostBody(prepareForumPostBody(bRaw, { skipDomParserFallback: true }));
    const { data: topic, error } = await supabase
      .from("forum_topics")
      .insert({ board_id: board.id, author_id: user.id, title: t.slice(0, 200) })
      .select("id, title, author_id, is_sticky, is_locked, view_count, reply_count, last_post_at, last_post_by, created_at")
      .single();
    if (error || !topic) {
      submittingRef.current = false;
      flushSync(() => {
        setSubmitting(false);
        setTitle(titleSnapshot);
        setBody(bodySnapshot);
      });
      toast.error("Couldn't create topic", { description: error?.message });
      return;
    }
    const createdTopic = topic as Topic;
    locallyCreatedTopicsRef.current.set(createdTopic.id, Date.now() + 5000);
    const { error: postErr } = await supabase
      .from("forum_posts")
      .insert({ topic_id: createdTopic.id, author_id: user.id, body: b, is_op: true });
    submittingRef.current = false;
    if (postErr) {
      flushSync(() => {
        setSubmitting(false);
        setTitle(titleSnapshot);
        setBody(bodySnapshot);
      });
      toast.error("Couldn't post first message", { description: postErr.message });
      return;
    }
    if (poll) {
      const err = await persistDraftPoll(createdTopic.id, user.id, poll);
      if (err) toast.error("Poll not saved", { description: err });
    }
    flushSync(() => {
      setSubmitting(false);
      setTopics((current) => {
        if (!current) return current;
        const withoutDuplicate = current.filter((item) => item.id !== createdTopic.id);
        return [{ ...createdTopic, last_post_by: user.id }, ...withoutDuplicate]
          .sort(sortBoardTopics)
          .slice(0, PAGE_SIZE);
      });
      setTotalTopics((current) => current + 1);
      setProfiles((current) => ({
        ...current,
        [user.id]: current[user.id] ?? { id: user.id, display_name: "You", username: null },
      }));
      setOpen(false);
      setPoll(null);
    });
    toast.success("Topic posted", {
      action: {
        label: "View post",
        onClick: () => void navigate({ to: "/forum/$board/$topic", params: { board: slug, topic: createdTopic.id } }),
      },
    });
  };

  if (!canEnter) {
    return <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-sm text-center">Members only.</div>;
  }
  if (board === null && topics !== null) {
    return <div className="text-center text-sm text-muted-foreground">Board not found. <Link to="/forum" className="underline">Back to forum</Link></div>;
  }
  if (!board || !topics) {
    return <div className="grid place-items-center py-20 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>;
  }

  const canPost = !board.is_locked && (isStaff || info?.status === "approved") && !myMute;
  const isBoardMod = isStaff || (user ? moderatorIds.has(user.id) : false);
  const renderSponsorAdvert = () => (
    <RotatingAffiliateBanner
      boardId={board.id}
      fallback={{
        image_url: board.affiliate_banner_url,
        link_url: board.affiliate_banner_link,
        alt_text: board.affiliate_banner_alt || `${board.name} sponsor`,
      }}
    />
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link to="/forum"><ArrowLeft className="size-4 mr-1" />All boards</Link>
          </Button>
          <h2 className="font-display text-xl font-bold flex items-center gap-2">
            {board.is_locked && <Lock className="size-4 text-muted-foreground" />}
            {board.name}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">{board.description}</p>
        </div>
        {canPost && (
          <Button onClick={() => setOpen((v) => !v)} className="bg-gradient-to-r from-[#E11B22] to-[#8B0F14] hover:from-[#F02B30] hover:to-[#9B1118] border-0 text-white shadow-[0_4px_20px_-6px_rgba(225,27,34,0.6)]">
            <Plus className="size-4 mr-1" /> {open ? "Close" : "New topic"}
          </Button>
        )}
      </div>

      <div className={`grid gap-4 ${open ? "" : "md:grid-cols-[minmax(0,1fr)_180px] lg:grid-cols-[minmax(0,1fr)_256px]"} md:items-start`}>
        <div className="min-w-0 space-y-4">
          {canPost && open && (
            <section
              aria-label={`New topic in ${board.name}`}
              className="relative overflow-hidden rounded-2xl border-2 border-[#E11B22]/60 bg-gradient-to-br from-[#2a0a0d] via-[#1a0508] to-[#0f0204] p-1 shadow-[0_0_0_1px_rgba(225,27,34,0.3),0_12px_50px_-12px_rgba(225,27,34,0.55)] min-w-0"
            >
              <span aria-hidden className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-[#FF3B41] via-[#E11B22] to-[#8B0F14] shadow-[0_0_20px_rgba(225,27,34,0.9)]" />
              <div className="relative pl-3 sm:pl-4 p-3 sm:p-4 space-y-3 min-w-0 [&_*]:break-words">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#FF3B41] to-[#8B0F14] text-white shadow-[0_6px_18px_-6px_rgba(225,27,34,0.85)]">
                      <Pencil className="size-4" />
                    </span>
                    <div>
                      <h3 className="font-display text-base font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">New topic in {board.name}</h3>
                      <p className="text-[11px] text-[#FF9A9D]/90">Share your take — mentions, polls and media embeds supported.</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={submitting} className="text-white/80 hover:bg-white/10 hover:text-white shrink-0">Cancel</Button>
                </div>
                <Input
                  placeholder="Topic title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value.slice(0, 200))}
                  maxLength={200}
                  className="border-white/15 bg-black/30 text-white placeholder:text-white/40 focus:border-[#E11B22] focus:ring-[#E11B22]/40 focus-visible:ring-[#E11B22]/40 focus-visible:ring-offset-0"
                />
                <div className="min-w-0 overflow-hidden rounded-xl border border-white/10 bg-black/25 p-1 focus-within:border-[#E11B22]/60 focus-within:shadow-[0_0_20px_-6px_rgba(225,27,34,0.45)] transition-all">
                  <HtmlEditor
                    value={body}
                    onChange={setBody}
                    placeholder="What's on your mind? Paste an X or Facebook URL on its own line to embed it."
                    mentions={mentionCandidates}
                    imageUpload={{ userId: user?.id }}
                    className="[--background:oklch(0.18_0.04_18)] [--border:oklch(0.35_0.05_18)] [--foreground:oklch(0.97_0.005_20)] [--muted-foreground:oklch(0.70_0.03_20)] [--primary:oklch(0.62_0.27_22)] [--primary-foreground:oklch(0.99_0.005_20)] [--accent:oklch(0.32_0.10_18)] [--accent-foreground:oklch(0.97_0.005_20)] [--popover:oklch(0.20_0.05_18)] [--popover-foreground:oklch(0.97_0.005_20)] [--muted:oklch(0.25_0.04_18)] [&_.html-editor-toolbar]:border-b-[oklch(0.35_0.05_18)] [&_.html-editor-toolbar]:bg-black/20 [&_.html-editor-editor]:text-white/95"
                  />
                </div>
                {poll ? (
                  <PollDraftEditor value={poll} onChange={setPoll} onRemove={() => setPoll(null)} />
                ) : (
                  <div>
                    <Button type="button" variant="outline" size="sm" onClick={() => setPoll({ question: "", options: ["", ""], allow_multiple: false })} className="border-[#E11B22]/40 bg-black/20 text-white hover:bg-[#E11B22]/15 hover:text-white hover:border-[#E11B22]/70">
                      <BarChart3 className="size-4 mr-1 text-[#FF6B70]" /> Add poll
                    </Button>
                  </div>
                )}
                <div className="flex justify-end pt-1">
                  <Button onClick={submit} disabled={submitting} className="bg-gradient-to-r from-[#E11B22] to-[#8B0F14] hover:from-[#F02B30] hover:to-[#9B1118] border-0 text-white shadow-[0_6px_24px_-8px_rgba(225,27,34,0.7)] hover:shadow-[0_10px_32px_-8px_rgba(225,27,34,0.9)] transition-all">
                    {submitting ? <><Loader2 className="size-4 mr-1 animate-spin" />Posting…</> : <><Plus className="size-4 mr-1" />Post topic</>}
                  </Button>
                </div>
              </div>
            </section>
          )}
          {!open && (topics.length === 0 ? (
            <div className="rounded-2xl border border-[#E11B22]/20 bg-surface-1/40 px-4 py-10 text-center text-sm text-muted-foreground shadow-soft">
              No topics yet. {canPost ? "Be first — start one!" : ""}
            </div>
          ) : (
            <div className="space-y-2.5">
              {topics.filter((t) => !blocked.has(t.author_id)).map((t) => {
            const author = profiles[t.author_id];
            const last = t.last_post_by ? profiles[t.last_post_by] : null;
            const authorName = author?.display_name || author?.username || "Someone";
            const lastName = last?.display_name || last?.username || authorName;
            const canEdit = !!user && (t.author_id === user.id || isBoardMod);
            const canDelete = !!user && (t.author_id === user.id || isBoardMod);
            return (
              <article
                key={t.id}
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  if (target.closest("a, button, [role='button'], input, textarea, select, label, [data-no-nav]")) return;
                  goToTopic(t.id);
                }}
                className={`group relative rounded-xl border cursor-pointer overflow-hidden transition-all hover:-translate-y-[2px] ${
                  t.is_sticky
                    ? "border-[#F4B400]/45 bg-[linear-gradient(115deg,rgba(244,180,0,0.16),rgba(12,16,26,0.96)_38%,rgba(8,11,19,0.98))] shadow-[0_10px_30px_-12px_rgba(244,180,0,0.45)] hover:border-[#F4B400]/80 hover:shadow-[0_18px_48px_-12px_rgba(244,180,0,0.6)]"
                    : "border-[#E11B22]/30 bg-[linear-gradient(115deg,rgba(225,27,34,0.18),rgba(12,16,26,0.96)_36%,rgba(8,11,19,0.98))] shadow-[0_10px_30px_-12px_rgba(0,0,0,0.85)] hover:border-[#E11B22]/80 hover:shadow-[0_18px_48px_-12px_rgba(225,27,34,0.65)]"
                }`}
              >
                <span
                  aria-hidden
                  className={`absolute left-0 top-0 bottom-0 w-[4px] ${t.is_sticky ? "bg-gradient-to-b from-[#FFD24A] via-[#F4B400] to-[#B8860B] shadow-[0_0_16px_rgba(244,180,0,0.75)]" : "bg-gradient-to-b from-[#FF3B41] via-[#E11B22] to-[#8B0F14] shadow-[0_0_16px_rgba(225,27,34,0.8)]"} transition-opacity`}
                />
                <div className="flex items-start gap-3 p-4 pl-5">
                  <div className={`hidden sm:flex shrink-0 size-10 rounded-lg items-center justify-center transition-transform group-hover:scale-105 ${t.is_sticky ? "bg-gradient-to-br from-[#F4B400] to-[#B8860B] text-black shadow-[0_6px_18px_-6px_rgba(244,180,0,0.8)]" : "bg-gradient-to-br from-[#FF3B41] to-[#8B0F14] text-white shadow-[0_6px_18px_-6px_rgba(225,27,34,0.85)]"}`}>
                    <MessageSquare className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0 block rounded-lg">
                    <div className="flex items-center gap-2 flex-wrap">
                      {t.is_sticky && (
                        <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 bg-[#F4B400] text-black border border-[#F4B400] shadow-[0_0_14px_-2px_rgba(244,180,0,0.8)] text-[10px] font-bold uppercase tracking-wider shrink-0">
                          <Pin className="size-2.5" />Pinned
                        </span>
                      )}
                      {t.is_locked && (
                        <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 bg-white/15 text-white/85 border border-white/30 text-[10px] font-bold uppercase tracking-wider shrink-0">
                          <Lock className="size-2.5" />Locked
                        </span>
                      )}
                      <Link to="/forum/$board/$topic" params={{ board: slug, topic: t.id }} className="font-display font-bold leading-snug text-white text-[15.5px] tracking-tight group-hover:text-[#FF6B70] group-hover:[text-shadow:0_0_14px_rgba(225,27,34,0.55)] hover:underline transition-all">
                        {censorText(t.title)}
                      </Link>
                    </div>
                    <div className="text-[11px] text-white/60 mt-1.5 flex items-center gap-1.5">
                      <span className="inline-flex items-center justify-center size-4 rounded-full bg-[#E11B22] text-white text-[9px] font-bold uppercase">
                        {authorName.charAt(0)}
                      </span>
                      by <Link
                        to="/fanzone/u/$userId"
                        params={{ userId: t.author_id }}
                        className="text-white font-semibold hover:text-[#FF6B70] hover:underline"
                      >{authorName}</Link>
                      <span className="text-white/25">•</span>
                      <span>{formatLastSeen(t.created_at)}</span>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-[11px] text-white/60 flex-wrap">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#E11B22]/20 border border-[#E11B22]/40 text-white font-semibold tabular-nums">
                        <MessageSquare className="size-3 text-[#FF6B70]" />
                        {t.reply_count}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/10 border border-white/20 text-white font-semibold tabular-nums">
                        <Eye className="size-3 text-white/70" />
                        {t.view_count}
                      </span>
                      <span className="truncate ml-0.5">
                        last by {t.last_post_by ? <Link
                          to="/fanzone/u/$userId"
                          params={{ userId: t.last_post_by }}
                          className="text-white font-semibold hover:text-[#FF6B70] hover:underline"
                        >{lastName}</Link> : <span className="text-white font-semibold">{lastName}</span>}
                        <span className="text-white/25 mx-1">•</span>
                        {formatLastSeen(t.last_post_at)}
                      </span>
                    </div>
                  </div>
                  {(canEdit || canDelete) && (
                    <div className="flex gap-1 shrink-0">
                      {canEdit && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => { setEditingTopic(t); setEditTitle(t.title); }}
                          title="Rename topic"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-destructive/80 hover:text-destructive"
                          onClick={() => void deleteTopic(t)}
                          title="Delete topic"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
              })}
            </div>
          ))}

          {!open && totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                Next
              </Button>
            </div>
          )}
        </div>
        {!open && (
          <aside className="hidden w-full min-w-0 md:grid md:place-items-center md:sticky md:top-4" aria-label="Sponsored advert">
            {renderSponsorAdvert()}
          </aside>
        )}
      </div>

      <Dialog open={!!editingTopic} onOpenChange={(o) => { if (!o) { setEditingTopic(null); setEditTitle(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Rename topic</DialogTitle></DialogHeader>
          <Input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value.slice(0, 200))}
            maxLength={200}
            placeholder="Topic title"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditingTopic(null); setEditTitle(""); }} disabled={savingEdit}>Cancel</Button>
            <Button onClick={() => void saveTopicEdit()} disabled={savingEdit}>
              {savingEdit ? <><Loader2 className="size-4 mr-1 animate-spin" />Saving…</> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}