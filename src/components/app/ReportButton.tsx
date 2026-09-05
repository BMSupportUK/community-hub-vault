import { useEffect, useState } from "react";
import { Flag, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Props = {
  kind: "forum_post" | "dm_message";
  targetId: string;
  disabled?: boolean;
  className?: string;
  variant?: "chip" | "icon";
};

/* ------------------------------------------------------------------ *
 * "Already reported" state, batched across every post on the page so
 * a topic with 40 replies makes one request, not 40.
 * ------------------------------------------------------------------ */
const reportedCache = new Map<string, number>();
const reportedSubscribers = new Map<string, Set<(count: number) => void>>();
const pendingIds = new Set<string>();
let pendingTimer: number | null = null;

function notifyReported(id: string, count: number) {
  reportedCache.set(id, count);
  reportedSubscribers.get(id)?.forEach((fn) => fn(count));
}

function scheduleReportedLoad(id: string) {
  if (reportedCache.has(id)) return;
  pendingIds.add(id);
  if (pendingTimer) return;
  pendingTimer = window.setTimeout(() => {
    pendingTimer = null;
    const ids = Array.from(pendingIds);
    pendingIds.clear();
    if (ids.length === 0) return;
    void supabase
      .rpc("forum_reported_posts", { _ids: ids })
      .then(({ data }) => {
        const counts = new Map<string, number>();
        ((data ?? []) as { target_id: string; report_count: number }[]).forEach((row) =>
          counts.set(row.target_id, row.report_count),
        );
        ids.forEach((postId) => notifyReported(postId, counts.get(postId) ?? 0));
      });
  }, 25);
}

function useReportedCount(kind: Props["kind"], targetId: string) {
  const [count, setCount] = useState(() => reportedCache.get(targetId) ?? 0);

  useEffect(() => {
    if (kind !== "forum_post") return;
    setCount(reportedCache.get(targetId) ?? 0);
    const set = reportedSubscribers.get(targetId) ?? new Set<(n: number) => void>();
    set.add(setCount);
    reportedSubscribers.set(targetId, set);
    scheduleReportedLoad(targetId);
    return () => {
      set.delete(setCount);
      if (set.size === 0) reportedSubscribers.delete(targetId);
    };
  }, [kind, targetId]);

  return kind === "forum_post" ? count : 0;
}

export function ReportButton({ kind, targetId, disabled, className, variant = "chip" }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const reportedCount = useReportedCount(kind, targetId);
  const alreadyReported = reportedCount > 0;


  const submit = async () => {
    const text = reason.trim();
    if (text.length < 3) return toast.error("Please describe the issue (min 3 chars)");
    setBusy(true);
    const { error } = await supabase.rpc("submit_content_report", {
      _kind: kind,
      _target: targetId,
      _reason: text.slice(0, 1000),
    });
    setBusy(false);
    if (error) return toast.error("Couldn't send report", { description: error.message });
    if (kind === "forum_post") notifyReported(targetId, (reportedCache.get(targetId) ?? 0) + 1);
    toast.success("Report sent to moderators");
    setReason("");
    setOpen(false);
  };

  const trigger =
    variant === "icon" ? (
      <button
        type="button"
        disabled={disabled}
        title="Report"
        aria-label="Report message"
        className={`inline-flex items-center justify-center rounded-full p-1 text-muted-foreground hover:text-[#E11B22] hover:bg-[#E11B22]/10 disabled:opacity-50 ${className ?? ""}`}
      >
        <Flag className="size-3.5" />
      </button>
    ) : alreadyReported ? (
      <button
        type="button"
        disabled={disabled}
        title="This post has already been reported and is waiting for a moderator"
        className={`inline-flex items-center gap-1 rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400 disabled:opacity-50 ${className ?? ""}`}
      >
        <Flag className="size-3.5" />
        <span>
          Reported<span className="hidden sm:inline"> — with the moderators</span>
        </span>
      </button>
    ) : (
      <button
        type="button"
        disabled={disabled}
        title="Report this post"
        className={`inline-flex items-center gap-1 rounded-full border border-dashed border-border bg-transparent px-2 py-0.5 text-xs text-muted-foreground hover:border-[#E11B22]/50 hover:text-[#E11B22] disabled:opacity-50 ${className ?? ""}`}
      >
        <Flag className="size-3.5" />
        <span className="hidden sm:inline">Report</span>
      </button>
    );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report {kind === "dm_message" ? "message" : "post"}</DialogTitle>
        </DialogHeader>
        {alreadyReported && (
          <p className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
            This post has already been reported and is waiting for a moderator — you only need to report it again if
            there's something else they should know.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Tell the moderators what's wrong. Reports are reviewed by owners and Boro Fan Zone moderators.
        </p>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, 1000))}
          placeholder="e.g. abusive language, spam, harassment…"
          rows={4}
          autoFocus
        />
        <div className="text-[10px] text-muted-foreground text-right">{reason.length}/1000</div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={busy || reason.trim().length < 3} className="bg-[#E11B22] hover:bg-[#c5161c] text-white">
            {busy ? <Loader2 className="size-4 animate-spin mr-1" /> : <Flag className="size-4 mr-1" />}
            Submit report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}