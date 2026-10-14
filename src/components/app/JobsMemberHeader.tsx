import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { LayoutDashboard, Menu, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { adminPanelLabel, canOpenAdminPanel, canOpenFanZoneAdminPanel } from "@/lib/admin-panel-access";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { IconRail } from "./IconRail";
import { BmInboxBell } from "./BmInboxBell";
import { MentionsBadge } from "./MentionsBadge";
import { NotificationBell } from "./NotificationBell";
import { Clocks } from "./Clocks";
import { LockNowPill } from "./ScreenLockProvider";
import { TwoFactorPill, VpnPill } from "./TwoFactorBanner";

export function JobsMemberHeader() {
  const { roles } = useAuth();
  const [navOpen, setNavOpen] = useState(false);
  return <header aria-label="BM Support member header" className="flex h-14 shrink-0 items-center justify-between gap-1.5 overflow-hidden border-b border-border bg-rail/40 px-2 backdrop-blur lg:gap-3 lg:px-4">
    <div className="flex min-w-0 flex-1 items-center gap-1.5 lg:gap-2">
      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetTrigger asChild><Button size="icon" variant="ghost" className="md:hidden" aria-label="Open navigation"><Menu className="size-5" /></Button></SheetTrigger>
        <SheetContent side="left" className="w-auto border-r border-border bg-rail p-0">{navOpen && <IconRail inSheet />}</SheetContent>
      </Sheet>
      {canOpenAdminPanel(roles) && <Button asChild size="icon" variant="ghost" title={adminPanelLabel(roles)}><Link to="/admin" aria-label={adminPanelLabel(roles)}><LayoutDashboard className="size-4" /></Link></Button>}
      {canOpenFanZoneAdminPanel(roles) && <Button asChild size="icon" variant="ghost" title="Fan Zone | Admin Panel"><Link to="/fan-zone-admin" aria-label="Fan Zone | Admin Panel"><ShieldCheck className="size-4" /></Link></Button>}
      <BmInboxBell />
      <MentionsBadge />
      <NotificationBell />
    </div>
    <div className="hidden lg:contents"><Clocks /></div>
    <LockNowPill />
    <TwoFactorPill />
    <VpnPill />
  </header>;
}