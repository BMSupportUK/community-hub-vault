import { Link } from "@tanstack/react-router";
import { LogIn, Lock, Menu, Shield, UserPlus } from "lucide-react";
import { useState } from "react";
import { IconRail } from "@/components/app/IconRail";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { lockScreenNow } from "@/components/app/ScreenLockProvider";
import boroBadge from "@/assets/boro-fan-zone-badge.png";

export function FanZonePublicHeader() {
  const [navOpen, setNavOpen] = useState(false);
  const { user } = useAuth();

  return (
    <header className="relative z-30 flex min-h-16 items-center justify-between gap-3 border-b border-white/15 bg-black/55 px-3 py-2 backdrop-blur-md sm:px-6">
      <div className="flex min-w-0 items-center gap-2.5">
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="md:hidden border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              aria-label="Open Fan Zone navigation"
            >
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-auto border-r border-border bg-rail p-0">
            {navOpen ? <IconRail inSheet /> : null}
          </SheetContent>
        </Sheet>

        <Link to="/forum" className="flex min-w-0 items-center gap-2.5" aria-label="Boro Fan Zone home">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white shadow-md ring-2 ring-white/30">
            <img src={boroBadge} alt="" className="size-10 object-contain" />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-display text-base font-black text-white sm:text-lg">BORO FAN ZONE</span>
            <span className="hidden text-[11px] font-semibold text-white/65 sm:block">Boards, banter &amp; match-day debate</span>
          </span>
        </Link>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button
          asChild
          size="icon"
          variant="outline"
          className="border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white"
          title={user ? "Two-factor authentication" : "Sign in to manage two-factor authentication"}
        >
          <Link to={user ? "/account-security" : "/login"} aria-label="Two-factor authentication">
            <Shield className="size-4" />
          </Link>
        </Button>
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white"
          title={user ? "Lock screen now" : "Sign in to use lock screen"}
          onClick={() => (user ? lockScreenNow() : undefined)}
          disabled={!user}
          aria-label="Lock screen"
        >
          <Lock className="size-4" />
        </Button>
        <span className="hidden sm:inline h-5 w-px bg-white/25" />
        <Button asChild size="sm" variant="outline" className="border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white">
          <Link to="/login">
            <LogIn className="size-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Sign in</span>
          </Link>
        </Button>
        <Button asChild size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Link to="/signup" search={{ intent: "fan-zone" } as never}>
            <UserPlus className="size-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Join Fan Zone</span>
          </Link>
        </Button>
      </div>
    </header>
  );
}