import { Component, Suspense, useState, type ReactNode } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { customerStatsDays, customerStatsSegments, connectionStrength, connectionDiagnosis, mbps, type Strength } from '@/lib/player-customer-stats';
import { viewingDuration } from '@/lib/player-watch-activity';

const colors = ['var(--accent)', 'var(--success)', 'var(--warning)', 'var(--destructive)', 'var(--primary)', 'var(--muted-foreground)'];
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
const label = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const tone = { strong: 'bg-success', ok: 'bg-primary', weak: 'bg-warning', very_weak: 'bg-destructive', none: 'bg-muted' } as const;
function Bars({ strength, title }: { strength: Strength; title?: string }) {
 return <span className="inline-flex items-center gap-2" title={title}><span className="inline-flex items-end gap-0.5" aria-hidden="true">{[1,2,3,4].map(n=><span key={n} className={`w-1.5 rounded-sm ${n <= strength.bars ? tone[strength.level] : 'bg-muted'}`} style={{ height: `${n*4}px` }} />)}</span><span className="text-xs font-semibold">{strength.label}</span></span>;
}
const avg = (r: { speed_kbps_sum: number; speed_samples: number }) => r.speed_samples ? Number(r.speed_kbps_sum) / r.speed_samples : null;
class StatsError extends Component<{ children: ReactNode }, { failed: boolean }> {
 state = { failed: false };
 static getDerivedStateFromError() { return { failed: true }; }
 render() { return this.state.failed ? <p role="alert" className="text-sm text-destructive">Could not load customer stats. Reopen the connection log to try again.</p> : this.props.children; }
}

