import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Gavel, Clock, ArrowRight, ShieldBan } from "lucide-react";
import { Button } from "@/components/ui/button";
import bannedArt from "@/assets/fan-zone-banned.jpg";

type Props = {
  /** ISO timestamp when the ban lifts, or null for a permanent ban. */
  expiresAt: string | null;
  reason: string;
  bannedBy?: string | null;
  /** Where the "return to the Fan Zone" button sends the user. */
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

export function FanZoneBannedScreen({ expiresAt, reason, bannedBy, returnTo = "/fan-zone" }: Props) {
  const target = useMemo(() => (expiresAt ? Date.parse(expiresAt) : null), [expiresAt]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const permanent = target === null;
  const remaining = target === null ? 0 : target - now;
  const expired = !permanent && remaining <= 0;
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
          src={bannedArt}
          alt="A Boro fan standing in a courtroom dock while a judge passes sentence"
          width={1024}
          height={1024}
          loading="lazy"
          className="h-56 w-full object-cover object-top sm:h-72"
        />

        <div className="space-y-4 p-5 sm:p-6">
          <div className="rounded-xl border border-[#E11B22]/55 bg-[#E11B22]/15 px-4 py-4 text-center">
            <div className="mb-1 flex items-center justify-center gap-2 text-white">
              <Gavel className="size-5" />
              <h1 className="font-display text-2xl font-black tracking-tight sm:text-3xl">
                You have been banned
              </h1>
            </div>
            <p className="text-sm text-white/75">
              {permanent
                ? "Your access to the Boro Fan Zone has been removed permanently."
                : "You can't sign in to the Boro Fan Zone until your ban is served."}
            </p>
            <p className="mt-2 text-xs text-white/50">
              This only affects the Boro Fan Zone — your BM Support account is unchanged.
            </p>
          </div>

          <div className="rounded-xl border border-white/15 bg-black/30 px-4 py-3">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/55">
              Reason
            </div>
            <p className="text-sm text-white">{reason || "No reason given."}</p>
            {bannedBy && <p className="mt-2 text-xs text-white/55">Banned by {bannedBy}</p>}
          </div>

          {permanent ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-[#E11B22]/40 bg-black/30 px-4 py-5 text-center">
              <ShieldBan className="size-5 text-[#E11B22]" />
              <span className="font-display text-lg font-black uppercase tracking-wide text-white">
                Permanent ban
              </span>
            </div>
          ) : expired ? (
            <div className="space-y-3 rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-4 py-4 text-center">
              <p className="text-sm font-semibold text-white">
                Your ban has been served — welcome back.
              </p>
              <Button asChild className="bg-[#E11B22] text-white hover:bg-[#c5161c]">
                <Link to={returnTo}>
                  Return to the Fan Zone
                  <ArrowRight className="ml-1.5 size-4" />
                </Link>
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border border-white/15 bg-black/30 px-4 py-4">
              <div className="mb-2 flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-white/55">
                <Clock className="size-3.5" />
                Ban ends in
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

          <p className="text-center text-xs text-white/45">
            Think this is a mistake? Reply to the ban notice email and a moderator will take another
            look.
          </p>
        </div>
      </div>
    </div>
  );
}
