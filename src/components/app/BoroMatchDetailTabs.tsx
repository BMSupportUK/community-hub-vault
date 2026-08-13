import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Goal, Square, RefreshCw } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getBoroMatchDetail,
  type MatchDetailDTO,
  type PlayerLine,
} from "@/lib/boro-match-detail.functions";

const STAT_COLUMNS: Array<{ key: string; label: string }> = [
  { key: "totalGoals", label: "G" },
  { key: "goalAssists", label: "A" },
  { key: "totalShots", label: "SH" },
  { key: "shotsOnTarget", label: "SOT" },
  { key: "foulsCommitted", label: "FC" },
  { key: "foulsSuffered", label: "FS" },
  { key: "offsides", label: "OFF" },
  { key: "yellowCards", label: "YC" },
  { key: "redCards", label: "RC" },
  { key: "saves", label: "SV" },
  { key: "goalsConceded", label: "GC" },
];

function EventIcon({ kind }: { kind: string }) {
  if (kind === "yellow") return <Square className="size-3.5 fill-amber-400 text-amber-400" />;
  if (kind === "red") return <Square className="size-3.5 fill-red-500 text-red-500" />;
  if (kind === "sub") return <RefreshCw className="size-3.5 text-emerald-300" />;
  return <Goal className="size-3.5 text-white" />;
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
}: {
  eventId: string;
  slug?: string | null;
  live: boolean;
}) {
  const fetchDetail = useServerFn(getBoroMatchDetail);
  const [detail, setDetail] = useState<MatchDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const run = async () => {
      try {
        const d = await fetchDetail({ data: { eventId, slug: slug ?? undefined } });
        if (cancelled) return;
        setDetail(d);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
        if (!cancelled) timer = window.setTimeout(run, live ? 20_000 : 5 * 60_000);
      }
    };
    void run();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [eventId, slug, live]);

  const teams = useMemo(() => {
    const home = detail?.lineups.find((l) => l.teamId === detail?.homeTeamId) ?? detail?.lineups[0] ?? null;
    const away = detail?.lineups.find((l) => l.teamId === detail?.awayTeamId) ?? detail?.lineups[1] ?? null;
    return { home, away };
  }, [detail]);

  if (loading && !detail) {
    return <div className="py-8 text-center text-sm text-white/50">Loading match data…</div>;
  }

  return (
    <Tabs defaultValue="action" className="w-full">
      <TabsList className="grid w-full grid-cols-3 bg-white/5">
        <TabsTrigger value="action">Match action</TabsTrigger>
        <TabsTrigger value="stats">Game stats</TabsTrigger>
        <TabsTrigger value="lineups">Line-ups</TabsTrigger>
      </TabsList>

      <TabsContent value="action" className="mt-4">
        {detail?.events.length ? (
          <ul className="space-y-1.5">
            {detail.events.map((ev, i) => (
              <li
                key={i}
                className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
              >
                <span className="w-12 shrink-0 tabular-nums text-xs font-bold text-amber-200">
                  {ev.clock ?? "-"}
                </span>
                <EventIcon kind={ev.kind} />
                <span className="min-w-0 flex-1 truncate text-white">
                  {ev.players.length ? ev.players.join(" · ") : ev.text}
                </span>
                <span className="shrink-0 text-[11px] text-white/50">
                  {ev.teamId === detail.homeTeamId ? detail.home : ev.teamId === detail.awayTeamId ? detail.away : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/50">
            No goals or cards recorded yet — this fills in live as the game unfolds.
          </p>
        )}
      </TabsContent>

      <TabsContent value="stats" className="mt-4">
        {detail?.teamStats.length ? (
          <div className="overflow-hidden rounded-lg border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-[11px] uppercase tracking-wider text-white/50">
                <tr>
                  <th className="px-3 py-2 text-left">{detail.home}</th>
                  <th className="px-3 py-2 text-center">Stat</th>
                  <th className="px-3 py-2 text-right">{detail.away}</th>
                </tr>
              </thead>
              <tbody>
                {detail.teamStats.map((s) => (
                  <tr key={s.label} className="border-t border-white/5">
                    <td className="px-3 py-1.5 text-left font-bold tabular-nums text-white">{s.home}</td>
                    <td className="px-3 py-1.5 text-center text-white/60">{s.label}</td>
                    <td className="px-3 py-1.5 text-right font-bold tabular-nums text-white">{s.away}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/50">
            Team stats appear once the match is under way.
          </p>
        )}
      </TabsContent>

      <TabsContent value="lineups" className="mt-4">
        {teams.home || teams.away ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {[teams.home, teams.away].map((t, idx) =>
              t ? (
                <div key={idx} className="overflow-hidden rounded-lg border border-white/10">
                  <div className="flex items-center gap-2 bg-white/5 px-3 py-2">
                    {t.logo && <img src={t.logo} alt="" width={18} height={18} className="size-[18px]" loading="lazy" />}
                    <span className="text-sm font-bold text-white">{t.team}</span>
                    {t.formation && (
                      <span className="ml-auto rounded bg-[#E11B22]/20 px-1.5 py-0.5 text-[10px] font-bold text-red-200">
                        {t.formation}
                      </span>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px]">
                      <thead className="text-[10px] uppercase text-white/40">
                        <tr>
                          <th className="px-3 py-1.5 text-left">Player</th>
                          {STAT_COLUMNS.map((c) => (
                            <th key={c.key} className="px-1.5 py-1.5 text-center">
                              {c.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {t.players
                          .slice()
                          .sort((a, b) => Number(b.starter) - Number(a.starter))
                          .map((p) => (
                            <PlayerRow key={p.id} p={p} />
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null,
            )}
          </div>
        ) : (
          <p className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/50">
            Line-ups are published about an hour before kick-off and update live.
          </p>
        )}
      </TabsContent>
    </Tabs>
  );
}