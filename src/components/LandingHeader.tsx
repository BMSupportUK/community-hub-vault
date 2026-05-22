import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { checkVisitorVpn } from "@/lib/vpn-public-check.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ShieldAlert } from "lucide-react";

const navItems = [
  { to: "/packages", label: "Packages" },
  { to: "/faq", label: "FAQ" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact us" },
];

export function LandingHeader() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const [isVpn, setIsVpn] = useState(false);
  const [vpnDialogOpen, setVpnDialogOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await checkVisitorVpn();
        if (res?.is_vpn || res?.is_proxy) setIsVpn(true);
      } catch {
        // fail open
      }
    })();
  }, []);

  return (
    <header className="px-8 py-5 flex items-center justify-between border-b border-border">
      <Link to="/" className="flex items-center gap-2">
        <div className="size-9 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 shadow-[0_0_30px_rgba(220,38,38,0.6)] grid place-items-center font-display font-bold text-[13px] text-white">
          BM
        </div>
        <span className="font-display font-bold text-lg">Support</span>
      </Link>
      <nav className="flex items-center gap-1">
        {navItems.map((item) => {
          const isActive = path === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
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
            onClick={() => setVpnDialogOpen(true)}
            aria-disabled="true"
            className="text-sm font-medium px-4 py-2 rounded-lg bg-red-600/50 text-white cursor-not-allowed inline-flex items-center gap-2 ml-1"
          >
            <ShieldAlert className="size-4" /> Request access
          </button>
        ) : (
          <Link
            to="/signup"
            className="text-sm font-medium px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 shadow-[0_0_24px_rgba(220,38,38,0.55)] transition-all ml-1"
          >
            Request access
          </Link>
        )}
      </nav>

      <Dialog open={vpnDialogOpen} onOpenChange={setVpnDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="size-5 text-red-500" /> Please disable your VPN
            </DialogTitle>
            <DialogDescription>
              We've detected that you're connected through a VPN or proxy. To request access, please disable your VPN and reload this page so we can verify your connection.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setVpnDialogOpen(false)}
              className="px-4 py-2 rounded-md border border-border hover:bg-muted font-medium"
            >
              Got it
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
