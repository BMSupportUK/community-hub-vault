import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { IconRail } from "@/components/app/IconRail";
import { FanZonePublicHeader } from "@/components/app/FanZonePublicHeader";
import { Info } from "lucide-react";
import boroHero from "@/assets/boro-hero.jpg";
import boroBadge from "@/assets/boro-fan-zone-badge.png";
import boroBg from "@/assets/boro-bg.jpg";
import { BoroLiveMatchStrip } from "@/components/app/BoroLiveMatchStrip";
import { OnlineNowBox } from "@/components/app/OnlineNowBox";

export const Route = createFileRoute("/fan-zone")({
  component: () => <Outlet />,
});

export function FanZoneShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
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
    <div className="boro-theme flex min-h-screen bg-background">
      {!user && <IconRail />}
      <div className="min-w-0 flex-1">
      {!user && <FanZonePublicHeader />}
      <div className="relative w-full px-4 py-6 sm:px-6 lg:px-10">
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
                "linear-gradient(115deg, rgba(150,16,22,0.82) 0%, rgba(105,12,18,0.74) 48%, rgba(9,23,42,0.78) 100%)",
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
          <div className="relative px-4 py-5 sm:px-8 sm:py-9 flex flex-col xl:flex-row xl:items-center gap-4 sm:gap-5">
            <div className="hidden xl:flex size-20 rounded-full bg-white items-center justify-center shadow-lg ring-2 ring-white/50 shrink-0">
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
            <div className="xl:self-center flex flex-col items-start gap-3 min-w-0 xl:items-end xl:max-w-[540px]">
              {!user && (
                <div className="rounded-lg border border-amber-400/60 bg-amber-500/25 backdrop-blur-sm px-3.5 py-2.5 shadow-[0_0_20px_rgba(251,191,36,0.35)]">
                  <span className="inline-flex items-start gap-2 text-xs sm:text-sm font-semibold text-amber-50 leading-snug">
                    <Info className="size-4 text-amber-300 shrink-0 mt-0.5" />
                    You're viewing the Boro Fan Zone as a guest. Sign in or request access to post, react and join polls.
                  </span>
                </div>
              )}
              <OnlineNowBox variant="hero" />
            </div>
          </div>
        </header>
        <BoroLiveMatchStrip />
        <div className="rounded-2xl border border-white/15 bg-black/62 backdrop-blur-md p-5 sm:p-7 shadow-2xl">
          {children}
        </div>
      </div>
      </div>
    </div>
  );
}