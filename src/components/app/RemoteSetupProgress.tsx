import { CheckCircle2, Clock3 } from "lucide-react";
import { remoteSetupProgress, type AppChecks } from "@/lib/ticket-remote-setup";

export function RemoteSetupProgress({ row, referenceActive = false }: { row: { app_checks: AppChecks | null; app_checked_at: string | null; completed_at: string | null; checks_used_at?: string | null }; referenceActive?: boolean }) {
  const progress = remoteSetupProgress(row, Date.now(), referenceActive);
  return <div className="space-y-2 border-y border-border py-3 text-foreground" role="status">
    <p className="flex items-center gap-2 font-semibold">{progress.stage === 4 ? <CheckCircle2 className="size-5 shrink-0 text-primary" /> : <Clock3 className="size-5 shrink-0 text-muted-foreground" />}{progress.title}</p>
    <p className="text-sm text-muted-foreground">{progress.detail}</p>
    <progress aria-label="Confirmed TV setup stages" value={progress.stage} max={4} className="h-2 w-full accent-primary" />
  </div>;
}
