import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Headphones, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import welcomeHero from "@/assets/welcome-hero.jpg";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) throw redirect({ to: "/home" });
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
    supabase
      .from("hero_boxes")
      .select("id, position, icon_url, title, description")
      .order("position")
      .then(({ data }) => setBoxes((data ?? []) as HeroBox[]));
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-8 py-5 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2">
          <div className="size-9 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 shadow-[0_0_30px_rgba(220,38,38,0.6)] grid place-items-center font-display font-bold text-[13px] text-white">BM</div>
          <span className="font-display font-bold text-lg">Support</span>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground px-3 py-2">Sign in</Link>
          <Link to="/signup" className="text-sm font-medium px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-500 shadow-[0_0_24px_rgba(220,38,38,0.55)] transition-all">Request access</Link>
        </div>
      </header>

      <main className="flex-1 px-6 py-10 md:py-16">
        <section
          className="relative max-w-7xl mx-auto rounded-3xl overflow-hidden border border-red-900/60 p-8 md:p-14"
          style={{
            background:
              "radial-gradient(1200px 600px at 10% 10%, rgba(248,113,113,0.25), transparent 60%), radial-gradient(900px 500px at 90% 90%, rgba(127,29,29,0.6), transparent 60%), linear-gradient(135deg, #7f1d1d 0%, #991b1b 50%, #450a0a 100%)",
            boxShadow:
              "0 0 80px rgba(220,38,38,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
        >
          <div className="grid md:grid-cols-2 gap-10 items-center">
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

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link to="/signup" className="px-6 py-3 rounded-lg bg-white text-red-700 font-semibold hover:bg-red-50 shadow-[0_0_30px_rgba(255,255,255,0.35)] transition-all">
                  Request access
                </Link>
                <Link to="/login" className="px-6 py-3 rounded-lg bg-red-950/60 border border-red-400/40 text-white font-medium hover:bg-red-900/60 backdrop-blur-sm">
                  I have an account
                </Link>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-4 bg-gradient-to-tr from-red-500/40 via-transparent to-blue-500/30 blur-2xl rounded-3xl" aria-hidden />
              <div className="relative rounded-3xl overflow-hidden border border-white/15 shadow-[0_20px_80px_rgba(0,0,0,0.5)]">
                <img
                  src={welcomeHero}
                  alt="BM Support hero"
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-br from-red-950/70 via-red-900/40 to-black/70" aria-hidden />
                <div className="relative flex flex-col gap-4 p-5">
                {boxes.map((b) => (
                  <div
                    key={b.id}
                    className="group flex items-start gap-4 p-5 rounded-2xl border border-white/15 bg-gradient-to-br from-white/10 via-white/5 to-transparent backdrop-blur-md shadow-[0_8px_40px_rgba(0,0,0,0.35)] hover:border-red-300/40 hover:shadow-[0_8px_50px_rgba(248,113,113,0.35)] transition-all"
                  >
                    <div className="shrink-0 size-14 rounded-xl bg-black/40 border border-white/10 grid place-items-center overflow-hidden ring-1 ring-red-500/20 group-hover:ring-red-300/50 transition">
                      {b.icon_url ? (
                        <img src={b.icon_url} alt="" className="size-full object-contain p-2" />
                      ) : (
                        <Sparkles className="size-6 text-red-200" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-display font-bold text-white text-lg leading-tight">{b.title}</div>
                      <p className="text-sm text-red-50/85 mt-1 leading-snug">{b.description}</p>
                    </div>
                  </div>
                ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
