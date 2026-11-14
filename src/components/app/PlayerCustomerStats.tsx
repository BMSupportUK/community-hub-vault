import { Component, Suspense, useState, type ReactNode } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { customerStatsDays, customerStatsSegments } from '@/lib/player-customer-stats';
import { viewingDuration } from '@/lib/player-watch-activity';

const colors = ['var(--accent)', 'var(--success)', 'var(--warning)', 'var(--destructive)', 'var(--primary)', 'var(--muted-foreground)'];
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
const label = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
class StatsError extends Component<{ children: ReactNode }, { failed: boolean }> {
 state = { failed: false };
 static getDerivedStateFromError() { return { failed: true }; }
 render() { return this.state.failed ? <p role="alert" className="text-sm text-destructive">Could not load customer stats. Reopen the connection log to try again.</p> : this.props.children; }
}

export function PlayerCustomerStats({ userId }: { userId: string }) {
 return <section className="mt-8 space-y-4 border-t border-border pt-6"><h2 className="font-display text-xl font-bold">BM Player · Customer stats</h2><p className="text-xs text-muted-foreground">Last 7 days · UK dates and times</p><StatsError><Suspense fallback={<p className="text-sm text-muted-foreground">Loading customer stats…</p>}><Stats userId={userId} /></Suspense></StatsError></section>;
}
function Stats({ userId }: { userId: string }) {
 const days = customerStatsDays();
 const { data } = useSuspenseQuery({ queryKey: ['player-customer-stats', userId, days[0]], refetchInterval: 30000, queryFn: async () => {
  const [stats, devices] = await Promise.all([
   supabase.from('player_customer_daily_stats').select('*').eq('user_id', userId).gte('day', days[6]).lte('day', days[0]).order('last_watched_at', { ascending: false }),
   supabase.from('player_devices').select('id,watching_title,watching_preview,last_seen_at,iptv_username').eq('user_id', userId).gte('last_seen_at', new Date(Date.now()-180000).toISOString()),
  ]);
  if (stats.error) throw new Error('Could not load customer viewing statistics.');
  if (devices.error) throw new Error('Could not load current playback.');
  return { rows: stats.data ?? [], devices: devices.data ?? [] };
 } });
 const [day, setDay] = useState(days[0]);
 const rows = data.rows.filter(row => row.day === day), segments = customerStatsSegments(rows);
 const total = segments.reduce((sum, row) => sum+row.seconds, 0);
 return <Tabs value={day} onValueChange={setDay}>
  <TabsList className="h-auto flex-wrap justify-start gap-1">{days.map(d => <TabsTrigger key={d} value={d}>{label(d)}</TabsTrigger>)}</TabsList>
  {days.map(d => <TabsContent key={d} value={d} className="space-y-5">
   {d === days[0] && data.devices.some(x => x.watching_title && !x.watching_preview) && <p className="text-sm font-semibold text-success">Watching now: {data.devices.filter(x => x.watching_title && !x.watching_preview).map(x => x.watching_title).join(' · ')}</p>}
   <Tabs defaultValue="summary"><TabsList><TabsTrigger value="summary">Summary</TabsTrigger><TabsTrigger value="details">Details</TabsTrigger></TabsList>
    <TabsContent value="summary"><div className="grid items-center gap-6 md:grid-cols-2">
     <div className="relative mx-auto aspect-square w-full max-w-96" role="img" aria-label={`Total ${viewingDuration(total)}. ${segments.map(s=>`${s.title}: ${s.percent.toFixed(1)}%`).join(', ')}`}>
      {total > 0 ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={segments} dataKey="seconds" nameKey="title" innerRadius="65%" outerRadius="95%" stroke="var(--background)" strokeWidth={2} isAnimationActive={false}>{segments.map((s,i)=><Cell key={`${s.kind}:${s.title}`} fill={colors[i%colors.length]} />)}</Pie><Tooltip formatter={value=>viewingDuration(Number(value))} contentStyle={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }} /></PieChart></ResponsiveContainer> : <div className="absolute inset-5 rounded-full border-[24px] border-muted" />}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-20 text-center"><span className="text-sm text-muted-foreground">Total viewed</span><strong className="text-xl tabular-nums">{viewingDuration(total)}</strong></div>
     </div><dl className="max-h-96 space-y-3 overflow-y-auto">{segments.length ? segments.map((s,i)=><div key={`${s.kind}:${s.title}`} className="flex justify-between gap-3 text-sm"><dt className="min-w-0 break-words"><svg className="mr-2 inline size-3" aria-hidden="true"><circle cx="6" cy="6" r="6" fill={colors[i%colors.length]} /></svg>{s.title}</dt><dd className="shrink-0 text-right tabular-nums"><strong>{s.percent.toFixed(1)}%</strong><span className="block text-xs text-muted-foreground">{viewingDuration(s.seconds)}</span></dd></div>) : <p className="text-sm text-muted-foreground">Nothing recorded on this day.</p>}</dl>
    </div></TabsContent>
    <TabsContent value="details"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b border-border text-left text-xs text-muted-foreground"><tr><th className="p-3">Watched</th><th className="p-3">Time viewed</th><th className="p-3">Last seen · UK</th><th className="p-3">Device / login</th></tr></thead><tbody>{rows.map(r=><tr key={r.id} className="border-b border-border"><td className="p-3"><strong className="block break-words">{r.title}</strong><span className="text-xs text-muted-foreground">{r.category || r.kind}</span></td><td className="whitespace-nowrap p-3">{viewingDuration(Number(r.seconds))}</td><td className="p-3">{time(r.last_watched_at)}</td><td className="p-3">{r.platform}<span className="block text-xs text-muted-foreground">{r.login}</span></td></tr>)}</tbody></table>{!rows.length && <p className="p-3 text-sm text-muted-foreground">Nothing recorded on this day.</p>}</div></TabsContent>
   </Tabs>
   <div className="overflow-x-auto border-t border-border pt-3"><table className="w-full text-sm"><thead className="text-left text-xs text-muted-foreground"><tr><th className="p-3">IP</th><th className="p-3">Location</th><th className="p-3">Flags</th></tr></thead><tbody>{[...new Map(rows.map(r=>[`${r.last_ip}:${r.geo_city}:${r.vpn_status}`,r])).values()].map(r=><tr key={r.id} className="border-t border-border"><td className="p-3 font-mono text-xs">{r.last_ip || 'Unknown'}</td><td className="p-3">{[r.geo_city,r.geo_country].filter(Boolean).join(', ') || 'Unknown'}</td><td className="p-3">{r.vpn_status==='yes'?'VPN':r.vpn_status==='no'?'No VPN':'Unknown'}</td></tr>)}</tbody></table></div>
  </TabsContent>)}
 </Tabs>;
}