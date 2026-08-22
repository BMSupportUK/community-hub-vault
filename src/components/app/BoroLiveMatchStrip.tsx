import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Radio, CalendarDays, Trophy, ChevronRight, X } from "lucide-react";
import {
  getBoroMatchCentre,
  type MatchCentreDTO,
} from "@/lib/boro-match-centre.functions";
import { useUserTimezone } from "@/hooks/use-user-timezone";
import { TeamKit } from "@/lib/boro-team-kits";
import { Dialog, DialogContent, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { BoroMatchDetailTabs } from "@/components/app/BoroMatchDetailTabs";

function fmtKickoff(iso: string, tz: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: tz,
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString("en-GB");
  }
}

function countdown(toIso: string, now: number) {
  const ms = Date.parse(toIso) - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const ss = s.toString().padStart(2, "0");
  if (d > 0) return `${d}d ${h}h ${m}m ${ss}s`;
  if (h > 0) return `${h}h ${m}m ${ss}s`;
  return `${m}m ${ss}s`;
}

function Side({ name, logo }: { name: string; logo?: string | null }) {
  return (
    <span className="flex items-center gap-1.5 min-w-0">
      {logo ? (
        <img src={logo} alt="" width={20} height={20} className="size-5 object-contain shrink-0" loading="lazy" />
      ) : (
        <TeamKit team={name} size={18} className="shrink-0" />
      )}
      <span className="truncate font-semibold text-white">{name}</span>
    </span>
  );
}

function BigSide({ name, logo }: { name: string; logo?: string | null }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-2 min-w-0">
      {logo ? (
        <img src={logo} alt="" width={48} height={48} className="size-12 object-contain" loading="lazy" />
      ) : (
        <TeamKit team={name} size={44} />
      )}
      <span className="text-center text-sm font-semibold text-white leading-tight">{name}</span>
    </div>
  );
}

