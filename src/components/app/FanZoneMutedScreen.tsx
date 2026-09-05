import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { VolumeX, Clock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import mutedArt from "@/assets/fan-zone-muted.jpg";

type Props = {
  /** ISO timestamp when the mute expires. */
  expiresAt: string;
  reason: string;
  mutedBy?: string | null;
  /** Where the "return to the forum" button sends the user. */
  returnTo?: string;
};

function parts(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    d: Math.floor(total / 86400),
    h: Math.floor((total % 86400) / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60,
  };
}

export function FanZoneMutedScreen({ expiresAt, reason, mutedBy, returnTo = "/forum" }: Props) {
  const target = useMemo(() => Date.parse(expiresAt), [expiresAt]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const remaining = target - now;
  const expired = remaining <= 0;
  const { d, h, m, s } = parts(remaining);

  const cells = [
    ...(d > 0 ? [{ label: d === 1 ? "day" : "days", value: d }] : []),
    { label: "hrs", value: h },
    { label: "min", value: m },
    { label: "sec", value: s },
  ];

  return (
    <div className="boro-theme mx-auto w-full max-w-xl px-4 py-8 sm:py-12">
      <div className="overflow-hidden rounded-2xl border border-[#E11B22]/50 bg-[#0B1A2B]/80 shadow-[0_18px_60px_-16px_rgba(0,0,0,0.85)] backdrop-blur">
        <img
          src={mutedArt}
          alt="A Boro fan sitting on the naughty step"
          width={1024}
          height={1024}
          loading="lazy"
          className="h-56 w-full object-cover object-top sm:h-72"
        />

        <div className="space-y-4 p-5 sm:p-6">
          <div className="rounded-xl border border-[#E11B22]/55 bg-[#E11B22]/15 px-4 py-4 text-center">
            <div className="mb-1 flex items-center justify-center gap-2 text-white">
              <VolumeX className="size-5" />
              <h1 className="font-display text-2xl font-black tracking-tight sm:text-3xl">
                You have been muted
              </h1>
            </div>
            <p className="text-sm text-white/75">
              You can still read the Boro Fan Zone, but you can&apos;t post or reply for now.
            </p>
          </div>

          <div className="rounded-xl border border-white/15 bg-black/30 px-4 py-3">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/55">
              Reason
            </div>
            <p className="text-sm text-white">{reason || "No reason given."}</p>
            {mutedBy && (
              <p className="mt-2 text-xs text-white/55">Muted by {mutedBy}</p>
            )}
          </div>

          {expired ? (
            <div className="space-y-3 rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-4 py-4 text-center">
              <p className="text-sm font-semibold text-white">
                Your mute has expired — you&apos;re free to post again.
              </p>
              <Button asChild className="bg-[#E11B22] text-white hover:bg-[#c5161c]">
                <Link to={returnTo}>
                  Return to the forum
                  <ArrowRight className="ml-1.5 size-4" />
                </Link>
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border border-white/15 bg-black/30 px-4 py-4">
              <div className="mb-2 flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-white/55">
                <Clock className="size-3.5" />
                Mute ends in
              </div>
              <div className="flex items-end justify-center gap-2 sm:gap-3">
                {cells.map((c) => (
                  <div
                    key={c.label}
                    className="min-w-[62px] rounded-lg border border-[#E11B22]/40 bg-[#E11B22]/10 px-2 py-2 text-center"
                  >
                    <div className="font-display text-2xl font-black leading-none text-white tabular-nums sm:text-3xl">
                      {String(c.value).padStart(2, "0")}
                    </div>
                    <div className="mt-1 text-[10px] uppercase tracking-widest text-white/55">
                      {c.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
