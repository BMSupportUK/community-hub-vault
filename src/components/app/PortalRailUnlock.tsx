import { useEffect, useState } from "react";
import { Lock, LockOpen } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PortalLock, usePortalUnlocked } from "@/components/app/PortalLock";
import { UnlockedDone } from "@/components/app/PortalUnlockButton";
import { PORTAL_EXPIRY_KEY, portalCountdown, portalSecondsRemaining } from "@/lib/customer-portal";
import { cn } from "@/lib/utils";

/** Side-rail unlock control that sits beside the Home button. */
export function PortalRailUnlock() {
  const unlocked = usePortalUnlocked();
  const [open, setOpen] = useState(false);
  const [left, setLeft] = useState(0);
  useEffect(() => {
    const tick = () => {
      try {
        setLeft(portalSecondsRemaining(window.localStorage.getItem(PORTAL_EXPIRY_KEY)));
      } catch {
        setLeft(0);
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);
  const label = unlocked ? `Portal unlocked · locks in ${portalCountdown(left)}` : "Unlock portal";
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={label}
            title={label}
            className={cn(
              "group relative z-10 size-[52px] rounded-2xl flex items-center justify-center transition-all duration-200",
              unlocked
                ? "bg-emerald-500/15 text-emerald-300 ring-2 ring-emerald-400/50 hover:scale-110"
                : "bg-[color-mix(in_oklab,var(--surface)_62%,transparent)] text-primary-glow ring-2 ring-primary-glow/60 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--foreground)_12%,transparent)] hover:bg-gradient-primary hover:text-primary-foreground hover:scale-110"
            )}
          >
            {unlocked ? <LockOpen className="size-[22px]" /> : <Lock className="size-[22px]" />}
            {!unlocked && (
              <span className="absolute -top-1 -right-1 size-4 rounded-full bg-red-500 ring-2 ring-rail animate-pulse" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8} className="z-[1000] whitespace-nowrap text-xs font-medium">
          {label}
        </TooltipContent>
      </Tooltip>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogTitle className="sr-only">Unlock Customer Portal</DialogTitle>
          <PortalLock>
            <UnlockedDone onClose={() => setOpen(false)} />
          </PortalLock>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
