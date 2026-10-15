"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "@/lib/utils";

/**
 * Radix keeps a tooltip open while its trigger is focused. On phones (and when
 * returning to the tab/app) the tapped trigger is still focused, so the tooltip
 * hangs around until you tap elsewhere. Blur the focused element whenever the
 * page becomes visible again so no tooltip survives the return.
 */
function TooltipProvider(props: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Provider>) {
  React.useEffect(() => {
    const blur = () => {
      const el = document.activeElement;
      if (el instanceof HTMLElement && el !== document.body) el.blur();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") blur();
    };
    window.addEventListener("focus", blur);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", blur);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return <TooltipPrimitive.Provider {...props} />;
}

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 overflow-hidden rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-(--radix-tooltip-content-transform-origin)",
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
