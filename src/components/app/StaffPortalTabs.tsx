import { Link, useLocation } from "@tanstack/react-router";
import { Home, Settings, Tv, LayoutDashboard, ShoppingCart, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { isPageAllowed, usePagePermissions } from "@/lib/page-access";
import { isStaffPortalUser } from "@/lib/portal-home";
import { BmInboxBell } from "@/components/app/BmInboxBell";
import { MentionsBadge } from "@/components/app/MentionsBadge";
import { NotificationBell } from "@/components/app/NotificationBell";
import { Clocks } from "@/components/app/Clocks";
import { LockNowPill } from "@/components/app/ScreenLockProvider";
import { TwoFactorPill, VpnPill } from "@/components/app/TwoFactorBanner";
import { adminPanelLabel, canOpenAdminPanel } from "@/lib/admin-panel-access";
import { canOpenTvRemoteOverview } from "@/lib/tv-remote";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

/** Pages that sit inside the Staff Portal tab bar (ticket threads keep their own bounded layout). */
export function isStaffPortalPath(path: string) {
  return ["/staff-portal", "/tickets", "/shifts", "/shift-history", "/staff-pin", "/tv-remote", "/staff"].includes(path.replace(/\/$/, "") || "/");
}

/** Staff Portal tab bar: tickets, shifts and other staff tools in one place. */
export function StaffPortalTabs() {
  const { roles } = useAuth();
  const perms = usePagePermissions();
  const p = useLocation().pathname.replace(/\/$/, "");
  if (!isStaffPortalUser(roles)) return null;
  const item = "inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors";
  const cls = (to: string) => cn(item, p === to ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground");
  return (
    <TooltipProvider><nav aria-label="Staff Portal" className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-surface/80 px-3 py-2 backdrop-blur sm:px-6">
      <span className="mr-2 hidden shrink-0 font-display text-sm font-bold text-foreground sm:inline">Staff Portal</span>
      <Link to="/staff-portal" className={cls("/staff-portal")}><Home className="size-4" />Home</Link>
      {isPageAllowed("shop", roles, perms) && (
        <Tooltip><TooltipTrigger asChild>
          <Button asChild variant={p === "/shop" ? "default" : "ghost"} size="icon">
            <Link to="/shop" aria-label="Shop"><ShoppingCart className="size-4" /></Link>
          </Button>
        </TooltipTrigger><TooltipContent>Shop</TooltipContent></Tooltip>
      )}
      {isPageAllowed("install-guides", roles, perms) && (
        <Tooltip><TooltipTrigger asChild>
          <Button asChild variant={p === "/install-guides" ? "default" : "ghost"} size="icon">
            <Link to="/install-guides" aria-label="Install Guides"><Wrench className="size-4" /></Link>
          </Button>
        </TooltipTrigger><TooltipContent>Install Guides</TooltipContent></Tooltip>
      )}
      {canOpenAdminPanel(roles) && (
        <Tooltip><TooltipTrigger asChild>
          <Button asChild variant={p === "/admin" ? "default" : "ghost"} size="icon">
            <Link to="/admin" aria-label={adminPanelLabel(roles)}><LayoutDashboard className="size-4" /></Link>
          </Button>
        </TooltipTrigger><TooltipContent>{adminPanelLabel(roles)}</TooltipContent></Tooltip>
      )}
      {canOpenTvRemoteOverview(roles) && (
        <Tooltip><TooltipTrigger asChild>
          <Button asChild variant={p === "/tv-remote" ? "default" : "ghost"} size="icon">
            <Link to="/tv-remote" aria-label="TV Remote"><Tv className="size-4" /></Link>
          </Button>
        </TooltipTrigger><TooltipContent>TV Remote</TooltipContent></Tooltip>
      )}
      <div className="ml-1 flex shrink-0 items-center gap-1.5 [&_a]:size-9 [&_a]:rounded-lg [&_button]:size-9 [&_button]:rounded-lg">
        <BmInboxBell />
        <MentionsBadge />
        <NotificationBell />
      </div>
      <Link to="/portal/settings" className={cls("/portal/settings")}><Settings className="size-4" />Settings</Link>
      <div className="ml-auto flex min-w-0 shrink-0 items-center gap-2 rounded-2xl border border-white/20 bg-white/10 p-1.5 shadow-lg backdrop-blur [&_span.hidden]:!inline">
        <Clocks />
        <LockNowPill />
        <TwoFactorPill />
        <VpnPill />
      </div>
    </nav></TooltipProvider>
  );
}
