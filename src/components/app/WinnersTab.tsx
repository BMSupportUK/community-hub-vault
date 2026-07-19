import { useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import { Trophy, Medal, Award } from "lucide-react";

type Props = {
  title: string;
  subtitle?: string;
  /** Optional winners — leave empty until announced. */
  winners?: { place: 1 | 2 | 3; name?: string; note?: string }[];
};

export function WinnersTab({ title, subtitle, winners = [] }: Props) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;

    const duration = 4000;
    const end = Date.now() + duration;
    const colors = ["#fbbf24", "#f59e0b", "#ef4444", "#22c55e", "#3b82f6", "#a855f7"];

    // Initial burst
    confetti({
      particleCount: 120,
      spread: 90,
      startVelocity: 55,
      origin: { y: 0.6 },
      colors,
    });

    // Side cannons for a few seconds
    const timer = window.setInterval(() => {
      if (Date.now() > end) {
        window.clearInterval(timer);
        return;
      }
      confetti({
        particleCount: 40,
        angle: 60,
        spread: 70,
        origin: { x: 0, y: 0.7 },
        colors,
      });
      confetti({
        particleCount: 40,
        angle: 120,
        spread: 70,
        origin: { x: 1, y: 0.7 },
        colors,
      });
    }, 350);

    return () => window.clearInterval(timer);
  }, []);

  const podium: { place: 1 | 2 | 3; label: string; Icon: typeof Trophy; ring: string; bg: string; text: string }[] = [
    { place: 1, label: "1st place", Icon: Trophy, ring: "ring-amber-400/60", bg: "from-amber-500/20 via-amber-500/5 to-transparent", text: "text-amber-300" },
    { place: 2, label: "2nd place", Icon: Medal, ring: "ring-zinc-300/50", bg: "from-zinc-300/15 via-zinc-300/5 to-transparent", text: "text-zinc-200" },
    { place: 3, label: "3rd place", Icon: Award, ring: "ring-orange-400/60", bg: "from-orange-400/20 via-orange-400/5 to-transparent", text: "text-orange-300" },
  ];

  return (
    <div className="rounded-2xl border-2 border-amber-400/60 bg-gradient-to-br from-amber-500/10 via-surface-1 to-surface-1 shadow-md shadow-amber-500/10 p-5 sm:p-8 space-y-6">
      <div className="text-center space-y-2">
        <div className="mx-auto size-16 rounded-2xl bg-amber-500/20 grid place-items-center ring-1 ring-amber-400/40">
          <Trophy className="size-8 text-amber-300" />
        </div>
        <h2 className="font-display text-2xl sm:text-3xl font-bold">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {podium.map(({ place, label, Icon, ring, bg, text }) => {
          const w = winners.find((x) => x.place === place);
          return (
            <div
              key={place}
              className={`relative rounded-2xl border border-border bg-gradient-to-b ${bg} ring-1 ${ring} p-5 flex flex-col items-center text-center gap-2`}
            >
              <Icon className={`size-8 ${text}`} />
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
              <div className="font-display text-lg font-bold min-h-7">
                {w?.name ?? "To be announced"}
              </div>
              {w?.note && <div className="text-xs text-muted-foreground">{w.note}</div>}
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Winners will be revealed here once all matches are complete. Good luck! 🍀
      </p>
    </div>
  );
}
