import { Link, useLocation } from "@tanstack/react-router";
import { Home, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { isStaffPortalUser } from "@/lib/portal-home";
import { BmInboxBell } from "@/components/app/BmInboxBell";
import { MentionsBadge } from "@/components/app/MentionsBadge";
import { NotificationBell } from "@/components/app/NotificationBell";
import { Clocks } from "@/components/app/Clocks";
import { LockNowPill } from "@/components/app/ScreenLockProvider";
import { TwoFactorPill, VpnPill } from "@/components/app/TwoFactorBanner";

/** Pages that sit inside the Staff Portal tab bar (ticket threads keep their own bounded layout). */
export function isStaffPortalPath(path: string) {
  return ["/staff-portal", "/tickets", "/shifts", "/shift-history", "/staff-pin", "/tv-remote", "/staff"].includes(path.replace(/\/$/, "") || "/");
}

/** Staff Portal tab bar: tickets, shifts and other staff tools in one place. */
export function StaffPortalTabs() {
  const { roles } = useAuth();
  const p = useLocation().pathname.replace(/\/$/, "");
  if (!isStaffPortalUser(roles)) return null;
  const item = "inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors";
  const cls = (to: string) => cn(item, p === to ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground");
  return (
    <nav aria-label="Staff Portal" className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-surface/80 px-3 py-2 backdrop-blur sm:px-6">
      <span className="mr-2 hidden shrink-0 font-display text-sm font-bold text-foreground sm:inline">Staff Portal</span>
      <Link to="/staff-portal" className={cls("/staff-portal")}><Home className="size-4" />Home</Link>
      <div className="ml-1 flex shrink-0 items-center gap-1.5 [&_a]:size-9 [&_a]:rounded-lg [&_button]:size-9 [&_button]:rounded-lg">
        <BmInboxBell />
        <MentionsBadge />
        <NotificationBell />
      </div>
      <Link to="/portal/settings" className={cls("/portal/settings")}><Settings className="size-4" />Settings</Link>
    </nav>
  );
}
