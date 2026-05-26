import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Loader2, Pin, Lock, Quote, Pencil, Trash2, Send, History, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useFanZoneMembership } from "@/hooks/use-fan-zone";
import { formatLastSeen } from "@/lib/relative-time";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

function PostBody({ text }: { text: string }) {
  // Render basic quote blocks: lines starting with `> ` collapse into a quoted box
  const blocks = useMemo(() => {
    const lines = text.split(/\n/);
    const out: { kind: "text" | "quote"; content: string }[] = [];
    let cur: { kind: "text" | "quote"; content: string } | null = null;
    for (const ln of lines) {
      const isQ = ln.startsWith("> ");
      const k = isQ ? "quote" : "text";
      const content = isQ ? ln.slice(2) : ln;
      if (!cur || cur.kind !== k) {
        if (cur) out.push(cur);
        cur = { kind: k, content };
      } else {
        cur.content += "\n" + content;
      }
    }
    if (cur) out.push(cur);
    return out;
  }, [text]);
  return (
    <div className="space-y-2 text-sm whitespace-pre-wrap break-words">
      {blocks.map((b, i) =>
        b.kind === "quote" ? (
          <blockquote key={i} className="border-l-2 border-amber-500/60 pl-3 py-1 bg-amber-500/5 rounded-sm text-muted-foreground italic whitespace-pre-wrap">
            {b.content}
          </blockquote>
        ) : (
          <p key={i} className="whitespace-pre-wrap">{b.content}</p>
        ),
      )}
    </div>
  );
}

function TopicPage() {
  const { board: slug, topic: topicId } = Route.useParams();
  const navigate = useNavigate();
  const { user, hasAny } = useAuth();
  const isStaff = hasAny(["admin", "management", "moderator"]);
  const info = useFanZoneMembership(user?.id ?? null);
  const canEnter = isStaff || info?.status === "approved";

  const [board, setBoard] = useState<Board | null>(null);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [moderatorIds, setModeratorIds] = useState<Set<string>>(new Set());
  const [reply, setReply] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [historyFor, setHistoryFor] = useState<Post | null>(null);
  const [history, setHistory] = useState<EditEntry[]>([]);
  const replyRef = useRef<HTMLTextAreaElement | null>(null);

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
    const body = reply.trim();
    if (body.length < 1) return;
    setSubmitting(true);
    const { error } = await supabase.from("forum_posts").insert({ topic_id: topic.id, author_id: user.id, body, is_op: false });
    setSubmitting(false);
    if (error) { toast.error("Couldn't post", { description: error.message }); return; }
    setReply("");
  };

  const quotePost = (p: Post) => {
    const author = profiles[p.author_id];
    const name = author?.display_name || author?.username || "someone";
    const quoted = p.body.split("\n").map((l) => `> ${l}`).join("\n");
    setReply((cur) => (cur ? cur + "\n\n" : "") + `> **${name}** wrote:\n${quoted}\n\n`);
    setTimeout(() => replyRef.current?.focus(), 50);
  };

  const startEdit = (p: Post) => { setEditingId(p.id); setEditText(p.body); };
  const saveEdit = async () => {
    if (!editingId) return;
    const body = editText.trim();
    if (!body) return;
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
            {topic.is_sticky && <Pin className="size-4 text-amber-400" />}
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

      <div className="space-y-3">
        {posts.map((p, i) => {
          const author = profiles[p.author_id];
          const name = author?.display_name || author?.username || "Someone";
          const canEdit = user && (p.author_id === user.id || isBoardMod);
          const canDelete = user && ((p.author_id === user.id && !p.is_op) || isBoardMod);
          return (
            <article key={p.id} className="rounded-xl border border-border bg-surface-1 overflow-hidden">
              <header className="grid grid-cols-[auto_1fr_auto] gap-3 px-4 py-2 items-center border-b text-xs">
                <div className="size-7 rounded-full bg-gradient-to-br from-rose-600 to-amber-500 grid place-items-center text-[10px] font-bold text-white overflow-hidden">
                  {author?.avatar_url ? <img src={author.avatar_url} alt="" className="size-7 object-cover" /> : name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <span className="font-semibold">{name}</span>
                  <span className="text-muted-foreground"> · #{i + 1} · {formatLastSeen(p.created_at)}</span>
                  {p.edited_at && (
                    <button onClick={() => void openHistory(p)} className="ml-2 inline-flex items-center gap-1 text-[10px] text-amber-400 hover:underline">
                      <History className="size-3" />edited {formatLastSeen(p.edited_at)}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {canPost && <Button size="sm" variant="ghost" onClick={() => quotePost(p)} title="Quote"><Quote className="size-3.5" /></Button>}
                  {canEdit && editingId !== p.id && <Button size="sm" variant="ghost" onClick={() => startEdit(p)} title="Edit"><Pencil className="size-3.5" /></Button>}
                  {canDelete && <Button size="sm" variant="ghost" onClick={() => void deletePost(p)} title="Delete"><Trash2 className="size-3.5" /></Button>}
                </div>
              </header>
              <div className="px-4 py-3">
                {editingId === p.id ? (
                  <div className="space-y-2">
                    <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={5} />
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)}><X className="size-3.5 mr-1" />Cancel</Button>
                      <Button size="sm" onClick={() => void saveEdit()}><Check className="size-3.5 mr-1" />Save</Button>
                    </div>
                  </div>
                ) : (
                  <PostBody text={p.body} />
                )}
              </div>
            </article>
          );
        })}
      </div>

      {canPost ? (
        <div className="rounded-xl border border-border bg-surface-1 p-3 space-y-2">
          <Textarea ref={replyRef} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply… use the quote button on any post to quote it." rows={4} />
          <div className="flex justify-end">
            <Button onClick={() => void submitReply()} disabled={submitting || !reply.trim()}>
              {submitting ? <><Loader2 className="size-4 mr-1 animate-spin" />Posting…</> : <><Send className="size-4 mr-1" />Reply</>}
            </Button>
          </div>
        </div>
      ) : topic.is_locked ? (
        <div className="rounded-xl border border-muted-foreground/20 bg-muted/20 p-4 text-sm text-center text-muted-foreground">
          <Lock className="size-4 inline mr-1" /> This topic is locked.
        </div>
      ) : null}

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
                  <pre className="whitespace-pre-wrap font-sans">{h.previous_body}</pre>
                </li>
              ))}
            </ol>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}