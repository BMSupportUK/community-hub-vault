import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Headphones } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LandingHeader } from "@/components/LandingHeader";
import welcomeHero from "@/assets/welcome-hero.jpg";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    // On the native Android (Capacitor) app, skip the marketing landing page
    // entirely and send users straight to the login screen.
    if (typeof window !== "undefined" && (window as any).Capacitor?.isNativePlatform?.()) {
      throw redirect({ to: "/login" });
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    throw redirect({ to: "/home" });
  },
  component: Landing,
});

interface HeroBox {
  id: string;
  position: number;
  icon_url: string | null;
  title: string;
  description: string;
}

function Landing() {
  const [boxes, setBoxes] = useState<HeroBox[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("hero_boxes")
        .select("id, position, icon_url, title, description")
        .order("position");
      setBoxes((data ?? []) as HeroBox[]);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <LandingHeader />

      <main className="flex-1 px-6 py-10 md:py-16">
        <section
          className="relative max-w-7xl mx-auto rounded-3xl border border-red-900/60 p-6 md:p-10 lg:p-12 pb-24 md:pb-32"
          style={{
            background:
              "radial-gradient(1200px 600px at 10% 10%, rgba(248,113,113,0.25), transparent 60%), radial-gradient(900px 500px at 90% 90%, rgba(127,29,29,0.6), transparent 60%), linear-gradient(135deg, #7f1d1d 0%, #991b1b 50%, #450a0a 100%)",
            boxShadow:
              "0 0 80px rgba(220,38,38,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
        >
          <div className="grid md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-5 md:gap-3 lg:gap-4 items-center">
            <div className="space-y-6 text-white">
              <h1 className="font-display text-4xl md:text-6xl font-bold tracking-tight leading-[1.05] drop-shadow-[0_2px_20px_rgba(0,0,0,0.5)]">
                Welcome to <span className="bg-gradient-to-r from-red-200 via-white to-red-300 bg-clip-text text-transparent">BM Support</span>
              </h1>
              <p className="text-lg md:text-xl text-red-50/95 max-w-xl">
                Your all-in-one server for BM Support — stay connected, all in one place.
              </p>
              <p className="text-red-100/80 max-w-xl">
                Access community channels, manage your time, view schedules, get support, and explore our services. Everything you need is just one click away.
              </p>

              <div className="inline-flex items-center gap-3 px-4 py-3 rounded-xl bg-black/40 backdrop-blur-sm border border-red-500/30 shadow-[0_0_30px_rgba(220,38,38,0.25)]">
                <Headphones className="size-4 text-red-300" />
                <span className="text-sm text-red-50">
                  <span className="font-semibold">Expert Support</span> — We're always here to help.
                </span>
                <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)] animate-pulse" />
              </div>
            </div>

            <div className="relative w-full md:-ml-2 lg:-ml-4">
              <div className="absolute -inset-4 bg-gradient-to-tr from-red-500/40 via-transparent to-blue-500/30 blur-2xl rounded-3xl" aria-hidden />
              <div className="relative rounded-3xl overflow-hidden border border-white/20 shadow-[0_20px_80px_rgba(0,0,0,0.6)] max-w-[620px] ml-auto">
                <img
                  src={welcomeHero}
                  alt="BM Support hero"
                  className="block w-full h-auto object-contain"
                />
              </div>
            </div>
          </div>
        </section>

        <div className="relative max-w-7xl mx-auto -mt-12 md:-mt-16 px-6 grid grid-cols-1 sm:grid-cols-3 gap-4 z-10">
          {boxes.map((b) => (
            <div
              key={b.id}
              className="group relative flex items-start gap-4 p-5 rounded-2xl border border-red-400/30 backdrop-blur-md shadow-[0_12px_50px_rgba(127,29,29,0.5)] hover:border-red-300/60 transition-all"
              style={{
                background:
                  "linear-gradient(135deg, rgba(127,29,29,0.9) 0%, rgba(69,10,10,0.9) 100%)",
              }}
            >
              <div className="shrink-0 size-12 rounded-xl bg-black/40 border border-white/10 grid place-items-center overflow-hidden ring-1 ring-red-500/30 group-hover:ring-red-300/60 transition">
                {b.icon_url ? (
                  <img src={b.icon_url} alt="" className="size-full object-contain p-2" />
                ) : (
                  <span className="text-red-200 text-xs">?</span>
                )}
              </div>
              <div className="min-w-0">
                <div className="font-display font-bold text-white text-base leading-tight">{b.title}</div>
                <p className="text-sm text-red-50/85 mt-1 leading-snug">{b.description}</p>
              </div>
            </div>
          ))}
        </div>
      </main>

      <footer className="mt-20 border-t border-red-500/20 bg-black/60 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <p className="text-sm text-red-50/70 order-2 md:order-1">
            © BM Support 2026. All rights reserved.
          </p>
          <div className="flex flex-col items-center gap-2 order-1 md:order-2">
            <span className="text-[11px] uppercase tracking-wider text-red-100/60">Accepted payment methods</span>
            <div className="flex items-stretch gap-4">
              {/* Square group */}
              <div className="flex flex-col items-center gap-2">
                <div className="px-3 py-1.5 rounded-md bg-white shadow-sm flex items-center justify-center h-7">
                  <svg viewBox="0 0 24 24" className="h-4 w-auto" aria-label="Square">
                    <path fill="#000" d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm3 5v8h8V8H8zm2 2h4v4h-4v-4z"/>
                  </svg>
                </div>
                <div className="flex items-center gap-2">
                  <div className="px-2 py-1 rounded bg-white text-[#1a1f71] text-[10px] font-extrabold italic tracking-tight shadow-sm">VISA</div>
                  <div className="px-2 py-1 rounded bg-white text-[10px] font-bold shadow-sm">
                    <span className="text-[#eb001b]">●</span><span className="text-[#f79e1b] -ml-1.5">●</span>
                    <span className="ml-1 text-black">MC</span>
                  </div>
                  <div className="px-2 py-1 rounded bg-white text-[#006fcf] text-[10px] font-extrabold shadow-sm">AMEX</div>
                  <div className="px-2 py-1 rounded bg-white text-[#0079be] text-[10px] font-bold shadow-sm">Maestro</div>
                </div>
              </div>

              {/* Divider */}
              <div className="w-px bg-red-500/30 self-stretch" aria-hidden />

              {/* PayPal group */}
              <div className="flex flex-col items-center gap-2">
                <div className="px-3 py-1.5 rounded-md bg-white shadow-sm flex items-center justify-center h-7">
                  <svg viewBox="0 0 100 26" className="h-4 w-auto" aria-label="PayPal">
                    <text x="0" y="20" fontFamily="Arial, Helvetica, sans-serif" fontWeight="900" fontStyle="italic" fontSize="22">
                      <tspan fill="#003087">Pay</tspan><tspan fill="#009cde">Pal</tspan>
                    </text>
                  </svg>
                </div>
                <div className="flex items-center gap-2">
                  <div className="px-2 py-1 rounded bg-white text-[#1a1f71] text-[10px] font-extrabold italic tracking-tight shadow-sm">VISA</div>
                  <div className="px-2 py-1 rounded bg-white text-[10px] font-bold shadow-sm">
                    <span className="text-[#eb001b]">●</span><span className="text-[#f79e1b] -ml-1.5">●</span>
                    <span className="ml-1 text-black">MC</span>
                  </div>
                  <div className="px-2 py-1 rounded bg-white text-[#006fcf] text-[10px] font-extrabold shadow-sm">AMEX</div>
                </div>
              </div>

              {/* Divider */}
              <div className="w-px bg-red-500/30 self-stretch" aria-hidden />

              {/* Crypto group */}
              <div className="flex flex-col items-center gap-2">
                <div className="px-3 py-1.5 rounded-md bg-white shadow-sm flex items-center justify-center h-7">
                  <svg viewBox="0 0 24 24" className="h-4 w-auto" aria-label="USDT">
                    <circle cx="12" cy="12" r="12" fill="#26A17B"/>
                    <path d="M12.75 13.2v3.15h-1.5v-3.15c-2.25-.12-4.2-.9-5.4-2.1l1.2-1.2c1.05 1.05 2.7 1.65 4.65 1.77V6h1.5v5.82c1.95-.12 3.6-.72 4.65-1.77l1.2 1.2c-1.2 1.2-3.15 1.98-5.4 2.1v2.85z" fill="#fff"/>
                  </svg>
                </div>
                <div className="px-2 py-1 rounded bg-white text-[#26A17B] text-[10px] font-extrabold tracking-tight shadow-sm">USDT</div>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
