import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Gavel, Clock, ArrowRight, ShieldBan, MailQuestion, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FanZoneAppealPanel } from "@/components/app/FanZoneAppealPanel";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
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

  const [appealOpen, setAppealOpen] = useState(false);
  const [hasAppeal, setHasAppeal] = useState(false);

  const { user } = useAuth();
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("fan_zone_appeals")
        .select("id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      if (!cancelled) setHasAppeal(!!data);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

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

  const countdown = permanent ? (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-[#E11B22]/40 bg-black/30 px-4 py-6 text-center">
      <ShieldBan className="size-6 text-[#E11B22]" />
      <span className="font-display text-lg font-black uppercase tracking-wide text-white">
        Permanent ban
      </span>
    </div>
  ) : expired ? (
    <div className="space-y-3 rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-4 py-4 text-center">
      <p className="text-sm font-semibold text-white">Your ban has been served — welcome back.</p>
      <Button asChild className="bg-[#E11B22] text-white hover:bg-[#c5161c]">
        <Link to={returnTo}>
          Return to the Fan Zone
          <ArrowRight className="ml-1.5 size-4" />
        </Link>
      </Button>
    </div>
  ) : (
    <div className="rounded-xl border border-white/15 bg-black/30 px-3 py-3 sm:px-4 sm:py-4">
      <div className="mb-2 flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-white/55 sm:mb-3">
        <Clock className="size-3.5" />
        Ban ends in
      </div>
      <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
        {cells.map((c) => (
          <div
            key={c.label}
            className="rounded-lg border border-[#E11B22]/40 bg-[#E11B22]/10 px-1 py-2 text-center sm:px-2"
          >
            <div className="font-display text-xl font-black leading-none text-white tabular-nums sm:text-2xl lg:text-3xl">
              {String(c.value).padStart(2, "0")}
            </div>
            <div className="mt-1 text-[9px] uppercase tracking-widest text-white/55 sm:text-[10px]">{c.label}</div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="boro-theme relative mx-auto w-full max-w-5xl px-4 py-8 sm:py-12">
      <div className="mb-4 flex justify-end">
        <Button
          onClick={() => setAppealOpen(true)}
          className="bg-[#E11B22] text-white shadow-lg hover:bg-[#c5161c]"
        >
          {hasAppeal ? (
            <>
              <MessageSquare className="mr-1.5 size-4" />
              View Appeal Chat Box
            </>
          ) : (
            <>
              <MailQuestion className="mr-1.5 size-4" />
              Appeal this ban
            </>
          )}
        </Button>
      </div>


      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
        <aside className="order-first rounded-2xl border border-[#E11B22]/40 bg-[#0B1A2B]/80 p-3 shadow-[0_18px_60px_-16px_rgba(0,0,0,0.85)] backdrop-blur sm:p-4 lg:sticky lg:top-6 lg:order-none lg:col-start-2 lg:row-start-1">
          {countdown}
          <Button
            variant="outline"
            className="mt-3 w-full border-white/25 bg-white/5 text-white hover:bg-white/10"
            onClick={() => setAppealOpen(true)}
          >
            {hasAppeal ? (
              <>
                <MessageSquare className="mr-1.5 size-4" />
                View Appeal Chat Box
              </>
            ) : (
              <>
                <MailQuestion className="mr-1.5 size-4" />
                Appeal this ban
              </>
            )}
          </Button>
        </aside>

        <div className="order-last overflow-hidden rounded-2xl border border-[#E11B22]/50 bg-[#0B1A2B]/80 shadow-[0_18px_60px_-16px_rgba(0,0,0,0.85)] backdrop-blur lg:order-none lg:col-start-1 lg:row-start-1">
          <img
            src={bannedArt}
            alt="A Boro fan standing in a courtroom dock while a judge passes sentence"
            width={1024}
            height={1024}
            loading="lazy"
            className="h-40 w-full object-cover object-top sm:h-56 lg:h-72"
          />

          <div className="space-y-4 p-4 sm:p-6">
            <div className="rounded-xl border border-[#E11B22]/55 bg-[#E11B22]/15 px-4 py-4 text-center">
              <div className="mb-1 flex items-center justify-center gap-2 text-white">
                <Gavel className="size-5" />
                <h1 className="font-display text-xl font-black tracking-tight sm:text-2xl lg:text-3xl">
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
          </div>
        </div>
      </div>

      <Dialog open={appealOpen} onOpenChange={setAppealOpen}>
        <DialogContent className="boro-theme max-w-lg border-[#E11B22]/40 bg-[#0B1A2B] text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              {hasAppeal ? (
                <MessageSquare className="size-4 text-[#E11B22]" />
              ) : (
                <MailQuestion className="size-4 text-[#E11B22]" />
              )}
              {hasAppeal ? "Appeal chat box" : "Appeal this ban"}
            </DialogTitle>
            <DialogDescription className="text-white/60">
              {hasAppeal
                ? "Read the moderator's replies and send follow-up messages."
                : "Tell a moderator what happened. You'll get an email when they reply."}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[65vh] overflow-y-auto pr-1">
            <FanZoneAppealPanel onAppealKnown={setHasAppeal} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
