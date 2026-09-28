import { Hash, LockKeyhole, MessageSquareText, Slash } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export function TalkCommandsBox() {
  const { hasAny } = useAuth();
  const isStaff = hasAny(["admin", "management", "moderator", "staff"]);

  return (
    <section className="px-2">
      <div className="overflow-hidden rounded-xl border border-border bg-surface-2/60">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <MessageSquareText className="size-4 text-primary" />
          <h2 className="font-display text-xs font-bold uppercase tracking-wider">Channel Commands</h2>
        </div>
        <div className="space-y-2 px-4 py-3 text-xs text-muted-foreground">
          <div className="flex items-start gap-2">
            <LockKeyhole className="mt-0.5 size-3.5 shrink-0 text-amber-400" />
            <span><code className="font-mono text-foreground">!private</code> or <code className="font-mono text-foreground">!s</code> — private message</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 w-3.5 shrink-0 text-center font-bold text-primary">@</span>
            <span>Mention someone</span>
          </div>
          <div className="flex items-start gap-2">
            <Hash className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <span>Jump to a channel</span>
          </div>
          {isStaff && (
            <div className="flex items-start gap-2">
              <Slash className="mt-0.5 size-3.5 shrink-0 text-primary" />
              <span>Staff shortcuts</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}