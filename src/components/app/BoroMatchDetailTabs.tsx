import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Goal, Square, RefreshCw, ShieldAlert, Target, ChevronDown } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getBoroMatchDetail,
  type MatchDetailDTO,
  type MatchEventItem,
  type PlayerLine,
} from "@/lib/boro-match-detail.functions";
import { PLAYER_STAT_COLUMNS, describeEspnEvent } from "@/lib/boro-espn-events";

const STAT_COLUMNS = PLAYER_STAT_COLUMNS;

type ActionGroup = {
  value: string;
  label: string;
  emptyLabel: string;
  kinds?: MatchEventItem["kind"][];
};

const ACTION_GROUPS: ActionGroup[] = [
  { value: "all", label: "All", emptyLabel: "Match action" },
  { value: "goals", label: "Goals", emptyLabel: "Goals", kinds: ["goal", "own-goal", "penalty"] },
  { value: "cards", label: "Cards", emptyLabel: "Cards", kinds: ["yellow", "red"] },
  { value: "pens", label: "Pens", emptyLabel: "Penalties", kinds: ["penalty", "penalty-missed"] },
  { value: "subs", label: "Subs", emptyLabel: "Substitutions", kinds: ["sub"] },
];

function EventIcon({ kind }: { kind: MatchEventItem["kind"] }) {
  if (kind === "yellow") return <Square className="size-3.5 fill-amber-400 text-amber-400" />;
  if (kind === "red") return <Square className="size-3.5 fill-red-500 text-red-500" />;
  if (kind === "sub") return <RefreshCw className="size-3.5 text-emerald-300" />;
  if (kind === "var") return <ShieldAlert className="size-3.5 text-sky-300" />;
  if (kind === "penalty-missed" || kind === "shootout-missed")
    return <Target className="size-3.5 text-white/50" />;
  return <Goal className="size-3.5 text-white" />;
}

