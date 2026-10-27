import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { REMOTE_SETUP_STEPS, stepDone, type AppChecks, type SetupDevice } from "@/lib/ticket-remote-setup";

type Row = { device: SetupDevice; app_checks: AppChecks | null; app_checked_at: string | null; completed_at: string | null };

/** Instruction navigation is presentation only; app reports still own all verified checks. */
export function RemoteSetupWizard({ row, referenceActive, confirmation, connection }: {
  row: Row; referenceActive: boolean; confirmation: ReactNode; connection: ReactNode;
}) {
  const steps = REMOTE_SETUP_STEPS[row.device];
  const firstIncomplete = steps.findIndex(step => !stepDone(step, row));
  const measured = referenceActive || row.completed_at ? steps.length - 1 : firstIncomplete < 0 ? steps.length - 1 : firstIncomplete;
  const [current, setCurrent] = useState(measured);
  useEffect(() => { setCurrent(measured); }, [measured, row.device]);
  const step = steps[current];
  if (!step) return null;
  return <div className="space-y-5 text-foreground">
    <div className="space-y-3 border-y border-border py-4">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold">Step {current + 1} of {steps.length}</span>
        <span className="text-muted-foreground">{stepDone(step, row) ? "Confirmed by Enabler" : "Remote setup"}</span>
      </div>
      <progress aria-label="Remote setup progress" value={current + 1} max={steps.length} className="h-2 w-full accent-primary" />
      <div className="grid grid-cols-4 gap-2" aria-hidden="true">
        {steps.map((item, index) => <span key={item.proof} className={`h-1 rounded-full ${index <= current ? "bg-primary" : "bg-muted"}`} />)}
      </div>
    </div>
    <section aria-label={`Step ${current + 1}: ${step.title}`} className="min-h-44 space-y-4">
      <h3 className="flex items-start gap-2 text-lg font-semibold">{stepDone(step, row) && <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />}{step.title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
      <div className={current === 2 ? "" : "hidden"}>{confirmation}</div>
      {current === steps.length - 1 && connection}
    </section>
    <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
      <Button variant="outline" disabled={current === 0} onClick={() => setCurrent(value => Math.max(0, value - 1))}><ArrowLeft className="size-4" />Back</Button>
      {current < steps.length - 1 && <Button onClick={() => setCurrent(value => Math.min(steps.length - 1, value + 1))}>Next<ArrowRight className="size-4" /></Button>}
    </div>
  </div>;
}