export function BoroLiveMatchStrip() {
  const fetchData = useServerFn(getBoroMatchCentre);
  const tz = useUserTimezone();
  const [data, setData] = useState<MatchCentreDTO | null>(null);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const schedule = (ms: number) => {
      timer = window.setTimeout(run, ms);
    };
    const run = async () => {
      try {
        const d = await fetchData();
        if (cancelled) return;
        setData(d);
        setNow(Date.now());
        const live = !!d.liveMatch?.inPlay;
        schedule(live ? 20_000 : 5 * 60_000);
      } catch (e) {
        console.error(e);
        if (!cancelled) schedule(5 * 60_000);
      }
    };
    void run();

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        if (timer) window.clearTimeout(timer);
        void run();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    const tick = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const live = data?.liveMatch ?? null;
  const lr = data?.lastResult ?? null;
  const rawNf = data?.nextFixture ?? null;
  // The weekly rule holds a fixture until Monday, so a played game can still sit
  // in nextFixture. Once it has kicked off and we have its result, show the result.
  const nf =
    rawNf &&
    Date.parse(rawNf.kickoff) < now &&
    lr &&
    (lr.eventId ?? null) === (rawNf.eventId ?? null)
      ? null
      : rawNf;

  const selectedMatch = live ?? nf ?? lr;
  // Never borrow another fixture's ESPN id — that made a new game show the
  // previous match's line-ups, stats and ratings.
  const selectedEventId = selectedMatch?.eventId ?? null;
  const selectedSlug = selectedMatch?.espnSlug ?? null;
  // When the cached ESPN id is missing the pop-up can still resolve the feed
  // from the fixture itself (teams + kick-off), so it no longer sits on
  // "Awaiting kick-off" while ESPN has the game live.
  const selectedFixture = selectedMatch
    ? {
        home: selectedMatch.home,
        away: selectedMatch.away,
        kickoff:
          (selectedMatch as { kickoff?: string; date?: string }).kickoff ??
          (selectedMatch as { date?: string }).date ??
          "",
        competition: selectedMatch.competition ?? null,
      }
    : null;
  const canResolve = !!(selectedFixture?.home && selectedFixture?.away && selectedFixture?.kickoff);
  const openMatchCentre = () => setOpen(true);

  if (!data || (!live && !nf && !lr)) return null;

  return (
    <>
      <div className="group mb-5 w-full overflow-hidden rounded-xl border border-[#E11B22]/45 bg-black/70 backdrop-blur-md shadow-[0_10px_30px_-14px_rgba(225,27,34,0.6)] text-left transition hover:border-[#E11B22]/80">
        <div className="flex items-stretch">
          <div className="flex items-center gap-1.5 px-3 py-2.5 bg-gradient-to-b from-[#E11B22] to-[#8B0F14] text-white shrink-0">
            {live?.inPlay ? (
              <>
                <span className="relative flex size-2.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-white/80" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-white" />
                </span>
                <span className="text-[10px] font-black uppercase tracking-[0.18em]">Live</span>
              </>
            ) : (
              <>
                <Radio className="size-3.5" />
                <span className="text-[10px] font-black uppercase tracking-[0.18em] hidden sm:inline">
                  Match centre
                </span>
              </>
            )}
          </div>

          <div className="flex-1 min-w-0 px-3 py-2 flex items-center gap-3">
            {live ? (
              <div className="flex-1 min-w-0 flex items-center gap-2 sm:gap-3 text-sm">
                <Side name={live.home} logo={live.homeLogo} />
                <span className="font-display text-lg sm:text-xl font-black text-white tabular-nums px-1.5">
                  {live.homeScore}
                  <span className="text-white/50 px-1">-</span>
                  {live.awayScore}
                </span>
                <Side name={live.away} logo={live.awayLogo} />
                <span className="ml-auto shrink-0 rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-bold text-amber-200">
                  {live.inPlay ? live.clock || live.statusDetail : live.statusDetail}
                </span>
              </div>
            ) : nf ? (
              <div className="flex-1 min-w-0 flex items-center gap-2 sm:gap-3 text-sm">
                <CalendarDays className="size-4 text-[#E11B22] shrink-0" />
                <Side name={nf.home} logo={nf.homeLogo} />
                <span className="text-[11px] font-bold uppercase tracking-wider text-white/50 px-1">v</span>
                <Side name={nf.away} logo={nf.awayLogo} />
                <span className="ml-auto shrink-0 flex items-center gap-2">
                  {countdown(nf.kickoff, now) && (
                    <span className="rounded-md bg-[#E11B22]/20 px-2 py-0.5 text-[11px] font-bold text-red-200">
                      in {countdown(nf.kickoff, now)}
                    </span>
                  )}
                  <span className="hidden md:inline text-[11px] text-white/70">
                    {fmtKickoff(nf.kickoff, tz)} · {nf.competition}
                  </span>
                </span>
              </div>
            ) : lr ? (
              <div className="flex-1 min-w-0 flex items-center gap-2 sm:gap-3 text-sm">
                <Trophy className="size-4 text-[#E11B22] shrink-0" />
                <Side name={lr.home} logo={lr.homeLogo} />
                <span className="font-display text-lg font-black text-white tabular-nums px-1.5">
                  {lr.homeScore}
                  <span className="text-white/50 px-1">-</span>
                  {lr.awayScore}
                </span>
                <Side name={lr.away} logo={lr.awayLogo} />
                <span className="ml-auto shrink-0 rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-bold text-white/80">
                  FT
                </span>
              </div>
            ) : null}

            {live && lr && (
              <span className="hidden lg:inline text-[11px] text-white/60 shrink-0 border-l border-white/10 pl-3">
                Last: {lr.home} {lr.homeScore}-{lr.awayScore} {lr.away}
              </span>
            )}

            <button
              type="button"
              onClick={openMatchCentre}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-[#E11B22] px-2.5 py-1.5 text-xs font-bold text-white shadow hover:bg-[#c41820] transition"
            >
              <span className="hidden sm:inline">View match centre</span>
              <span className="sm:hidden">View</span>
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="fixed left-1/2 top-1/2 z-[101] -translate-x-1/2 -translate-y-1/2 max-w-7xl w-[calc(100%-2rem)] max-h-[85vh] overflow-y-auto p-0 border-2 border-[#E11B22]/70 bg-[#0B0E14] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]">
          <DialogTitle className="sr-only">Boro fixture details</DialogTitle>
          <DialogClose
            className="absolute right-2 top-2 z-10 inline-flex items-center justify-center size-8 rounded-full bg-black/70 text-white ring-1 ring-white/25 hover:bg-black/90 transition"
            aria-label="Close match centre"
          >
            <X className="size-4" />
          </DialogClose>
          {(() => {
            const m = live ?? nf ?? lr;
            if (!m) return null;
            const isLive = !!live;
            const isFixture = !live && !!nf;
            return (
              <div className="p-5 pt-8">
                <div className="text-center">
                  <div className="inline-flex items-center gap-1.5 rounded-md bg-[#E11B22] px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-white">
                    {isLive ? <Radio className="size-3.5" /> : isFixture ? <CalendarDays className="size-3.5" /> : <Trophy className="size-3.5" />}
                    {isLive ? "Live now" : isFixture ? "Next fixture" : "Last result"}
                  </div>
                  <div className="mt-1 text-xs text-white/85">{m.competition}</div>
                </div>

                <div className="mt-5 flex items-start gap-3">
                  <BigSide name={m.home} logo={m.homeLogo} />
                  <div className="shrink-0 pt-3 text-center">
                    {isFixture ? (
                      <span className="font-display text-xl font-black text-white/85">v</span>
                    ) : (
                      <span className="font-display text-3xl font-black tabular-nums text-white">
                        {(m as { homeScore: number }).homeScore}
                        <span className="px-1 text-white/70">-</span>
                        {(m as { awayScore: number }).awayScore}
                      </span>
                    )}
                  </div>
                  <BigSide name={m.away} logo={m.awayLogo} />
                </div>

                <div className="mt-5 space-y-1.5 text-center text-sm text-white/80">
                  {isLive && (
                    <div className="font-semibold text-amber-200">
                      {live!.inPlay ? live!.clock || live!.statusDetail : live!.statusDetail}
                    </div>
                  )}
                  {isFixture && (
                    <>
                      <div>{fmtKickoff(nf!.kickoff, tz)}</div>
                      {countdown(nf!.kickoff, now) && (
                        <div className="text-xs text-red-200">Kick-off in {countdown(nf!.kickoff, now)}</div>
                      )}
                      {nf!.venue && <div className="text-xs text-white/85">{nf!.venue}</div>}
                    </>
                  )}
                  {!isLive && !isFixture && (
                    <>
                      <div className="text-xs font-bold uppercase tracking-wider text-white/85">Full time</div>
                      {lr!.venue && <div className="text-xs text-white/85">{lr!.venue}</div>}
                    </>
                  )}
                </div>

                {live && nf && (
                  <div className="mt-5 rounded-lg border border-white/20 bg-white/10 p-3 text-center text-xs text-white/90">
                    Next up: {nf.home} v {nf.away} · {fmtKickoff(nf.kickoff, tz)}
                  </div>
                )}
                <div className="mt-6">
                  <BoroMatchDetailTabs
                    key={`match-detail-live-v3-${selectedEventId ?? selectedFixture?.kickoff ?? "unknown"}`}
                    eventId={selectedEventId}
                    slug={selectedSlug}
                    live={isLive}
                    kickoff={isLive ? live!.kickoff : isFixture ? nf!.kickoff : null}
                    fixture={selectedFixture}
                  />
                </div>

                {live && lr && (
                  <div className="mt-2 rounded-lg border border-white/20 bg-white/10 p-3 text-center text-xs text-white/90">
                    Last: {lr.home} {lr.homeScore}-{lr.awayScore} {lr.away}
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </>
  );
}
