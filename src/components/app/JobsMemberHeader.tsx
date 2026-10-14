import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Menu, Receipt, Shield, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { adminPanelLabel, canOpenAdminPanel, canOpenFanZoneAdminPanel } from "@/lib/admin-panel-access";
import { isPageAllowed, usePagePermissions } from "@/lib/page-access";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { IconRail } from "./IconRail";
import { BmInboxBell } from "./BmInboxBell";
import { MentionsBadge } from "./MentionsBadge";
import { NotificationBell } from "./NotificationBell";
import { ModerationPendingBadge } from "./ModerationPendingBadge";
import { PendingOrdersBadge } from "./PendingOrdersBadge";
import { Clocks } from "./Clocks";
import { LockNowPill } from "./ScreenLockProvider";
import { TwoFactorPill, VpnPill } from "./TwoFactorBanner";

const pill = "hidden md:flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 bg-surface-2 hover:bg-primary hover:text-primary-foreground text-xs font-medium transition-colors";

/** The same BM Support site header signed-in members see on every member page. */
export function JobsMemberHeader() {
  const { roles, hasAny } = useAuth();
  const perms = usePagePermissions();
  const navigate = useNavigate();
  const [navOpen, setNavOpen] = useState(false);
  const isAdmin = hasAny(["admin", "management"]);
  const canOpenPanel = canOpenAdminPanel(roles) && isPageAllowed("admin", roles, perms);
  const panelLabel = adminPanelLabel(roles);
  const canOpenFanZonePanel = !canOpenPanel && canOpenFanZoneAdminPanel(roles);
  return (
    <header aria-label="BM Support header" className="h-14 shrink-0 border-b border-border bg-rail/40 backdrop-blur flex items-center justify-between px-2 lg:px-4 gap-1.5 lg:gap-3 overflow-hidden">
      <div className="flex items-center gap-1.5 lg:gap-2 min-w-0 flex-1">
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetTrigger className="md:hidden inline-flex items-center justify-center size-9 rounded-md hover:bg-surface-2 text-muted-foreground" aria-label="Open navigation">
            <Menu className="size-5" />
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-auto bg-rail border-r border-border">{navOpen ? <IconRail inSheet /> : null}</SheetContent>
        </Sheet>
        {canOpenPanel && <Link to="/admin" title={panelLabel} className={pill}><LayoutDashboard className="size-4" /><span className="hidden min-[1700px]:inline">{panelLabel}</span></Link>}
        {canOpenFanZonePanel && <Link to="/fan-zone-admin" title="Fan Zone | Admin Panel" className={pill}><ShieldCheck className="size-4" /><span className="hidden min-[1700px]:inline">Fan Zone | Admin Panel</span></Link>}
        {isAdmin && <Link to="/moderation" title="Admin | Access Requests" className={pill}><Shield className="size-4" /><span className="hidden min-[1700px]:inline">Admin | Access Requests</span><ModerationPendingBadge /></Link>}
        {isAdmin && <button type="button" title="Admin | Shop Orders" className={pill} onClick={() => navigate({ to: "/admin", search: { tab: "order-status" } as never })}><Receipt className="size-4" /><span className="hidden min-[1700px]:inline">Admin | Shop Orders</span><PendingOrdersBadge /></button>}
        {isAdmin && <Link to="/admin-roles" title="Members & Role Management" className={pill}><ShieldCheck className="size-4" /><span className="hidden min-[1700px]:inline">Members &amp; Role Management</span></Link>}
        <BmInboxBell />
        <MentionsBadge />
        <NotificationBell />
      </div>
      <div className="hidden xl:flex flex-1 min-w-0 px-3" />
      <div className="hidden lg:contents"><Clocks /></div>
      <LockNowPill />
      <TwoFactorPill />
      <VpnPill />
    </header>
  );
}