function EventRow({ ev, home, away }: { ev: MatchEventItem; home: string | null; away: string | null }) {
  const isGoal = ev.kind === "goal" || ev.kind === "penalty" || ev.kind === "own-goal";
  return (
    <li
      className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-sm ${
        isGoal ? "border-[#E11B22]/45 bg-[#E11B22]/10" : "border-white/10 bg-white/5"
      }`}
    >
      <span className="w-12 shrink-0 pt-0.5 tabular-nums text-xs font-bold text-amber-200">{ev.clock ?? "-"}</span>
      <span className="pt-0.5">
        <EventIcon kind={ev.kind} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-white">{describeEspnEvent(ev)}</span>
        {ev.text && ev.text !== ev.shortText && (
          <span className="mt-0.5 block text-[12px] leading-snug text-white/60">{ev.text}</span>
        )}
        {isGoal && ev.homeScore != null && ev.awayScore != null && (
          <span className="mt-1 inline-block rounded bg-white/10 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white/80">
            {home ?? "Home"} {ev.homeScore} - {ev.awayScore} {away ?? "Away"}
          </span>
        )}
      </span>
      <span className="shrink-0 pt-0.5 text-[11px] text-white/50">{ev.teamName ?? ""}</span>
    </li>
  );
}

function StatHead() {
  return (
    <thead className="text-[10px] uppercase text-white/40">
      <tr>
        <th className="px-3 py-1.5 text-left">Player</th>
        {STAT_COLUMNS.map((c) => (
          <th key={c.key} title={c.title} className="px-1.5 py-1.5 text-center">
            {c.label}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function PlaceholderRows({ rows }: { rows: number }) {
  return (
    <tbody>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-t border-white/5">
          <td className="py-1.5 pr-2">
            <span className="inline-flex items-center gap-2">
              <span className="w-6 text-right text-[11px] tabular-nums text-white/25">{i + 1}</span>
              <span className="h-3 w-24 rounded bg-white/10" />
            </span>
          </td>
          {STAT_COLUMNS.map((c) => (
            <td key={c.key} className="px-1.5 py-1.5 text-center text-white/20">
              –
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

function PlayerRow({ p }: { p: PlayerLine }) {
  return (
    <tr className="border-t border-white/5">
      <td className="py-1.5 pr-2 whitespace-nowrap">
        <span className="inline-flex items-center gap-2">
          <span className="w-6 text-right text-white/40 tabular-nums text-[11px]">{p.jersey ?? "-"}</span>
          <span className="font-medium text-white">{p.name}</span>
          {p.position && (
            <span className="rounded bg-white/10 px-1 text-[10px] font-bold uppercase text-white/60">
              {p.position}
            </span>
          )}
          {p.subbedIn && <span className="text-[10px] font-bold text-emerald-300">IN</span>}
          {p.subbedOut && <span className="text-[10px] font-bold text-red-300">OUT</span>}
        </span>
      </td>
      {STAT_COLUMNS.map((c) => (
        <td key={c.key} className="px-1.5 py-1.5 text-center tabular-nums text-white/70">
          {p.stats[c.key] ?? "0"}
        </td>
      ))}
    </tr>
  );
}

export function BoroMatchDetailTabs({
  eventId,
  slug,
  live,
  kickoff,
}: {
  eventId: string | null;
  slug?: string | null;
  live: boolean;
  kickoff?: string | null;
}) {
  const fetchDetail = useServerFn(getBoroMatchDetail);
  const [detail, setDetail] = useState<MatchDetailDTO | null>(null);
  const [loading, setLoading] = useState(!!eventId);
  const [showMoreStats, setShowMoreStats] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const koMs = kickoff ? Date.parse(kickoff) : NaN;
  const minsToKo = Number.isFinite(koMs) ? Math.round((koMs - now) / 60000) : null;
  const preMatch = !live && minsToKo !== null && minsToKo > -5;
  // Within 3 hours of kick-off we poll hard so line-ups/stats land the moment ESPN publishes them.
  const armed = live || (preMatch && minsToKo! <= 180);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    if (!eventId) {
      setLoading(false);
      setDetail(null);
      return;
    }
    const run = async () => {
      try {
        const d = await fetchDetail({ data: { eventId, slug: slug ?? undefined } });
        if (cancelled) return;
        setDetail(d);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
        if (!cancelled) timer = window.setTimeout(run, live ? 20_000 : armed ? 60_000 : 5 * 60_000);
      }
    };
    void run();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [eventId, slug, live, armed]);

  const teams = useMemo(() => {
    const home = detail?.lineups.find((l) => l.teamId === detail?.homeTeamId) ?? detail?.lineups[0] ?? null;
    const away = detail?.lineups.find((l) => l.teamId === detail?.awayTeamId) ?? detail?.lineups[1] ?? null;
    return { home, away };
  }, [detail]);

  const primaryStats = detail?.teamStats.filter((s) => s.primary) ?? [];
  const extraStats = detail?.teamStats.filter((s) => !s.primary) ?? [];

  if (loading && !detail) {
    return <div className="py-8 text-center text-sm text-white/50">Loading match data…</div>;
  }

  const koLabel =
    minsToKo === null
      ? null
      : minsToKo > 90
        ? `Kick-off in ${Math.floor(minsToKo / 60)}h ${minsToKo % 60}m`
        : minsToKo > 0
          ? `Kick-off in ${minsToKo}m`
          : "Kick-off imminent";

  return (
    <Tabs defaultValue={live ? "action" : preMatch ? "lineups" : "action"} className="w-full">
      {!live && preMatch && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-[#E11B22]/40 bg-[#E11B22]/10 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-red-200">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-300/80" />
            <span className="relative inline-flex size-2 rounded-full bg-red-300" />
          </span>
          Armed and ready — stats start recording at kick-off
          {koLabel && <span className="ml-auto normal-case tracking-normal text-white/70">{koLabel}</span>}
        </div>
      )}
      <TabsList className="grid w-full grid-cols-3 bg-white/5">
        <TabsTrigger value="action">Match action</TabsTrigger>
        <TabsTrigger value="stats">Game stats</TabsTrigger>
        <TabsTrigger value="lineups">Line-ups</TabsTrigger>
      </TabsList>

      <TabsContent value="action" className="mt-4">
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="grid w-full grid-cols-5 bg-white/5">
            {ACTION_GROUPS.map((g) => {
              const count =
                g.value === "pens"
                  ? (detail?.events.filter((e) => g.kinds!.includes(e.kind)).length ?? 0) +
                    (detail?.shootout.length ?? 0)
                  : g.kinds
                    ? (detail?.events.filter((e) => g.kinds!.includes(e.kind)).length ?? 0)
                    : (detail?.events.length ?? 0);
              return (
                <TabsTrigger key={g.value} value={g.value} className="text-[11px] sm:text-xs">
                  {g.label}
                  {count > 0 && (
                    <span className="ml-1 rounded bg-white/15 px-1 text-[10px] font-bold tabular-nums">{count}</span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {ACTION_GROUPS.map((g) => {
            const rows = g.kinds
              ? (detail?.events.filter((e) => g.kinds!.includes(e.kind)) ?? [])
              : (detail?.events ?? []);
            const shootout = g.value === "all" || g.value === "pens" ? (detail?.shootout ?? []) : [];
            const empty = rows.length === 0 && shootout.length === 0;
            return (
              <TabsContent key={g.value} value={g.value} className="mt-3">
                {empty ? (
                  <div className="flex items-center gap-3 rounded-lg border border-dashed border-white/10 bg-white/[0.03] px-3 py-3 text-sm">
                    <span className="w-12 shrink-0 tabular-nums text-xs font-bold text-white/25">--&apos;</span>
                    <span className="flex-1 text-white/45">{g.emptyLabel} — awaiting first entry</span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {rows.length > 0 && (
                      <ul className="space-y-1.5">
                        {rows.map((ev, i) => (
                          <EventRow key={`${ev.key}-${i}`} ev={ev} home={detail?.home ?? null} away={detail?.away ?? null} />
                        ))}
                      </ul>
                    )}
                    {shootout.length > 0 && (
                      <div className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-3">
                        <div className="mb-2 text-[11px] font-black uppercase tracking-wider text-amber-200">
                          Penalty shootout
                        </div>
                        <ul className="space-y-1">
                          {shootout.map((ev, i) => (
                            <li key={`${ev.key}-${i}`} className="flex items-center gap-2 text-sm text-white">
                              <span className={ev.kind === "shootout-scored" ? "text-emerald-300" : "text-red-300"}>
                                {ev.kind === "shootout-scored" ? "\u2714" : "\u2716"}
                              </span>
                              <span className="min-w-0 flex-1 truncate">{ev.players[0] ?? ev.shortText}</span>
                              <span className="shrink-0 text-[11px] text-white/60">{ev.teamName ?? ""}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </TabsContent>

      <TabsContent value="stats" className="mt-4">
        {primaryStats.length || extraStats.length ? (
          <div className="space-y-2">
            <div className="overflow-hidden rounded-lg border border-white/10">
              <table className="w-full text-sm">
                <thead className="bg-white/5 text-[11px] uppercase tracking-wider text-white/50">
                  <tr>
                    <th className="px-3 py-2 text-left">{detail?.home}</th>
                    <th className="px-3 py-2 text-center">Stat</th>
                    <th className="px-3 py-2 text-right">{detail?.away}</th>
                  </tr>
                </thead>
                <tbody>
                  {(showMoreStats ? [...primaryStats, ...extraStats] : primaryStats).map((s) => (
                    <tr key={s.name} className="border-t border-white/5">
                      <td className="px-3 py-1.5 text-left font-bold tabular-nums text-white">{s.home}</td>
                      <td className="px-3 py-1.5 text-center text-white/60">{s.label}</td>
                      <td className="px-3 py-1.5 text-right font-bold tabular-nums text-white">{s.away}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {extraStats.length > 0 && (
              <button
                type="button"
                onClick={() => setShowMoreStats((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-white/80 hover:bg-white/10 transition"
              >
                {showMoreStats ? "Fewer stats" : `More stats (${extraStats.length})`}
                <ChevronDown className={`size-3.5 transition ${showMoreStats ? "rotate-180" : ""}`} />
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-dashed border-white/10">
            <div className="border-b border-white/10 bg-white/5 px-3 py-2 text-[12px] text-white/60">
              Awaiting stats — recording starts at kick-off.
            </div>
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-[11px] uppercase tracking-wider text-white/50">
                <tr>
                  <th className="px-3 py-2 text-left">Home</th>
                  <th className="px-3 py-2 text-center">Stat</th>
                  <th className="px-3 py-2 text-right">Away</th>
                </tr>
              </thead>
              <tbody>
                {[
                  "Possession %",
                  "Shots",
                  "Shots on target",
                  "Corners",
                  "Offsides",
                  "Fouls",
                  "Yellow cards",
                  "Red cards",
                  "Saves",
                ].map((label) => (
                  <tr key={label} className="border-t border-white/5">
                    <td className="px-3 py-1.5 text-left font-bold tabular-nums text-white/30">–</td>
                    <td className="px-3 py-1.5 text-center text-white/45">{label}</td>
                    <td className="px-3 py-1.5 text-right font-bold tabular-nums text-white/30">–</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TabsContent>

      <TabsContent value="lineups" className="mt-4">
        <Tabs defaultValue="home-xi" className="w-full">
          <TabsList className="grid w-full grid-cols-2 gap-1 bg-white/5 sm:grid-cols-4">
            <TabsTrigger value="home-xi" className="text-[11px] sm:text-xs">
              Home XI
            </TabsTrigger>
            <TabsTrigger value="away-xi" className="text-[11px] sm:text-xs">
              Away XI
            </TabsTrigger>
            <TabsTrigger value="home-subs" className="text-[11px] sm:text-xs">
              Home subs
            </TabsTrigger>
            <TabsTrigger value="away-subs" className="text-[11px] sm:text-xs">
              Away subs
            </TabsTrigger>
          </TabsList>
          {(
            [
              { value: "home-xi", side: "Home", starters: true, team: teams.home },
              { value: "away-xi", side: "Away", starters: true, team: teams.away },
              { value: "home-subs", side: "Home", starters: false, team: teams.home },
              { value: "away-subs", side: "Away", starters: false, team: teams.away },
            ] as const
          ).map((cfg) => (
            <TabsContent key={cfg.value} value={cfg.value} className="mt-4">
              <LineupPanel side={cfg.side} starters={cfg.starters} team={cfg.team} />
            </TabsContent>
          ))}
        </Tabs>
      </TabsContent>
    </Tabs>
  );
}

function LineupPanel({
  side,
  starters,
  team,
}: {
  side: "Home" | "Away";
  starters: boolean;
  team: MatchDetailDTO["lineups"][number] | null;
}) {
  const label = starters ? `${side} XI` : `${side} substitutes`;
  const players = (team?.players ?? [])
    .filter((p) => (starters ? p.starter : !p.starter))
    .slice()
    .sort((a, b) => (a.jersey ?? 99) - (b.jersey ?? 99));

  return (
    <div className="space-y-3">
      {players.length === 0 && (
        <p className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/60">
          {starters
            ? "Awaiting line-ups — published about an hour before kick-off. Player stat columns below are ready and fill in live."
            : "Awaiting bench — substitutes appear with the line-ups. Stat columns below fill in live once they come on."}
        </p>
      )}
      <div
        className={`overflow-hidden rounded-lg border ${
          players.length ? "border-white/10" : "border-dashed border-white/10"
        }`}
      >
        <div className="flex items-center gap-2 bg-white/5 px-3 py-2">
          {team?.logo && (
            <img src={team.logo} alt="" width={18} height={18} className="size-[18px]" loading="lazy" />
          )}
          <span className={`text-sm font-bold ${players.length ? "text-white" : "text-white/50"}`}>
            {team?.team ? `${team.team} — ${starters ? "starting XI" : "substitutes"}` : label}
          </span>
          {starters && team?.formation && (
            <span className="ml-auto rounded bg-[#E11B22]/20 px-1.5 py-0.5 text-[10px] font-bold text-red-200">
              {team.formation}
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <StatHead />
            {players.length ? (
              <tbody>
                {players.map((p) => (
                  <PlayerRow key={p.id} p={p} />
                ))}
              </tbody>
            ) : (
              <PlaceholderRows rows={starters ? 11 : 7} />
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
