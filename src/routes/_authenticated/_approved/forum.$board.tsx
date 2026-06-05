import { createFileRoute, Link, Outlet, useMatches, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Pin, Lock, Loader2, Plus, ArrowLeft, Eye, MessageSquare, CheckCircle2, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useFanZoneMembership } from "@/hooks/use-fan-zone";
import { formatLastSeen } from "@/lib/relative-time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HtmlEditor } from "@/components/ui/html-editor";
import { prepareForumPostBody } from "@/lib/forum-embeds";
import { useMentionCandidates } from "@/hooks/use-mention-candidates";
import { toast } from "sonner";
import { RotatingAffiliateBanner } from "@/components/app/RotatingAffiliateBanner";
import { PollDraftEditor, persistDraftPoll, type DraftPoll } from "@/components/app/ForumPoll";
import { BarChart3 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_approved/forum/$board")({
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

function BoardPage() {
  const { board: slug } = Route.useParams();
  const navigate = useNavigate();
  const { user, hasAny } = useAuth();
  const isStaff = hasAny(["admin", "boro_fan_zone_moderator"]);
  const canUseSpecialMentions = hasAny(["admin", "management", "staff", "moderator"]);
  const info = useFanZoneMembership(user?.id ?? null);
  const canEnter = isStaff || info?.status === "approved";
  const mentionCandidates = useMentionCandidates(canUseSpecialMentions);

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
  const [createdTopicId, setCreatedTopicId] = useState<string | null>(null);
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [poll, setPoll] = useState<DraftPoll | null>(null);

  const PAGE_SIZE = 20;
  const totalPages = Math.max(1, Math.ceil(totalTopics / PAGE_SIZE));

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
  }, [slug, canEnter, page]);

  // Live updates: refresh the topic list when topics or posts change in this board.
  useEffect(() => {
    if (!canEnter || !board) return;
    const ch = supabase
      .channel(`forum-board-${board.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "forum_topics", filter: `board_id=eq.${board.id}` },
        () => { void reloadTopics(); },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "forum_posts" },
        () => { void reloadTopics(); },
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
    const bRaw = body.trim();
    if (t.length < 3) { toast.error("Title too short"); return; }
    if (bRaw.length < 1 || bRaw === "<p><br></p>") { toast.error("Add some body text"); return; }
    const b = prepareForumPostBody(bRaw);
    submittingRef.current = true;
    setSubmitting(true);
    const { data: topic, error } = await supabase
      .from("forum_topics")
      .insert({ board_id: board.id, author_id: user.id, title: t.slice(0, 200) })
      .select("id")
      .single();
    if (error || !topic) {
      submittingRef.current = false;
      setSubmitting(false);
      toast.error("Couldn't create topic", { description: error?.message });
      return;
    }
    const { error: postErr } = await supabase
      .from("forum_posts")
      .insert({ topic_id: (topic as { id: string }).id, author_id: user.id, body: b, is_op: true });
    submittingRef.current = false;
    setSubmitting(false);
    if (postErr) {
      toast.error("Couldn't post first message", { description: postErr.message });
      return;
    }
    if (poll) {
      const err = await persistDraftPoll((topic as { id: string }).id, user.id, poll);
      if (err) toast.error("Poll not saved", { description: err });
    }
    setOpen(false); setTitle(""); setBody(""); setPoll(null);
    setCreatedTopicId((topic as { id: string }).id);
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

  const canPost = !board.is_locked && (isStaff || info?.status === "approved");
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

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px] lg:grid-cols-[minmax(0,1fr)_256px] md:items-start">
        <div className="min-w-0 space-y-4">
          {canPost && open && (
            <section
              aria-label={`New topic in ${board.name}`}
              className="rounded-2xl border border-[#E11B22]/30 bg-surface-1 p-4 sm:p-5 shadow-soft min-w-0"
            >
              <div className="flex items-center justify-between gap-3 mb-3">
                <h3 className="font-display text-base font-bold">New topic in {board.name}</h3>
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
              </div>
              <div className="space-y-3 min-w-0 [&_*]:break-words">
                <Input
                  placeholder="Topic title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value.slice(0, 200))}
                  maxLength={200}
                />
                <div className="min-w-0 overflow-hidden">
                  <HtmlEditor
                    value={body}
                    onChange={setBody}
                    placeholder="What's on your mind? Paste an X or Facebook URL on its own line to embed it."
                    mentions={mentionCandidates}
                  />
                </div>
                  {poll ? (
                    <PollDraftEditor value={poll} onChange={setPoll} onRemove={() => setPoll(null)} />
                  ) : (
                    <div>
                      <Button type="button" variant="outline" size="sm" onClick={() => setPoll({ question: "", options: ["", ""], allow_multiple: false })}>
                        <BarChart3 className="size-4 mr-1" /> Add poll
                      </Button>
                    </div>
                  )}
                  <div className="flex justify-end">
                  <Button onClick={submit} disabled={submitting} className="bg-gradient-to-r from-[#E11B22] to-[#8B0F14] hover:from-[#F02B30] hover:to-[#9B1118] border-0 text-white">
                    {submitting ? <><Loader2 className="size-4 mr-1 animate-spin" />Posting…</> : "Post topic"}
                  </Button>
                </div>
              </div>
            </section>
          )}
          {topics.length === 0 ? (
            <div className="rounded-2xl border border-[#E11B22]/20 bg-surface-1 px-4 py-10 text-center text-sm text-muted-foreground shadow-soft">
              No topics yet. {canPost ? "Be first — start one!" : ""}
            </div>
          ) : (
            <div className="space-y-2.5">
              {topics.map((t) => {
            const author = profiles[t.author_id];
            const last = t.last_post_by ? profiles[t.last_post_by] : null;
            const authorName = author?.display_name || author?.username || "Someone";
            const lastName = last?.display_name || last?.username || authorName;
            const canEdit = !!user && (t.author_id === user.id || isBoardMod);
            const canDelete = !!user && (t.author_id === user.id || isBoardMod);
            return (
              <article
                key={t.id}
                className="group relative rounded-xl border border-border/80 bg-gradient-to-br from-surface-1 via-surface-1 to-surface-2/60 hover:border-[#E11B22]/60 hover:shadow-[0_10px_36px_-14px_rgba(225,27,34,0.55)] hover:-translate-y-[1px] transition-all overflow-hidden shadow-soft"
              >
                <span
                  aria-hidden
                  className={`absolute left-0 top-0 bottom-0 w-[3px] ${t.is_sticky ? "bg-gradient-to-b from-[#F4B400] to-[#B8860B]" : "bg-gradient-to-b from-[#E11B22] to-[#8B0F14]"} opacity-70 group-hover:opacity-100 transition-opacity`}
                />
                <div className="flex items-start gap-3 p-4 pl-5">
                  <div className="hidden sm:flex shrink-0 size-10 rounded-lg bg-gradient-to-br from-[#E11B22]/15 to-[#8B0F14]/10 border border-[#E11B22]/25 items-center justify-center text-[#E11B22] shadow-inner">
                    <MessageSquare className="size-4" />
                  </div>
                  <Link
                    to="/forum/$board/$topic"
                    params={{ board: slug, topic: t.id }}
                    className="flex-1 min-w-0 block focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E11B22] rounded-lg"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      {t.is_sticky && (
                        <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 bg-[#F4B400]/15 text-[#F4B400] border border-[#F4B400]/30 text-[10px] font-bold uppercase tracking-wider shrink-0">
                          <Pin className="size-2.5" />Pinned
                        </span>
                      )}
                      {t.is_locked && (
                        <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 bg-muted/40 text-muted-foreground border border-border text-[10px] font-bold uppercase tracking-wider shrink-0">
                          <Lock className="size-2.5" />Locked
                        </span>
                      )}
                      <span className="font-display font-semibold leading-snug text-foreground text-[15px] group-hover:text-[#E11B22] transition-colors">
                        {t.title}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1.5">
                      <span className="inline-flex items-center justify-center size-4 rounded-full bg-[#E11B22]/20 text-[#E11B22] text-[9px] font-bold uppercase">
                        {authorName.charAt(0)}
                      </span>
                      by <span className="text-foreground font-medium">{authorName}</span>
                      <span className="text-border">•</span>
                      <span>{formatLastSeen(t.created_at)}</span>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-2/80 border border-border/60 font-medium tabular-nums">
                        <MessageSquare className="size-3 text-[#E11B22]" />
                        {t.reply_count}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-2/80 border border-border/60 font-medium tabular-nums">
                        <Eye className="size-3 text-muted-foreground" />
                        {t.view_count}
                      </span>
                      <span className="truncate ml-0.5">
                        last by <span className="text-foreground font-medium">{lastName}</span>
                        <span className="text-border mx-1">•</span>
                        {formatLastSeen(t.last_post_at)}
                      </span>
                    </div>
                  </Link>
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
          )}

          {totalPages > 1 && (
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
        <aside className="hidden md:block md:sticky md:top-4" aria-label="Sponsored advert">
          {renderSponsorAdvert()}
        </aside>
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

      <Dialog open={!!createdTopicId} onOpenChange={(o) => { if (!o) setCreatedTopicId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-500" /> Topic posted
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Your topic is live in {board.name}.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatedTopicId(null)}>Stay here</Button>
            <Button
              onClick={() => {
                const id = createdTopicId;
                setCreatedTopicId(null);
                if (id) void navigate({ to: "/forum/$board/$topic", params: { board: slug, topic: id } });
              }}
              className="bg-gradient-to-r from-[#E11B22] to-[#8B0F14] hover:from-[#F02B30] hover:to-[#9B1118] border-0 text-white"
            >
              View post
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}