export function PlayerCustomerStats({ userId }: { userId: string }) {
 return <section className="space-y-4 pt-4"><h2 className="font-display text-xl font-bold">BM Player · Customer stats</h2><p className="text-xs text-muted-foreground">Last 7 days · UK dates and times</p><StatsError><Suspense fallback={<p className="text-sm text-muted-foreground">Loading customer stats…</p>}><Stats userId={userId} /></Suspense></StatsError></section>;
}
function Stats({ userId }: { userId: string }) {
 const days = customerStatsDays();
 const { data } = useSuspenseQuery({ queryKey: ['player-customer-stats', userId, days[0]], refetchInterval: 30000, queryFn: async () => {
  const owned = await supabase.from('player_devices').select('id').eq('user_id', userId).limit(200);
  const ids = (owned.data ?? []).map(d => d.id);
  const [stats, devices, buffers] = await Promise.all([
   supabase.from('player_customer_daily_stats').select('*').eq('user_id', userId).gte('day', days[6]).lte('day', days[0]).order('last_watched_at', { ascending: false }),
   supabase.from('player_devices').select('id,watching_title,watching_preview,last_seen_at,iptv_username').eq('user_id', userId).gte('last_seen_at', new Date(Date.now()-180000).toISOString()),
   supabase.from('player_buffer_events').select('device_id,content_name,stall_ms,occurred_at').in('device_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']).gte('occurred_at', new Date(Date.now()-8*86400000).toISOString()).limit(2000),
  ]);
  if (stats.error) throw new Error('Could not load customer viewing statistics.');
  if (devices.error) throw new Error('Could not load current playback.');
  return { rows: stats.data ?? [], devices: devices.data ?? [], buffers: buffers.error ? [] : buffers.data ?? [] };
 } });
 const [day, setDay] = useState(days[0]);
 const rows = data.rows.filter(row => row.day === day), segments = customerStatsSegments(rows);
 const total = segments.reduce((sum, row) => sum+row.seconds, 0);
 const ukDay = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(iso));
 const buf = (r: { device_id: string; title: string; day: string }) => { const list = data.buffers.filter(b => b.device_id === r.device_id && b.content_name === r.title && ukDay(b.occurred_at) === r.day); return { count: list.length, ms: list.reduce((s, b) => s + Number(b.stall_ms), 0) }; };
 const sum = rows.reduce((a, r) => ({ s: a.s + Number(r.speed_kbps_sum), n: a.n + r.speed_samples }), { s: 0, n: 0 });
 const dayStrength = connectionStrength(sum.n ? sum.s / sum.n : null);
 return <Tabs value={day} onValueChange={setDay}>
  <TabsList className="h-auto flex-wrap justify-start gap-1">{days.map(d => <TabsTrigger key={d} value={d}>{label(d)}</TabsTrigger>)}</TabsList>
  {days.map(d => <TabsContent key={d} value={d} className="space-y-5">
   {d === days[0] && data.devices.some(x => x.watching_title && !x.watching_preview) && <p className="text-sm font-semibold text-success">Watching now: {data.devices.filter(x => x.watching_title && !x.watching_preview).map(x => x.watching_title).join(' · ')}</p>}
   <Tabs defaultValue="summary"><TabsList><TabsTrigger value="summary">Summary</TabsTrigger><TabsTrigger value="details">Details</TabsTrigger></TabsList>
    <TabsContent value="summary"><p className="mb-3 flex items-center gap-2 text-sm">Connection today: <Bars strength={dayStrength} />{sum.n > 0 && <span className="text-xs text-muted-foreground">avg {mbps(sum.s / sum.n)}</span>}</p><div className="grid items-center gap-6 md:grid-cols-2">
     <div className="relative mx-auto aspect-square w-full max-w-96" role="img" aria-label={`Total ${viewingDuration(total)}. ${segments.map(s=>`${s.title}: ${s.percent.toFixed(1)}%`).join(', ')}`}>
      {total > 0 ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={segments} dataKey="seconds" nameKey="title" innerRadius="65%" outerRadius="95%" stroke="var(--background)" strokeWidth={2} isAnimationActive={false}>{segments.map((s,i)=><Cell key={`${s.kind}:${s.title}`} fill={colors[i%colors.length]} />)}</Pie><Tooltip formatter={value=>viewingDuration(Number(value))} contentStyle={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }} /></PieChart></ResponsiveContainer> : <div className="absolute inset-5 rounded-full border-[24px] border-muted" />}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-20 text-center"><span className="text-sm text-muted-foreground">Total viewed</span><strong className="text-xl tabular-nums">{viewingDuration(total)}</strong></div>
     </div><dl className="max-h-96 space-y-3 overflow-y-auto">{segments.length ? segments.map((s,i)=><div key={`${s.kind}:${s.title}`} className="flex justify-between gap-3 text-sm"><dt className="min-w-0 break-words"><svg className="mr-2 inline size-3" aria-hidden="true"><circle cx="6" cy="6" r="6" fill={colors[i%colors.length]} /></svg>{s.title}</dt><dd className="shrink-0 text-right tabular-nums"><strong>{s.percent.toFixed(1)}%</strong><span className="block text-xs text-muted-foreground">{viewingDuration(s.seconds)}</span></dd></div>) : <p className="text-sm text-muted-foreground">Nothing recorded on this day.</p>}</dl>
    </div></TabsContent>
    <TabsContent value="details"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b border-border text-left text-xs text-muted-foreground"><tr><th className="p-3">Watched</th><th className="p-3">Time viewed</th><th className="p-3">Connection</th><th className="p-3">Buffering</th><th className="p-3">Last seen · UK</th><th className="p-3">Device / login</th></tr></thead><tbody>{rows.map(r=>{ const a = avg(r), st = connectionStrength(a, r.bitrate_kbps), b = buf(r), why = connectionDiagnosis(st, b.count); return <tr key={r.id} className="border-b border-border"><td className="p-3"><strong className="block break-words">{r.title}</strong><span className="text-xs text-muted-foreground">{r.category || r.kind}</span></td><td className="whitespace-nowrap p-3">{viewingDuration(Number(r.seconds))}</td><td className="p-3"><Bars strength={st} title={a ? `Lowest ${mbps(r.speed_min_kbps ?? 0)} · Average ${mbps(a)} · Highest ${mbps(r.speed_max_kbps ?? 0)}` : undefined} />{a && <span className="block text-xs text-muted-foreground">{mbps(a)}</span>}</td><td className="whitespace-nowrap p-3">{b.count ? `${b.count}× · ${viewingDuration(Math.round(b.ms/1000))} frozen` : 'None'}{why && <span className={`block text-xs font-semibold ${st.bars <= 2 ? 'text-destructive' : 'text-warning'}`}>{why}</span>}</td><td className="p-3">{time(r.last_watched_at)}</td><td className="p-3">{r.platform}<span className="block text-xs text-muted-foreground">{r.login}</span></td></tr>; })}</tbody></table>{!rows.length && <p className="p-3 text-sm text-muted-foreground">Nothing recorded on this day.</p>}</div></TabsContent>
   </Tabs>
   <div className="overflow-x-auto border-t border-border pt-3"><table className="w-full text-sm"><thead className="text-left text-xs text-muted-foreground"><tr><th className="p-3">IP</th><th className="p-3">Location</th><th className="p-3">Flags</th></tr></thead><tbody>{[...new Map(rows.map(r=>[`${r.last_ip}:${r.geo_city}:${r.vpn_status}`,r])).values()].map(r=><tr key={r.id} className="border-t border-border"><td className="p-3 font-mono text-xs">{r.last_ip || 'Unknown'}</td><td className="p-3">{[r.geo_city,r.geo_country].filter(Boolean).join(', ') || 'Unknown'}</td><td className="p-3">{r.vpn_status==='yes'?'VPN':r.vpn_status==='no'?'No VPN':'Unknown'}</td></tr>)}</tbody></table></div>
  </TabsContent>)}
 </Tabs>;
}