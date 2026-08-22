import { useEffect, useState } from "react";
import { Goal, Square, RefreshCw, ShieldAlert, Target, ChevronDown } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MatchDetailDTO, MatchEventItem, PlayerLine } from "@/lib/boro-match-detail.types";
import { PLAYER_STAT_COLUMNS, describeEspnEvent } from "@/lib/boro-espn-events";

type StatColumn = { key: string; label: string; title: string };

// FotMob and ESPN record different player stats (FotMob adds a rating and
// minutes played but has no shots-faced/goals-conceded splits), so the table
// columns follow whatever the active feed actually reports.
const STAT_CATALOGUE: StatColumn[] = [
  { key: "rating", label: "RTG", title: "Match rating" },
  { key: "minutesPlayed", label: "MIN", title: "Minutes played" },
  ...PLAYER_STAT_COLUMNS,
];

const FALLBACK_COLUMNS: StatColumn[] = STAT_CATALOGUE.filter((c) =>
  ["totalGoals", "goalAssists", "totalShots", "shotsOnTarget", "foulsCommitted", "yellowCards", "redCards"].includes(c.key),
);

function resolveStatColumns(detail: MatchDetailDTO | null): StatColumn[] {
  const seen = new Set<string>();
  for (const lineup of detail?.lineups ?? []) {
    for (const player of lineup.players) {
      for (const [key, value] of Object.entries(player.stats ?? {})) {
        if (value != null && String(value).trim() !== "") seen.add(key);
      }
    }
  }
  const columns = STAT_CATALOGUE.filter((c) => seen.has(c.key));
  return columns.length ? columns : FALLBACK_COLUMNS;
}


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

function mergeMatchDetail(
  current: MatchDetailDTO | null,
  incoming: MatchDetailDTO,
): MatchDetailDTO {
  if (!current) return incoming;
  return {
    ...current,
    ...incoming,
    available: current.available || incoming.available,
    events: incoming.events.length >= current.events.length ? incoming.events : current.events,
    shootout: incoming.shootout.length >= current.shootout.length ? incoming.shootout : current.shootout,
    teamStats: incoming.teamStats.length >= current.teamStats.length ? incoming.teamStats : current.teamStats,
    lineups: incoming.lineups.reduce<MatchDetailDTO["lineups"]>((best, lineup) => {
      const existing = current.lineups.find(
        (item) =>
          (lineup.teamId && item.teamId === lineup.teamId) ||
          item.team.toLowerCase() === lineup.team.toLowerCase(),
      );
      const selected = existing && existing.players.length > lineup.players.length ? existing : lineup;
      return [...best, selected];
    }, incoming.lineups.length ? [] : current.lineups),
  };
}

function EventIcon({ kind }: { kind: MatchEventItem["kind"] }) {
  if (kind === "yellow") return <Square className="size-3.5 fill-amber-400 text-amber-400" />;
  if (kind === "red") return <Square className="size-3.5 fill-red-500 text-red-500" />;
  if (kind === "sub") return <RefreshCw className="size-3.5 text-emerald-300" />;
  if (kind === "var") return <ShieldAlert className="size-3.5 text-sky-300" />;
  if (kind === "penalty-missed" || kind === "shootout-missed")
    return <Target className="size-3.5 text-white/75" />;
  return <Goal className="size-3.5 text-white" />;
}

