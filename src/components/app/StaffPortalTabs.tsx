import { Link, useLocation } from "@tanstack/react-router";
import { Home, Ticket, CalendarClock, History, KeyRound, Briefcase, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { adminPanelLabel, canOpenAdminPanel } from "@/lib/admin-panel-access";
import { isStaffPortalUser } from "@/lib/portal-home";

/** Pages that sit inside the Staff Portal tab bar (ticket threads keep their own bounded layout). */
export function isStaffPortalPath(path: string) {
  return ["/staff-portal", "/tickets", "/shifts", "/shift-history", "/staff-pin", "/staff"].includes(path.replace(/\/$/, "") || "/");
}

/** Staff Portal tab bar: tickets, shifts and other staff tools in one place. */
export function StaffPortalTabs() {
  const { roles } = useAuth();
  const p = useLocation().pathname.replace(/\/$/, "");
  if (!isStaffPortalUser(roles)) return null;
  const isMod = roles.includes("moderator") && !roles.some((r) => r === "admin" || r === "management" || r === "staff");
  const item = "inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors";
  const cls = (to: string) => cn(item, p === to ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground");
  return (
    <nav aria-label="Staff Portal" className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-surface/80 px-3 py-2 backdrop-blur sm:px-6">
      <span className="mr-2 hidden shrink-0 font-display text-sm font-bold text-foreground sm:inline">Staff Portal</span>
      <Link to="/staff-portal" className={cls("/staff-portal")}><Home className="size-4" />Home</Link>
      {!isMod && <Link to="/tickets" className={cls("/tickets")}><Ticket className="size-4" />Tickets</Link>}
      <Link to="/shifts" className={cls("/shifts")}><CalendarClock className="size-4" />Shifts</Link>
      <Link to="/shift-history" className={cls("/shift-history")}><History className="size-4" />Shift history</Link>
      <Link to="/staff-pin" className={cls("/staff-pin")}><KeyRound className="size-4" />Staff PIN</Link>
      <Link to="/staff" className={cls("/staff")}><Briefcase className="size-4" />Staff directory</Link>
      {canOpenAdminPanel(roles) && <Link to="/admin" className={cls("/admin")}><LayoutDashboard className="size-4" />{adminPanelLabel(roles)}</Link>}
    </nav>
  );
}
