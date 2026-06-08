import { useState } from "react";
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

export function ReportButton({ kind, targetId, disabled, className, variant = "chip" }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

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
        <p className="text-xs text-muted-foreground">
          Tell the moderators what's wrong. Reports are reviewed by admins and Boro Fan Zone moderators.
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