function EventRow({ ev, home, away }: { ev: MatchEventItem; home: string | null; away: string | null }) {
  const isGoal = ev.kind === "goal" || ev.kind === "penalty" || ev.kind === "own-goal";
  return (
    <li
      className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-sm ${
        isGoal ? "border-[#E11B22]/45 bg-[#E11B22]/10" : "border-white/20 bg-white/10"
      }`}
    >
      <span className="w-12 shrink-0 pt-0.5 tabular-nums text-xs font-bold text-amber-200">{ev.clock ?? "-"}</span>
      <span className="pt-0.5">
        <EventIcon kind={ev.kind} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-white">{describeEspnEvent(ev)}</span>
        {ev.text && ev.text !== ev.shortText && (
          <span className="mt-0.5 block text-[12px] leading-snug text-white/85">{ev.text}</span>
        )}
        {isGoal && ev.homeScore != null && ev.awayScore != null && (
          <span className="mt-1 inline-block rounded bg-white/[0.16] px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white/95">
            {home ?? "Home"} {ev.homeScore} - {ev.awayScore} {away ?? "Away"}
          </span>
        )}
      </span>
      <span className="shrink-0 pt-0.5 text-[11px] text-white/75">{ev.teamName ?? ""}</span>
    </li>
  );
}

function StatHead({ columns }: { columns: StatColumn[] }) {
  return (
    <thead className="text-[10px] uppercase text-white/70">
      <tr>
        <th className="px-3 py-1.5 text-left">Player</th>
        {columns.map((c) => (
          <th key={c.key} title={c.title} className="px-1.5 py-1.5 text-center">
            {c.label}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function PlaceholderRows({ rows, columns }: { rows: number; columns: StatColumn[] }) {
  return (
    <tbody>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-t border-white/15">
          <td className="py-1.5 pr-2">
            <span className="inline-flex items-center gap-2">
              <span className="w-6 text-right text-[11px] tabular-nums text-white/55">{i + 1}</span>
              <span className="h-3 w-24 rounded bg-white/[0.16]" />
            </span>
          </td>
          {columns.map((c) => (
            <td key={c.key} className="px-1.5 py-1.5 text-center text-white/50">
              –
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

function PlayerRow({ p, columns }: { p: PlayerLine; columns: StatColumn[] }) {
  return (
    <tr className="border-t border-white/15">
      <td className="py-1.5 pr-2 whitespace-nowrap">
        <span className="inline-flex items-center gap-2">
          <span className="w-6 text-right text-white/70 tabular-nums text-[11px]">{p.jersey ?? "-"}</span>
          <span className="font-medium text-white">{p.name}</span>
          {p.position && (
            <span className="rounded bg-white/[0.16] px-1 text-[10px] font-bold uppercase text-white/85">
              {p.position}
            </span>
          )}
          {p.subbedIn && <span className="text-[10px] font-bold text-emerald-300">IN</span>}
          {p.subbedOut && <span className="text-[10px] font-bold text-red-300">OUT</span>}
        </span>
      </td>
      {columns.map((c) => (
        <td key={c.key} className="px-1.5 py-1.5 text-center tabular-nums text-white/90">
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
  initialDetail,
  fixture,
}: {
  eventId: string | null;
  slug?: string | null;
  live: boolean;
  kickoff?: string | null;
  initialDetail?: MatchDetailDTO | null;
  /** Fallback identity so the feed can be resolved without a cached ESPN id. */
  fixture?: { home: string; away: string; kickoff: string; competition?: string | null } | null;
}) {
  const [showMoreStats, setShowMoreStats] = useState(false);
  const [detail, setDetail] = useState<MatchDetailDTO | null>(initialDetail ?? null);
  const [resolvedEventId, setResolvedEventId] = useState<string | null>(eventId);
  const canLoad = !!eventId || !!(fixture?.home && fixture?.away && fixture?.kickoff);
  const [loading, setLoading] = useState(canLoad && !initialDetail);
  const [now, setNow] = useState(() => Date.now());

  const koMs = kickoff ? Date.parse(kickoff) : NaN;
  const minsToKo = Number.isFinite(koMs) ? Math.round((koMs - now) / 60000) : null;
  const preMatch = !live && minsToKo !== null && minsToKo > -5;
  // Within 3 hours of kick-off we poll hard so line-ups/stats land the moment ESPN publishes them.
  const armed = live || (preMatch && minsToKo! <= 180);

  const fixtureKey = fixture ? `${fixture.home}|${fixture.away}|${fixture.kickoff}` : "";

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(t);
  }, []);

  // The parent begins loading before the dialog opens. Adopt that response when
  // it arrives instead of leaving the child on the older response it fetched at
  // mount. Never let a sparse response erase already published line-ups.
  useEffect(() => {
    if (!initialDetail) return;
    setDetail((current) => mergeMatchDetail(current, initialDetail));
    setLoading(false);
  }, [initialDetail]);

  useEffect(() => {
    if (!canLoad) {
      setDetail(null);
      setLoading(false);
      return;
    }

    let stopped = false;
    let timer: number | undefined;
    const load = async () => {
      const params = new URLSearchParams({ refresh: String(Date.now()) });
      if (eventId) params.set("eventId", eventId);
      if (slug) params.set("slug", slug);
      if (fixture?.home && fixture?.away && fixture?.kickoff) {
        params.set("home", fixture.home);
        params.set("away", fixture.away);
        params.set("kickoff", fixture.kickoff);
        if (fixture.competition) params.set("competition", fixture.competition);
      }
      try {
        const response = await fetch(`/api/public/boro-match-detail?${params.toString()}`, {
          headers: { accept: "application/json" },
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`Match data request failed (${response.status})`);
        const next = (await response.json()) as MatchDetailDTO & { eventId?: string; slug?: string };
        if (next.eventId) {
          setResolvedEventId(next.eventId);
        }
        if (stopped) return;
        setDetail((current) => mergeMatchDetail(current, next));
        setLoading(false);
        let hasLineups = next.lineups.some((lineup) => lineup.players.length > 0);

        // ESPN refuses our server's IP (403) in production, so the server answer
        // can be completely empty. The visitor's browser is not blocked — fetch
        // the same Gamecast feed directly and merge it in.
        // While the game is in play, always go direct from the browser so the
        // panel reflects ESPN as it happens rather than the relayed cache.
        if (live || (!hasLineups && !next.teamStats.length)) {
          const { fetchEspnDetailInBrowser } = await import("@/lib/boro-match-detail-client");
          const direct = await fetchEspnDetailInBrowser({
            eventId: next.eventId ?? eventId ?? resolvedEventId,
            slug: next.slug ?? slug ?? null,
            fixture: fixture ?? null,
          });
          if (stopped) return;
          if (direct) {
            setDetail((current) => mergeMatchDetail(current, direct));
            hasLineups = direct.lineups.some((lineup) => lineup.players.length > 0);
          }
        }
        timer = window.setTimeout(load, live ? 5_000 : armed ? (hasLineups ? 20_000 : 8_000) : 5 * 60_000);
      } catch (error) {
        console.error(error);
        if (!stopped) {
          setLoading(false);
          timer = window.setTimeout(load, 10_000);
        }
      }
    };

    if (!initialDetail) {
      setDetail(null);
      setLoading(true);
    }
    void load();
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [eventId, slug, live, armed, initialDetail, canLoad, fixtureKey]);

  const homeTeam = detail?.lineups.find((lineup) => lineup.teamId === detail.homeTeamId) ?? detail?.lineups[0] ?? null;
  const awayTeam = detail?.lineups.find((lineup) => lineup.teamId === detail.awayTeamId) ?? detail?.lineups[1] ?? null;
  const teams = { home: homeTeam, away: awayTeam };

  const primaryStats = detail?.teamStats.filter((s) => s.primary) ?? [];
  const extraStats = detail?.teamStats.filter((s) => !s.primary) ?? [];

  if (!eventId && !resolvedEventId && !canLoad) {
    return (
      <div className="rounded-xl border border-[#E11B22]/40 bg-[#E11B22]/10 px-4 py-8 text-center">
        <div className="text-sm font-bold uppercase tracking-wider text-red-200">Awaiting kick-off</div>
        <div className="mt-1.5 text-xs text-white/75">
          Line-ups, match action and player stats appear here once the teams are published.
        </div>
      </div>
    );
  }

  if (loading && !detail) {
    return <div className="py-8 text-center text-sm text-white/75">Loading match data…</div>;
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
          {koLabel && <span className="ml-auto normal-case tracking-normal text-white/90">{koLabel}</span>}
        </div>
      )}
      <TabsList className="grid w-full grid-cols-3 rounded-lg border border-white/15 bg-black/60 p-1">
        <TabsTrigger value="action" className="text-white/70 data-[state=active]:bg-[#E11B22] data-[state=active]:text-white data-[state=active]:shadow-[0_2px_10px_-2px_rgba(225,27,34,0.8)]">Match action</TabsTrigger>
        <TabsTrigger value="stats" className="text-white/70 data-[state=active]:bg-[#E11B22] data-[state=active]:text-white data-[state=active]:shadow-[0_2px_10px_-2px_rgba(225,27,34,0.8)]">Game stats</TabsTrigger>
        <TabsTrigger value="lineups" className="text-white/70 data-[state=active]:bg-[#E11B22] data-[state=active]:text-white data-[state=active]:shadow-[0_2px_10px_-2px_rgba(225,27,34,0.8)]">Line-ups</TabsTrigger>
      </TabsList>

      <TabsContent value="action" className="mt-4">
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="grid w-full grid-cols-5 rounded-lg border border-white/15 bg-black/60 p-1">
            {ACTION_GROUPS.map((g) => {
              const count =
                g.value === "pens"
                  ? (detail?.events.filter((e) => g.kinds!.includes(e.kind)).length ?? 0) +
                    (detail?.shootout.length ?? 0)
                  : g.kinds
                    ? (detail?.events.filter((e) => g.kinds!.includes(e.kind)).length ?? 0)
                    : (detail?.events.length ?? 0);
              return (
                <TabsTrigger key={g.value} value={g.value} className="text-[11px] sm:text-xs text-white/70 data-[state=active]:bg-[#E11B22] data-[state=active]:text-white data-[state=active]:shadow-[0_2px_10px_-2px_rgba(225,27,34,0.8)]">
                  {g.label}
                  {count > 0 && (
                    <span className="ml-1 rounded bg-white/25 px-1 text-[10px] font-bold tabular-nums">{count}</span>
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
                  <div className="flex items-center gap-3 rounded-lg border border-dashed border-white/20 bg-white/[0.08] px-3 py-3 text-sm">
                    {!detail?.available ? (
                      <RefreshCw className="size-4 shrink-0 animate-spin text-red-300" />
                    ) : (
                      <span className="w-12 shrink-0 tabular-nums text-xs font-bold text-white/55">--&apos;</span>
                    )}
                    <span className="flex-1 text-white/75">
                      {!detail?.available ? "Refreshing match data…" : `${g.emptyLabel} — awaiting first entry`}
                    </span>
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
                              <span className="shrink-0 text-[11px] text-white/85">{ev.teamName ?? ""}</span>
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
            <div className="overflow-hidden rounded-lg border border-white/20">
              <table className="w-full text-sm">
                <thead className="bg-white/10 text-[11px] uppercase tracking-wider text-white/75">
                  <tr>
                    <th className="px-3 py-2 text-left">{detail?.home}</th>
                    <th className="px-3 py-2 text-center">Stat</th>
                    <th className="px-3 py-2 text-right">{detail?.away}</th>
                  </tr>
                </thead>
                <tbody>
                  {(showMoreStats ? [...primaryStats, ...extraStats] : primaryStats).map((s) => (
                    <tr key={s.name} className="border-t border-white/15">
                      <td className="px-3 py-1.5 text-left font-bold tabular-nums text-white">{s.home}</td>
                      <td className="px-3 py-1.5 text-center text-white/85">{s.label}</td>
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
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold text-white/95 hover:bg-white/[0.16] transition"
              >
                {showMoreStats ? "Fewer stats" : `More stats (${extraStats.length})`}
                <ChevronDown className={`size-3.5 transition ${showMoreStats ? "rotate-180" : ""}`} />
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-dashed border-white/20">
            <div className="border-b border-white/20 bg-white/10 px-3 py-2 text-[12px] text-white/85">
              Awaiting stats — recording starts at kick-off.
            </div>
            <table className="w-full text-sm">
              <thead className="bg-white/10 text-[11px] uppercase tracking-wider text-white/75">
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
                  <tr key={label} className="border-t border-white/15">
                    <td className="px-3 py-1.5 text-left font-bold tabular-nums text-white/60">–</td>
                    <td className="px-3 py-1.5 text-center text-white/75">{label}</td>
                    <td className="px-3 py-1.5 text-right font-bold tabular-nums text-white/60">–</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TabsContent>

      <TabsContent value="lineups" className="mt-4">
        <Tabs defaultValue="home-xi" className="w-full">
          <TabsList className="grid w-full grid-cols-2 gap-1 sm:grid-cols-4 rounded-lg border border-white/15 bg-black/60 p-1">
            <TabsTrigger value="home-xi" className="text-[11px] sm:text-xs text-white/70 data-[state=active]:bg-[#E11B22] data-[state=active]:text-white data-[state=active]:shadow-[0_2px_10px_-2px_rgba(225,27,34,0.8)]">
              Home XI
            </TabsTrigger>
            <TabsTrigger value="away-xi" className="text-[11px] sm:text-xs text-white/70 data-[state=active]:bg-[#E11B22] data-[state=active]:text-white data-[state=active]:shadow-[0_2px_10px_-2px_rgba(225,27,34,0.8)]">
              Away XI
            </TabsTrigger>
            <TabsTrigger value="home-subs" className="text-[11px] sm:text-xs text-white/70 data-[state=active]:bg-[#E11B22] data-[state=active]:text-white data-[state=active]:shadow-[0_2px_10px_-2px_rgba(225,27,34,0.8)]">
              Home subs
            </TabsTrigger>
            <TabsTrigger value="away-subs" className="text-[11px] sm:text-xs text-white/70 data-[state=active]:bg-[#E11B22] data-[state=active]:text-white data-[state=active]:shadow-[0_2px_10px_-2px_rgba(225,27,34,0.8)]">
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
              <LineupPanel side={cfg.side} starters={cfg.starters} team={cfg.team} columns={statColumns} />
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
  columns,
}: {
  side: "Home" | "Away";
  starters: boolean;
  team: MatchDetailDTO["lineups"][number] | null;
  columns: StatColumn[];
}) {
  const label = starters ? `${side} XI` : `${side} substitutes`;
  const players = (team?.players ?? [])
    .filter((p) => (starters ? p.starter : !p.starter))
    .slice()
    .sort((a, b) => (Number(a.jersey) || 99) - (Number(b.jersey) || 99));

  return (
    <div className="space-y-3">
      {players.length === 0 && (
        <p className="rounded-lg border border-white/20 bg-white/10 p-3 text-sm text-white/85">
          {starters
            ? "Awaiting line-ups — published about an hour before kick-off. Player stat columns below are ready and fill in live."
            : "Awaiting bench — substitutes appear with the line-ups. Stat columns below fill in live once they come on."}
        </p>
      )}
      <div
        className={`overflow-hidden rounded-lg border ${
          players.length ? "border-white/20" : "border-dashed border-white/20"
        }`}
      >
        <div className="flex items-center gap-2 bg-white/10 px-3 py-2">
          {team?.logo && (
            <img src={team.logo} alt="" width={18} height={18} className="size-[18px]" loading="lazy" />
          )}
          <span className={`text-sm font-bold ${players.length ? "text-white" : "text-white/75"}`}>
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
            <StatHead columns={columns} />
            {players.length ? (
              <tbody>
                {players.map((p) => (
                  <PlayerRow key={p.id} p={p} columns={columns} />
                ))}
              </tbody>
            ) : (
              <PlaceholderRows rows={starters ? 11 : 7} columns={columns} />
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
