import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { ArrowLeft, ChartPie, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { membersByLetter, viewingDuration, viewingSegments, watchActivityByDay, WATCH_ACTIVITY_DAYS, WATCH_KINDS } from "@/lib/player-watch-activity";

type Member = { user_id: string; username: string; seconds: number; last_watched_at: string | null };
const date = (value: string) => new Date(value).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function PlayerMemberViewing() {
  const [search, setSearch] = useState("");
  const [member, setMember] = useState<Member | null>(null);
  const members = useQuery({ queryKey: ["player-watch-members"], refetchInterval: 15_000, refetchOnWindowFocus: true, queryFn: async () => {
    const { data, error } = await supabase.rpc("player_watch_members");
    if (error) throw error;
    return data ?? [];
  } });
  const details = useQuery({ queryKey: ["player-watch-member", member?.user_id], enabled: !!member, refetchInterval: member ? 15_000 : false, queryFn: async () => {
    if (!member) return { breakdown: [], activity: [] };
    const [breakdown, activity] = await Promise.all([
      supabase.rpc("player_watch_member_breakdown", { _user: member.user_id }),
      supabase.from("player_watch_activity").select("id,kind,title,category,platform,started_at,last_watched_at,seconds").eq("user_id", member.user_id).gte("last_watched_at", new Date(Date.now() - (WATCH_ACTIVITY_DAYS + 1) * 86400000).toISOString()).order("last_watched_at", { ascending: false }).limit(1000),
    ]);
    if (breakdown.error) throw breakdown.error;
    if (activity.error) throw activity.error;
    return { breakdown: breakdown.data ?? [], activity: watchActivityByDay(activity.data ?? []) };
  } });
  const segments = viewingSegments(details.data?.breakdown ?? []);
  const total = segments.reduce((sum, row) => sum + row.seconds, 0);
  const shown = (members.data ?? []).filter(row => row.username.toLowerCase().includes(search.toLowerCase()));

  return <section className="space-y-4 border-t border-border pt-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="text-base font-semibold">Members</h3>
      <div className="relative w-full sm:w-64"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="Search members" placeholder="Search members" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" /></div>
    </div>
    {members.isPending ? <p className="text-sm text-muted-foreground">Loading members…</p> : members.isError ? <p role="alert" className="text-sm text-destructive">Couldn’t load members. <Button variant="link" onClick={() => void members.refetch()}>Retry</Button></p> : shown.length === 0 ? <p className="text-sm text-muted-foreground">{search ? "No matching members." : "No members have linked a BM Player yet."}</p> : <div className="overflow-x-auto"><table className="w-full text-sm">
      <thead className="border-b border-border text-left text-xs text-muted-foreground"><tr><th className="py-3 pr-3">Member</th><th className="p-3">Total viewed</th><th className="p-3 max-sm:hidden">Last watched · UK</th><th className="py-3 pl-3"><span className="sr-only">Viewing details</span></th></tr></thead>
      <tbody>{shown.map(row => <tr key={row.user_id} className="border-b border-border"><td className="py-3 pr-3"><Button variant="link" className="h-auto max-w-56 whitespace-normal break-words p-0 text-left" onClick={() => setMember(row)}>{row.username}</Button></td><td className="p-3 tabular-nums">{viewingDuration(row.seconds)}</td><td className="p-3 text-muted-foreground max-sm:hidden">{row.last_watched_at ? date(row.last_watched_at) : "—"}</td><td className="py-3 pl-3"><Button variant="ghost" size="icon" title={`Viewing details for ${row.username}`} aria-label={`Viewing details for ${row.username}`} onClick={() => setMember(row)}><ChartPie className="size-4" /></Button></td></tr>)}</tbody>
    </table></div>}
    {member && <div role="dialog" aria-modal="true" aria-label={`${member.username} viewing activity`} className="fixed inset-0 z-50 overflow-y-auto bg-background"><div className="mx-auto w-full max-w-5xl space-y-5 p-4 sm:p-8">
      <Button variant="outline" onClick={() => setMember(null)}><ArrowLeft className="size-4" />Back to members</Button>
      <div><h2 className="font-display text-2xl font-bold break-words">{member.username} · Viewing activity</h2><p className="text-sm text-muted-foreground">All recorded viewing · UK dates and times</p></div>
      {details.isPending ? <p className="text-sm text-muted-foreground">Loading viewing activity…</p> : details.isError ? <p role="alert" className="text-sm text-destructive">Couldn’t load viewing activity. <Button variant="link" onClick={() => void details.refetch()}>Retry</Button></p> : <>
        <section aria-label="Viewing breakdown" className="space-y-3">
          <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">What they watched</h3><strong className="tabular-nums">{viewingDuration(total)}</strong></div>
          {total > 0 ? <div className="flex flex-col items-center gap-6 sm:flex-row"><div className="size-64 shrink-0" role="img" aria-label={segments.map(s => `${s.label} ${s.percent.toFixed(1)}%`).join(", ")}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={segments.filter(s => s.seconds > 0)} dataKey="seconds" nameKey="label" outerRadius="95%" stroke="var(--background)" strokeWidth={2} isAnimationActive={false}>{segments.filter(s => s.seconds > 0).map(s => <Cell key={s.key} fill={s.color} />)}</Pie></PieChart></ResponsiveContainer></div><dl className="w-full flex-1 space-y-3">{segments.map(s => <div key={s.key} className="flex items-center justify-between gap-3 text-sm"><dt className="flex items-center gap-2"><span className={`size-3 shrink-0 rounded-full ${s.swatch}`} />{s.label}</dt><dd className="text-right tabular-nums"><strong>{s.percent.toFixed(1)}%</strong><span className="ml-3 text-muted-foreground">{viewingDuration(s.seconds)}</span></dd></div>)}</dl></div> : <p className="text-sm text-muted-foreground">No viewing time recorded for this member yet.</p>}
        </section>
        <section aria-label="Last 7 days of activity" className="space-y-3 border-t border-border pt-4"><h3 className="font-semibold">Last 7 days of activity</h3>
          {details.data?.activity.length ? <Tabs defaultValue={details.data.activity[0].day}>
            <TabsList className="h-auto flex-wrap justify-start">{details.data.activity.map(d => <TabsTrigger key={d.day} value={d.day}>{new Date(d.day + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} ({d.rows.length})</TabsTrigger>)}</TabsList>
            {details.data.activity.map(d => <TabsContent key={d.day} value={d.day}>{d.rows.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b border-border text-left text-xs text-muted-foreground"><tr><th className="py-3 pr-3">Last watched · UK</th><th className="p-3">Watched</th><th className="p-3">Time viewed</th><th className="p-3 max-sm:hidden">Device</th></tr></thead><tbody>{d.rows.map(row => <tr key={row.id} className="border-b border-border"><td className="py-3 pr-3 align-top text-xs">{date(row.last_watched_at)}</td><td className="min-w-36 p-3 align-top"><span className="block break-words font-medium">{row.title}</span><span className="text-xs text-muted-foreground">{WATCH_KINDS.find(k => k.key === row.kind)?.label ?? row.kind}{row.category ? ` · ${row.category}` : ""}</span></td><td className="p-3 align-top tabular-nums">{viewingDuration(row.seconds)}</td><td className="p-3 align-top text-muted-foreground max-sm:hidden">{row.platform ?? "—"}</td></tr>)}</tbody></table></div> : <p className="py-3 text-sm text-muted-foreground">Nothing watched on this day.</p>}</TabsContent>)}
          </Tabs> : null}
        </section>
      </>}
    </div></div>}
  </section>;
}