import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { LandingHeader } from "@/components/LandingHeader";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import boroHero from "@/assets/boro-hero.jpg";
import boroBadge from "@/assets/boro-fan-zone-badge.png";
import boroBg from "@/assets/boro-bg.jpg";

export const Route = createFileRoute("/fan-zone")({
  component: () => <Outlet />,
});

export function FanZoneShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    const html = document.documentElement;
    html.style.setProperty("--boro-bg-image", `url(${boroBg})`);
    html.classList.add("boro-bg-active");
    return () => {
      html.classList.remove("boro-bg-active");
      html.style.removeProperty("--boro-bg-image");
    };
  }, []);
  return (
    <div className="boro-theme min-h-screen bg-background">
      <LandingHeader />
      <div className="relative w-full px-4 sm:px-6 lg:px-10 py-6 max-w-7xl mx-auto">
        <header className="relative mb-6 overflow-hidden rounded-2xl border border-[#E11B22]/40 shadow-[0_10px_40px_-10px_rgba(225,27,34,0.55)]">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${boroHero})` }}
            aria-hidden
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(115deg, rgba(225,27,34,0.92) 0%, rgba(139,15,20,0.85) 45%, rgba(11,26,43,0.85) 100%)",
            }}
            aria-hidden
          />
          <div
            className="absolute inset-0 opacity-[0.08] mix-blend-overlay"
            style={{
              backgroundImage:
                "repeating-linear-gradient(135deg, #fff 0 2px, transparent 2px 14px)",
            }}
            aria-hidden
          />
          <div className="relative px-4 py-5 sm:px-8 sm:py-9 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5">
            <div className="hidden sm:flex size-20 rounded-full bg-white items-center justify-center shadow-lg ring-2 ring-white/50 shrink-0">
              <img
                src={boroBadge}
                alt="Boro Fan Zone badge"
                width={1024}
                height={1024}
                className="size-[72px] object-contain"
                loading="lazy"
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] tracking-[0.3em] font-bold text-white/80 uppercase mb-1">
                Guest view · Est. terrace
              </div>
              <h1 className="font-display text-3xl sm:text-4xl font-black leading-none text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)]">
                BORO FAN ZONE
              </h1>
              <p className="mt-2 text-sm text-white/85 italic">
                Up the Boro — boards, banter & match-day debate.
              </p>
            </div>
          </div>
        </header>
        {!user && (
          <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
            <p className="text-sm text-amber-100/90">
              You're viewing the Boro Fan Zone as a guest. Sign in or request access to post, react and join polls.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => navigate({ to: "/login" })}>
                <LogIn className="size-4 mr-1.5" /> Sign in
              </Button>
              <Button
                size="sm"
                className="bg-red-600 text-white hover:bg-red-500"
                onClick={() => navigate({ to: "/signup" })}
              >
                Join BM Support
              </Button>
            </div>
          </div>
        )}
        <div className="rounded-2xl border border-border bg-surface-1/85 backdrop-blur-sm p-5 sm:p-7 shadow-soft">
          {children}
        </div>
      </div>
    </div>
  );
}