import { useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SmilePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ReportButton } from "@/components/app/ReportButton";

const EMOJIS = ["👍", "❤️", "😂", "🔥", "🎉", "😮", "😢", "⚽", "🦁"];

type Row = { user_id: string; emoji: string };
type DbRow = Row & { post_id: string };

const reactionCache = new Map<string, Row[]>();
const reactionSubscribers = new Map<string, Set<(rows: Row[]) => void>>();
const pendingPostIds = new Set<string>();
let pendingTimer: number | null = null;

function notifyPost(postId: string, rows: Row[]) {
  reactionCache.set(postId, rows);
  reactionSubscribers.get(postId)?.forEach((listener) => listener(rows));
}

function setCachedRows(postId: string, updater: (rows: Row[]) => Row[]) {
  notifyPost(postId, updater(reactionCache.get(postId) ?? []));
}

function scheduleReactionLoad(postId: string, force = false) {
  if (!force && reactionCache.has(postId)) return;
  pendingPostIds.add(postId);
  if (pendingTimer) return;
  pendingTimer = window.setTimeout(() => {
    pendingTimer = null;
    const ids = Array.from(pendingPostIds);
    pendingPostIds.clear();
    if (ids.length === 0) return;
    void supabase
      .from("forum_post_reactions")
      .select("post_id, user_id, emoji")
      .in("post_id", ids)
      .then(({ data }) => {
        const grouped = new Map<string, Row[]>();
        ids.forEach((id) => grouped.set(id, []));
        ((data ?? []) as DbRow[]).forEach((row) => {
          const rows = grouped.get(row.post_id) ?? [];
          rows.push({ user_id: row.user_id, emoji: row.emoji });
          grouped.set(row.post_id, rows);
        });
        grouped.forEach((rows, id) => notifyPost(id, rows));
      });
  }, 25);
}

export function ForumPostReactions({
  postId,
  userId,
  canReact,
}: {
  postId: string;
  userId: string | null;
  canReact: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(() => reactionCache.get(postId) ?? []);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const listener = (nextRows: Row[]) => setRows(nextRows);
    const listeners = reactionSubscribers.get(postId) ?? new Set<(nextRows: Row[]) => void>();
    listeners.add(listener);
    reactionSubscribers.set(postId, listeners);
    const cached = reactionCache.get(postId);
    if (cached) setRows(cached);
    scheduleReactionLoad(postId);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) reactionSubscribers.delete(postId);
    };
  }, [postId]);

  const grouped = rows.reduce<Record<string, { count: number; mine: boolean }>>((acc, r) => {
    const entry = acc[r.emoji] ?? { count: 0, mine: false };
    entry.count += 1;
    if (userId && r.user_id === userId) entry.mine = true;
    acc[r.emoji] = entry;
    return acc;
  }, {});

  const toggle = async (emoji: string) => {
    if (!userId || !canReact) return;
    const mine = grouped[emoji]?.mine;
    // optimistic
    setCachedRows(postId, (prev) =>
      mine
        ? prev.filter((r) => !(r.user_id === userId && r.emoji === emoji))
        : [...prev, { user_id: userId, emoji }],
    );
    if (mine) {
      const { error } = await supabase
        .from("forum_post_reactions")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", userId)
        .eq("emoji", emoji);
      if (error) toast.error("Couldn't remove reaction", { description: error.message });
      else scheduleReactionLoad(postId, true);
    } else {
      const { error } = await supabase
        .from("forum_post_reactions")
        .insert({ post_id: postId, user_id: userId, emoji });
      if (error) toast.error("Couldn't react", { description: error.message });
      else scheduleReactionLoad(postId, true);
      setOpen(false);
    }
  };

  const entries = Object.entries(grouped);

  if (entries.length === 0 && !canReact && !userId) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3">
      {entries.map(([emoji, { count, mine }]) => (
        <button
          key={emoji}
          type="button"
          disabled={!canReact}
          onClick={() => void toggle(emoji)}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
            mine
              ? "border-[#E11B22]/60 bg-[#E11B22]/15 text-foreground"
              : "border-border bg-surface-1 hover:bg-[#E11B22]/5 hover:border-[#E11B22]/40"
          } ${canReact ? "cursor-pointer" : "cursor-default"}`}
        >
          <span>{emoji}</span>
          <span className="tabular-nums text-[11px] text-muted-foreground">{count}</span>
        </button>
      ))}
      {canReact && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-border bg-transparent px-2 py-0.5 text-xs text-muted-foreground hover:border-[#E11B22]/50 hover:text-foreground"
              aria-label="Add reaction"
            >
              <SmilePlus className="size-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start">
            <div className="flex gap-1">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => void toggle(e)}
                  className="text-lg leading-none rounded p-1 hover:bg-[#E11B22]/10"
                >
                  {e}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
      {userId && <ReportButton kind="forum_post" targetId={postId} />}
    </div>
  );
}