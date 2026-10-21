import { useState } from "react";
import { Lock, LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { PortalLock, usePortalUnlocked } from "@/components/app/PortalLock";

/** Welcome-screen button that opens the emailed-code unlock for the Customer Portal. */
export function PortalUnlockButton() {
  const unlocked = usePortalUnlocked();
  const [open, setOpen] = useState(false);
  if (unlocked) {
    return (
      <span className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/15 px-3 py-2 text-sm font-semibold text-white">
        <LockOpen className="size-4" /> Portal unlocked
      </span>
    );
  }
  return (
    <>
      <Button size="lg" onClick={() => setOpen(true)} className="gap-2 font-bold shadow-lg">
        <Lock className="size-4" /> Unlock portal
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogTitle className="sr-only">Unlock Customer Portal</DialogTitle>
          <PortalLock>
            <UnlockedDone onClose={() => setOpen(false)} />
          </PortalLock>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function UnlockedDone({ onClose }: { onClose: () => void }) {
  return (
    <div className="py-6 text-center">
      <LockOpen className="mx-auto size-10 text-primary" />
      <h2 className="mt-3 font-display text-xl font-bold">Portal unlocked</h2>
      <p className="mt-1 text-sm text-muted-foreground">Your portal tabs are open for the next hour.</p>
      <Button className="mt-4" onClick={onClose}>Continue</Button>
    </div>
  );
}
