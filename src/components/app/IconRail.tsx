import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Ticket, ShoppingBag, BookOpen, FileText, Clock, Calendar, Shield, LogOut, MessageSquare, ShieldCheck, KeySquare, LayoutDashboard, UserCircle2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/app/NotificationBell";

interface RailItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  show: boolean;
}

export function IconRail() {
  const { isStaff, isMod, isPending, signOut, hasAny } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const path = useRouterState({ select: (r) => r.location.pathname });

  if (isPending) {
    return (
      <aside className="bg-rail w-[72px] shrink-0 flex flex-col items-center py-4 gap-2 border-r border-border">
        <RailIcon to="/gate" label="Gate" Icon={MessageSquare} active={path.startsWith("/gate")} accent />
        <div className="mt-auto" />
        <button onClick={signOut} className="text-muted-foreground hover:text-destructive p-3" title="Sign out">
          <LogOut className="size-5" />
        </button>
      </aside>
    );
  }

  const items: RailItem[] = [
    { to: "/home", label: "Home", icon: Home, show: true },
    { to: "/profile", label: "My profile", icon: UserCircle2, show: true },
    { to: "/tickets", label: "Tickets", icon: Ticket, show: true },
    { to: "/shop", label: "Shop", icon: ShoppingBag, show: true },
    { to: "/install-guides", label: "Install guides", icon: BookOpen, show: true },
    { to: "/sports-guides", label: "Sports guides", icon: FileText, show: true },
    { to: "/clock", label: "Clock", icon: Clock, show: isStaff },
    { to: "/shifts", label: "Shifts", icon: Calendar, show: isStaff },
    { to: "/moderation", label: "Moderation", icon: Shield, show: isMod },
    { to: "/admin", label: "Admin dashboard", icon: LayoutDashboard, show: isAdmin },
    { to: "/admin-credentials", label: "User credentials admin", icon: KeySquare, show: isAdmin },
    { to: "/admin-roles", label: "User roles", icon: ShieldCheck, show: isAdmin },
  ];

  return (
    <aside className="bg-rail w-[72px] shrink-0 flex flex-col items-center py-4 gap-1 border-r border-border">
      <Link to="/home" className="size-12 rounded-2xl bg-gradient-primary flex items-center justify-center font-display font-bold text-primary-foreground shadow-glow mb-2">
        H
      </Link>
      <div className="h-px w-8 bg-border my-1" />
      {items.filter((i) => i.show).map((i) => (
        <RailIcon key={i.to} to={i.to} label={i.label} Icon={i.icon} active={path.startsWith(i.to)} />
      ))}
      <div className="mt-auto" />
      <NotificationBell />
      <button onClick={signOut} className="text-muted-foreground hover:text-destructive p-3 rounded-xl hover:bg-surface-2 transition-colors" title="Sign out">
        <LogOut className="size-5" />
      </button>
    </aside>
  );
}

function RailIcon({
  to,
  label,
  Icon,
  active,
  accent,
}: {
  to: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
  accent?: boolean;
}) {
  return (
    <Link
      to={to}
      title={label}
      className={cn(
        "group relative size-12 rounded-2xl flex items-center justify-center transition-all",
        active
          ? "bg-primary text-primary-foreground rounded-xl shadow-glow"
          : "bg-surface-2 text-muted-foreground hover:bg-primary hover:text-primary-foreground hover:rounded-xl",
        accent && !active && "ring-1 ring-primary/40",
      )}
    >
      <Icon className="size-5" />
      <span className="absolute left-full ml-3 px-2 py-1 rounded bg-popover text-popover-foreground text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-soft">
        {label}
      </span>
      {active && <span className="absolute -left-1 top-1/2 -translate-y-1/2 h-8 w-1 bg-primary-glow rounded-r" />}
    </Link>
  );
}
