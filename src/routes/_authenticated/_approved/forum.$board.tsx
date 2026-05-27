import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Pin, Lock, Loader2, Plus, ArrowLeft, Eye, MessageSquare, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useFanZoneMembership } from "@/hooks/use-fan-zone";
import { formatLastSeen } from "@/lib/relative-time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HtmlEditor } from "@/components/ui/html-editor";
import { embedSocialUrls } from "@/lib/forum-embeds";
import { useMentionCandidates } from "@/hooks/use-mention-candidates";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_approved/forum/$board")({
  component: BoardPage,
});

type Board = { id: string; name: string; slug: string; description: string; is_locked: boolean };
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
  const isStaff = hasAny(["admin", "management", "moderator"]);
  const canUseSpecialMentions = hasAny(["admin", "management", "staff", "moderator"]);
  const info = useFanZoneMembership(user?.id ?? null);
  const canEnter = isStaff || info?.status === "approved";
  const mentionCandidates = useMentionCandidates(canUseSpecialMentions);

  const [board, setBoard] = useState<Board | null>(null);
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [createdTopicId, setCreatedTopicId] = useState<string | null>(null);

  useEffect(() => {
    if (!canEnter) return;
    void (async () => {
      const { data: b } = await supabase
        .from("forum_boards")
        .select("id, name, slug, description, is_locked")
        .eq("slug", slug)
        .maybeSingle();
      if (!b) { setBoard(null); setTopics([]); return; }
      setBoard(b as Board);
      const { data: ts } = await supabase
        .from("forum_topics")
        .select("id, title, author_id, is_sticky, is_locked, view_count, reply_count, last_post_at, last_post_by, created_at")
        .eq("board_id", (b as Board).id)
        .order("is_sticky", { ascending: false })
        .order("last_post_at", { ascending: false })
        .limit(100);
      const list = (ts ?? []) as Topic[];
      setTopics(list);
      const ids = Array.from(new Set([
        ...list.map((t) => t.author_id),
        ...list.map((t) => t.last_post_by).filter((x): x is string => !!x),
      ]));
      if (ids.length) {
        const { data: ps } = await supabase.from("profiles").select("id, display_name, username").in("id", ids);
        const map: Record<string, Profile> = {};
        (ps ?? []).forEach((p) => { map[p.id as string] = p as Profile; });
        setProfiles(map);
      }
    })();
  }, [slug, canEnter]);

  const submit = async () => {
    if (!user || !board) return;
    if (submittingRef.current) return;
    const t = title.trim();
    const bRaw = body.trim();
    if (t.length < 3) { toast.error("Title too short"); return; }
    if (bRaw.length < 1 || bRaw === "<p><br></p>") { toast.error("Add some body text"); return; }
    const b = embedSocialUrls(bRaw);
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
    setOpen(false); setTitle(""); setBody("");
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
          <Button onClick={() => setOpen(true)} className="bg-gradient-to-r from-[#E11B22] to-[#8B0F14] hover:from-[#F02B30] hover:to-[#9B1118] border-0 text-white shadow-[0_4px_20px_-6px_rgba(225,27,34,0.6)]">
            <Plus className="size-4 mr-1" /> New topic
          </Button>
        )}
      </div>

      <div className="rounded-xl border border-[#E11B22]/20 overflow-hidden">
        <div className="hidden md:grid grid-cols-[1fr_80px_80px_180px] gap-3 px-4 py-2 text-[11px] uppercase tracking-wide text-muted-foreground border-b bg-surface-1">
          <div>Topic</div><div className="text-right">Replies</div><div className="text-right">Views</div><div className="text-right">Last post</div>
        </div>
        {topics.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            No topics yet. {canPost ? "Be first — start one!" : ""}
          </div>
        ) : topics.map((t) => {
          const author = profiles[t.author_id];
          const last = t.last_post_by ? profiles[t.last_post_by] : null;
          const authorName = author?.display_name || author?.username || "Someone";
          const lastName = last?.display_name || last?.username || authorName;
          return (
            <Link
              key={t.id}
              to="/forum/$board/$topic"
              params={{ board: slug, topic: t.id }}
              className="grid md:grid-cols-[1fr_80px_80px_180px] gap-3 px-4 py-3 items-center border-b last:border-b-0 hover:bg-[#E11B22]/5 hover:border-l-2 hover:border-l-[#E11B22] transition-all"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {t.is_sticky && (
                    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 bg-[#F4B400]/15 text-[#F4B400] text-[9px] font-bold uppercase tracking-wider shrink-0">
                      <Pin className="size-2.5" />Pinned
                    </span>
                  )}
                  {t.is_locked && <Lock className="size-3.5 text-muted-foreground shrink-0" />}
                  <span className="font-medium truncate">{t.title}</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  by <span className="text-foreground">{authorName}</span> · {formatLastSeen(t.created_at)}
                </div>
              </div>
              <div className="md:text-right text-xs"><MessageSquare className="size-3 inline md:hidden mr-1" />{t.reply_count}</div>
              <div className="md:text-right text-xs"><Eye className="size-3 inline md:hidden mr-1" />{t.view_count}</div>
              <div className="md:text-right text-[11px] text-muted-foreground">
                {formatLastSeen(t.last_post_at)}
                <div className="truncate">by <span className="text-foreground">{lastName}</span></div>
              </div>
            </Link>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New topic in {board.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Topic title" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 200))} maxLength={200} />
            <HtmlEditor
              value={body}
              onChange={setBody}
              placeholder="What's on your mind? Paste an X or Facebook URL on its own line to embed it."
              mentions={mentionCandidates}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? <><Loader2 className="size-4 mr-1 animate-spin" />Posting…</> : "Post topic"}
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