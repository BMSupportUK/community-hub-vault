import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useVisitorVpn } from "@/hooks/use-visitor-vpn";
import { VpnBlockedDialog } from "@/components/VpnBlockedDialog";
import { ShieldAlert, Menu, X } from "lucide-react";
import { useFinishedCompetitions } from "@/hooks/use-finished-competitions";
import { COMPETITIONS } from "@/lib/competitions";
import { isFanZonePath } from "@/lib/fan-zone-nav";


const baseNavItems = [
  { to: "/packages", label: "Packages" },
  { to: "/faq", label: "FAQ" },
  { to: "/about", label: "About" },
  { to: "/fan-zone", label: "Boro Fan Zone Forum" },
  { to: "/contact", label: "Contact us" },
];

const COMPETITION_NAV_LABELS: Record<string, string> = {
  wc2026: "World Cup 2026 Predictions Comp",
  boro2026: "Boro 2026 Predictions",
};

export function LandingHeader() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const isVpn = useVisitorVpn();
  const [vpnDialogOpen, setVpnDialogOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const finished = useFinishedCompetitions();

  const navItems = [
    ...baseNavItems.slice(0, 4),
    ...COMPETITIONS.filter((c) => !finished.includes(c.key)).map((c) => ({
      to: c.to,
      label: COMPETITION_NAV_LABELS[c.key] ?? c.title,
    })),
    { to: "/boro-fantasy", label: "MFC Fantasy Manager" },
    { to: "/competition-winners", label: "Competition Winners" },
    ...baseNavItems.slice(4),
  ];

  return (
    <header className="relative px-4 sm:px-8 py-4 sm:py-5 flex items-center justify-between border-b border-border">
      <Link to="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
        <div className="size-9 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 shadow-[0_0_30px_rgba(220,38,38,0.6)] grid place-items-center font-display font-bold text-[13px] text-white">
          BM
        </div>
        <span className="font-display font-bold text-lg">Support</span>
      </Link>

      {/* Mobile menu toggle */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        className="xl:hidden inline-flex items-center justify-center size-10 rounded-lg border border-border text-foreground hover:bg-muted/50"
      >
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>

      <nav
        className={cn(
          "items-center gap-1",
          "hidden xl:flex",
          open &&
            "flex xl:flex absolute left-0 right-0 top-full z-50 flex-col items-stretch gap-1 border-b border-border bg-background p-4 shadow-lg xl:static xl:flex-row xl:items-center xl:gap-1 xl:border-0 xl:bg-transparent xl:p-0 xl:shadow-none",
        )}
      >
        {navItems.map((item) => {
          const isActive = path === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className={cn(
                "text-sm px-4 py-2 rounded-lg transition-all",
                isActive
                  ? "font-medium text-foreground bg-primary/10 border border-primary/30 shadow-[0_0_12px_rgba(220,38,38,0.15)]"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              {item.label}
            </Link>
          );
        })}
        <Link
          to="/login"
          onClick={() => setOpen(false)}
          className={cn(
            "text-sm px-4 py-2 rounded-lg transition-all",
            path === "/login"
              ? "font-medium text-foreground bg-primary/10 border border-primary/30 shadow-[0_0_12px_rgba(220,38,38,0.15)]"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          )}
        >
          Sign in
        </Link>
        {isVpn ? (
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setVpnDialogOpen(true);
            }}
            aria-disabled="true"
            className="text-sm font-medium px-4 py-2 rounded-lg bg-red-600/50 text-white cursor-not-allowed inline-flex items-center justify-center gap-2 md:ml-1"
          >
            <ShieldAlert className="size-4" /> Join BM Support
          </button>
        ) : (
          <Link
            to="/signup"
            onClick={() => setOpen(false)}
            className="text-sm font-medium px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 shadow-[0_0_24px_rgba(220,38,38,0.55)] transition-all text-center md:ml-1"
          >
            Join BM Support
          </Link>
        )}
      </nav>

      <VpnBlockedDialog open={vpnDialogOpen} onOpenChange={setVpnDialogOpen} />
    </header>
  );
}
