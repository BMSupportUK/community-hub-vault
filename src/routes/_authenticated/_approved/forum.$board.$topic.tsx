import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, Pin, Lock, Quote, Reply as ReplyIcon, Pencil, Trash2, Send, History, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useFanZoneMembership } from "@/hooks/use-fan-zone";
import { formatLastSeen } from "@/lib/relative-time";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HtmlEditor } from "@/components/ui/html-editor";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ForumPostBody } from "@/components/app/ForumPostBody";
import { ForumPostReactions } from "@/components/app/ForumPostReactions";
import { embedSocialUrls } from "@/lib/forum-embeds";
import { useMentionCandidates } from "@/hooks/use-mention-candidates";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_approved/forum/$board/$topic")({
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
type Board = { id: string; name: string; slug: string };
type Post = {
  id: string;
  topic_id: string;
  author_id: string;
  body: string;
  quote_of: string | null;
  edited_at: string | null;
  is_op: boolean;
  created_at: string;
};
type Profile = { id: string; display_name: string | null; username: string | null; avatar_url: string | null };
type EditEntry = { id: string; previous_body: string; edited_at: string; edited_by: string };

function TopicPage() {
  const { board: slug, topic: topicId } = Route.useParams();
  const navigate = useNavigate();
  const { user, hasAny } = useAuth();
  const isStaff = hasAny(["admin", "management", "moderator"]);
  const canUseSpecialMentions = hasAny(["admin", "management", "staff", "moderator"]);
  const info = useFanZoneMembership(user?.id ?? null);
  const canEnter = isStaff || hasAny(["staff"]) || info?.status === "approved";
  const mentionCandidates = useMentionCandidates(canUseSpecialMentions);

  const [board, setBoard] = useState<Board | null>(null);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [moderatorIds, setModeratorIds] = useState<Set<string>>(new Set());
  const [reply, setReply] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [replySuccessOpen, setReplySuccessOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [historyFor, setHistoryFor] = useState<Post | null>(null);
  const [history, setHistory] = useState<EditEntry[]>([]);
  const [tab, setTab] = useState<"posts" | "reply">("posts");
  const [page, setPage] = useState(1);
  const REPLIES_PER_PAGE = 20;

  const isBoardMod = isStaff || (user ? moderatorIds.has(user.id) : false);
  const canPost = canEnter && !!topic && !topic.is_locked;

  const load = async () => {
    const { data: t } = await supabase
      .from("forum_topics")
      .select("id, board_id, author_id, title, is_sticky, is_locked, view_count, reply_count")
      .eq("id", topicId)
      .maybeSingle();
    if (!t) { setTopic(null); setPosts([]); return; }
    setTopic(t as Topic);
    const { data: b } = await supabase.from("forum_boards").select("id, name, slug").eq("id", (t as Topic).board_id).maybeSingle();
    setBoard((b as Board | null) ?? null);
    const { data: mods } = await supabase.from("forum_board_moderators").select("user_id").eq("board_id", (t as Topic).board_id);
    setModeratorIds(new Set(((mods ?? []) as { user_id: string }[]).map((m) => m.user_id)));
    const { data: ps } = await supabase
      .from("forum_posts")
      .select("id, topic_id, author_id, body, quote_of, edited_at, is_op, created_at")
      .eq("topic_id", topicId)
      .order("created_at");
    const list = (ps ?? []) as Post[];
    setPosts(list);
    const ids = Array.from(new Set(list.map((p) => p.author_id)));
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, display_name, username, avatar_url").in("id", ids);
      const map: Record<string, Profile> = {};
      (profs ?? []).forEach((p) => { map[p.id as string] = p as Profile; });
      setProfiles(map);
    }
  };

  useEffect(() => {
    if (!canEnter) return;
    void load();
    // Increment view count once
    void supabase.rpc("forum_increment_view", { _topic: topicId });
    const ch = supabase
      .channel(`forum-topic-${topicId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "forum_posts", filter: `topic_id=eq.${topicId}` }, () => void load())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "forum_topics", filter: `id=eq.${topicId}` }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId, canEnter]);

  const submitReply = async () => {
    if (!user || !topic) return;
    if (submittingRef.current) return;
    const raw = reply.trim();
    if (raw.length < 1 || raw === "<p><br></p>") return;
    const body = embedSocialUrls(raw);
    submittingRef.current = true;
    setSubmitting(true);
    const { error } = await supabase.from("forum_posts").insert({ topic_id: topic.id, author_id: user.id, body, is_op: false });
    submittingRef.current = false;
    setSubmitting(false);
    if (error) { toast.error("Couldn't post", { description: error.message }); return; }
    setReply("");
    setReplySuccessOpen(true);
    setTab("reply");
    void load();
  };

  const quotePost = (p: Post) => {
    const author = profiles[p.author_id];
    const name = author?.display_name || author?.username || "someone";
    const safeName = name.replace(/</g, "&lt;");
    // Use the original body as-is if it's HTML; otherwise wrap as paragraph.
    const inner = /<[a-z][\s\S]*>/i.test(p.body) ? p.body : `<p>${p.body.replace(/</g, "&lt;").replace(/\n/g, "<br/>")}</p>`;
    const block = `<blockquote><p><strong>${safeName}</strong> wrote:</p>${inner}</blockquote><p><br/></p>`;
    setReply((cur) => (cur || "") + block);
  };

  const replyToPost = (p: Post) => {
    quotePost(p);
    setTab("reply");
    setTimeout(() => {
      document.getElementById("forum-reply-box")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  };

  const startEdit = (p: Post) => { setEditingId(p.id); setEditText(p.body); };
  const saveEdit = async () => {
    if (!editingId) return;
    const raw = editText.trim();
    if (!raw || raw === "<p><br></p>") return;
    const body = embedSocialUrls(raw);
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

  if (!canEnter) return <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-sm text-center">Members only.</div>;
  if (topic === null && posts !== null) {
    return <div className="text-center text-sm text-muted-foreground">Topic not found. <Link to="/forum/$board" params={{ board: slug }} className="underline">Back to board</Link></div>;
  }
  if (!topic || !posts) return <div className="grid place-items-center py-20 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
          <Link to="/forum/$board" params={{ board: slug }}><ArrowLeft className="size-4 mr-1" />{board?.name ?? "Board"}</Link>
        </Button>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <h2 className="font-display text-xl font-bold flex items-center gap-2 min-w-0">
            {topic.is_sticky && <Pin className="size-4 text-[#F4B400]" />}
            {topic.is_locked && <Lock className="size-4 text-muted-foreground" />}
            <span className="truncate">{topic.title}</span>
          </h2>
          {isBoardMod && (
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" onClick={toggleSticky}>{topic.is_sticky ? "Unpin" : "Pin"}</Button>
              <Button size="sm" variant="outline" onClick={toggleLock}>{topic.is_locked ? "Unlock" : "Lock"}</Button>
              <Button size="sm" variant="destructive" onClick={deleteTopic}><Trash2 className="size-3.5" /></Button>
            </div>
          )}
        </div>
      </div>

      {(() => {
        const opPost = posts.find((p) => p.is_op) ?? null;
        const replies = posts.filter((p) => !p.is_op);
        const totalPages = Math.max(1, Math.ceil(replies.length / REPLIES_PER_PAGE));
        const safePage = Math.min(page, totalPages);
        const start = (safePage - 1) * REPLIES_PER_PAGE;
        const pageReplies = replies.slice(start, start + REPLIES_PER_PAGE);
        const renderPost = (p: Post, i: number) => {
                const author = profiles[p.author_id];
                const name = author?.display_name || author?.username || "Someone";
                const canEdit = user && (p.author_id === user.id || isBoardMod);
                const canDelete = user && ((p.author_id === user.id && !p.is_op) || isBoardMod);
                return (
                  <article
                    key={p.id}
                    className={`rounded-xl border bg-surface-1 overflow-hidden ${
                      p.is_op
                        ? "border-[#E11B22]/40 shadow-[0_4px_20px_-12px_rgba(225,27,34,0.5)]"
                        : "border-border"
                    }`}
                  >
                    <header
                      className={`grid grid-cols-[auto_1fr_auto] gap-3 px-4 py-2 items-center border-b text-xs ${
                        p.is_op ? "bg-gradient-to-r from-[#E11B22]/10 to-transparent" : ""
                      }`}
                    >
                      <div className="size-7 rounded-full bg-gradient-to-br from-[#E11B22] to-[#8B0F14] grid place-items-center text-[10px] font-bold text-white overflow-hidden ring-1 ring-white/10">
                        {author?.avatar_url ? <img src={author.avatar_url} alt="" className="size-7 object-cover" /> : name.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <span className="font-semibold">{name}</span>
                        {p.is_op && (
                          <span className="ml-1.5 inline-block rounded bg-[#E11B22] text-white text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 align-middle">
                            OP
                          </span>
                        )}
                        <span className="text-muted-foreground"> · #{i + 1} · {formatLastSeen(p.created_at)}</span>
                        {p.edited_at && (
                          <button onClick={() => void openHistory(p)} className="ml-2 inline-flex items-center gap-1 text-[10px] text-[#F4B400] hover:underline">
                            <History className="size-3" />edited {formatLastSeen(p.edited_at)}
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {canPost && <Button size="sm" variant="ghost" onClick={() => replyToPost(p)} title="Reply with quote"><ReplyIcon className="size-3.5" /></Button>}
                        {canPost && <Button size="sm" variant="ghost" onClick={() => quotePost(p)} title="Quote"><Quote className="size-3.5" /></Button>}
                        {canEdit && editingId !== p.id && <Button size="sm" variant="ghost" onClick={() => startEdit(p)} title="Edit"><Pencil className="size-3.5" /></Button>}
                        {canDelete && <Button size="sm" variant="ghost" onClick={() => void deletePost(p)} title="Delete"><Trash2 className="size-3.5" /></Button>}
                      </div>
                    </header>
                    <div className="px-4 py-3">
                      {editingId === p.id ? (
                        <div className="space-y-2">
                          <HtmlEditor value={editText} onChange={setEditText} mentions={mentionCandidates} />
                          <div className="flex gap-2 justify-end">
                            <Button size="sm" variant="outline" onClick={() => setEditingId(null)}><X className="size-3.5 mr-1" />Cancel</Button>
                            <Button size="sm" onClick={() => void saveEdit()}><Check className="size-3.5 mr-1" />Save</Button>
                          </div>
                        </div>
                      ) : (
                        <ForumPostBody html={p.body} />
                      )}
                    </div>
                    <ForumPostReactions
                      postId={p.id}
                      userId={user?.id ?? null}
                      canReact={canEnter}
                    />
                  </article>
                );
        };

        return (
          <Tabs value={tab} onValueChange={(v) => setTab(v as "posts" | "reply")} className="w-full">
            <TabsList>
              <TabsTrigger value="posts">Original Post</TabsTrigger>
              <TabsTrigger value="reply">Replies ({replies.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="posts" className="space-y-3 mt-3">
              {opPost ? renderPost(opPost, 0) : (
                <div className="text-sm text-muted-foreground text-center py-6">No original post.</div>
              )}
            </TabsContent>

            <TabsContent value="reply" className="space-y-3 mt-3">
              {pageReplies.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-6">No replies yet.</div>
              ) : (
                pageReplies.map((p) => renderPost(p, posts.findIndex((x) => x.id === p.id)))
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
                <div id="forum-reply-box" className="rounded-xl border border-[#E11B22]/30 bg-surface-1 p-3 space-y-2">
                  <HtmlEditor
                    value={reply}
                    onChange={setReply}
                    placeholder="Write a reply… paste an X or Facebook URL on its own line to embed it."
                    mentions={mentionCandidates}
                  />
                  <div className="flex justify-end">
                    <Button
                      onClick={() => void submitReply()}
                      disabled={submitting || !reply.trim()}
                      className="bg-gradient-to-r from-[#E11B22] to-[#8B0F14] hover:from-[#F02B30] hover:to-[#9B1118] border-0 text-white shadow-[0_4px_20px_-6px_rgba(225,27,34,0.6)]"
                    >
                      {submitting ? <><Loader2 className="size-4 mr-1 animate-spin" />Posting…</> : <><Send className="size-4 mr-1" />Reply</>}
                    </Button>
                  </div>
                </div>
              ) : topic.is_locked ? (
                <div className="rounded-xl border border-muted-foreground/20 bg-muted/20 p-4 text-sm text-center text-muted-foreground">
                  <Lock className="size-4 inline mr-1" /> This topic is locked.
                </div>
              ) : null}
            </TabsContent>
          </Tabs>
        );
      })()}

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

      <Dialog open={replySuccessOpen} onOpenChange={setReplySuccessOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="size-5 text-emerald-500" /> Reply posted
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Your reply has been added to the topic.</p>
          <div className="flex justify-end">
            <Button onClick={() => setReplySuccessOpen(false)}>OK</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}