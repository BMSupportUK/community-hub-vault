import { Component, Suspense, useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { customerStatsDays, customerStatsSegments, playbackReliability, latestConnectionReading, mbps, channelLinkRating, type Strength } from '@/lib/player-customer-stats';
import { viewingDuration } from '@/lib/player-watch-activity';
import { Button } from '@/components/ui/button';
import { connectionDayRange, CONNECTION_HISTORY_PAGE_SIZE } from '@/lib/player-connection-session';

const colors = ['var(--accent)', 'var(--success)', 'var(--warning)', 'var(--destructive)', 'var(--primary)', 'var(--muted-foreground)'];
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
const label = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const tone = { strong: 'bg-success', ok: 'bg-primary', weak: 'bg-warning', very_weak: 'bg-destructive', none: 'bg-muted' } as const;
/** One labelled fact shown as its own neat pill. */
function Pill({ label, children, strong }: { label?: string; children: ReactNode; strong?: boolean }) {
 return <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs shadow-sm">
  {label && <span className="text-muted-foreground">{label}</span>}
  <span className={strong ? 'font-semibold' : undefined}>{children}</span>
 </span>;
}
function Bars({ strength, title }: { strength: Strength; title?: string }) {
 if (strength.level === 'none') return <span className="text-xs text-muted-foreground" title={title}>{strength.label}</span>;
 return <span className="inline-flex items-center gap-2" title={title}><span className="inline-flex items-end gap-0.5" aria-hidden="true">{[1,2,3,4].map(n=><span key={n} className={`w-1.5 rounded-sm ${n <= strength.bars ? tone[strength.level] : 'bg-muted'}`} style={{ height: `${n*4}px` }} />)}</span><span className="text-xs font-semibold">{strength.label}</span></span>;
}
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
 const queryClient = useQueryClient();
 useEffect(() => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const refresh = () => {
   if (timer) return;
   timer = setTimeout(() => { timer = undefined; void queryClient.invalidateQueries({ queryKey: ['player-customer-stats', userId] }); }, 250);
  };
  const channel = supabase.channel(`customer-stats-${crypto.randomUUID()}`)
   .on('postgres_changes', { event: '*', schema: 'public', table: 'player_customer_daily_stats', filter: `user_id=eq.${userId}` }, refresh)
   .on('postgres_changes', { event: '*', schema: 'public', table: 'player_devices', filter: `user_id=eq.${userId}` }, refresh)
   .subscribe();
  return () => { if (timer) clearTimeout(timer); void supabase.removeChannel(channel); };
 }, [queryClient, userId]);
 const { data } = useSuspenseQuery({ queryKey: ['player-customer-stats', userId, days[0]], refetchInterval: 15000, queryFn: async () => {
  const owned = await supabase.from('player_devices').select('id').eq('user_id', userId).limit(200);
  const ids = (owned.data ?? []).map(d => d.id);
  const [stats, devices, buffers] = await Promise.all([
   supabase.from('player_customer_daily_stats').select('*').eq('user_id', userId).gte('day', days[6]).lte('day', days[0]).order('last_watched_at', { ascending: false }),
   supabase.from('player_devices').select('id,watching_title,watching_preview,watching_since,last_seen_at,iptv_username,net_ping_ms').eq('user_id', userId).gte('last_seen_at', new Date(Date.now()-180000).toISOString()),
   supabase.from('player_buffer_events').select('device_id,content_name,stall_ms,occurred_at,reconnected').in('device_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']).gte('occurred_at', new Date(Date.now()-8*86400000).toISOString()).order('occurred_at', { ascending: false }).limit(2000),
  ]);
  if (stats.error) throw new Error('Could not load customer viewing statistics.');
  if (devices.error) throw new Error('Could not load current playback.');
  return { rows: stats.data ?? [], devices: devices.data ?? [], buffers: buffers.error ? [] : buffers.data ?? [], reliabilityEvents: buffers.error ? null : buffers.data ?? [] };
 } });
 const [day, setDay] = useState(days[0]);
 const rows = data.rows.filter(row => row.day === day), segments = customerStatsSegments(rows);
 const total = segments.reduce((sum, row) => sum+row.seconds, 0);
 return <><div className="space-y-3 border-b border-border py-3">
  <h3 className="text-sm font-semibold">Playback reliability · Last 5 minutes reported</h3>
  {data.devices.filter(device => device.watching_title && !device.watching_preview).map(device => {
   const reading = data.rows.find(row => row.device_id === device.id && row.title === device.watching_title && row.login === device.iptv_username && row.day === days[0]);
   const speed = reading ? latestConnectionReading(reading, device) : null;
   const rel = playbackReliability(device, data.reliabilityEvents), rating = channelLinkRating((device as { net_ping_ms?: number | null }).net_ping_ms, rel);
   return <div key={device.id} className="flex flex-wrap items-center gap-2 text-sm">
    <Pill strong><span className="break-words">{device.watching_title}</span></Pill>
    <Pill label="Playback"><Bars strength={rel} title="Reported stalls and reconnects in this viewing session; reports may arrive after the interruption." /></Pill>
    {rating && <Pill label="Channel connection" strong>{rating} · Ping {(device as { net_ping_ms?: number | null }).net_ping_ms} ms</Pill>}
    {speed !== null
     ? <Pill label="Stream download">{mbps(speed)} · Updated {time(reading?.speed_latest_at ?? device.last_seen_at)} UK</Pill>
     : <Pill label="Stream download">Waiting for a fresh reading</Pill>}
   </div>;
  })}
  {!data.devices.some(device => device.watching_title && !device.watching_preview) && <p className="text-sm text-muted-foreground">Not watching now</p>}
 </div><Tabs value={day} onValueChange={setDay}>
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
    <TabsContent value="details"><ConnectionHistory key={`${userId}:${d}`} userId={userId} day={d} buffers={data.buffers} /></TabsContent>
   </Tabs>
   <div className="overflow-x-auto border-t border-border pt-3"><table className="w-full text-sm"><thead className="text-left text-xs text-muted-foreground"><tr><th className="p-3">IP</th><th className="p-3">Location</th><th className="p-3">Flags</th></tr></thead><tbody>{[...new Map(rows.map(r=>[`${r.last_ip}:${r.geo_city}:${r.vpn_status}`,r])).values()].map(r=><tr key={r.id} className="border-t border-border"><td className="p-3 font-mono text-xs">{r.last_ip || 'Unknown'}</td><td className="p-3">{[r.geo_city,r.geo_country].filter(Boolean).join(', ') || 'Unknown'}</td><td className="p-3">{r.vpn_status==='yes'?'VPN':r.vpn_status==='no'?'No VPN':'Unknown'}</td></tr>)}</tbody></table></div>
  </TabsContent>)}
 </Tabs></>;
}
const HISTORY_PAGE = CONNECTION_HISTORY_PAGE_SIZE;
/** Every full-screen connection, newest first: 5 per page with numbered pages. */
function ConnectionHistory({ userId, day, buffers }: { userId: string; day: string; buffers: { device_id: string; content_name: string; stall_ms: number; occurred_at: string; reconnected: boolean }[] }) {
 const [page, setPage] = useState(0);
 const { data, isError } = useQuery({ queryKey: ['player-connection-sessions', userId, day, page], refetchInterval: 15000, queryFn: async () => {
  const { from, to } = connectionDayRange(day);
  const r = await supabase.from('player_connection_sessions').select('*', { count: 'exact' }).eq('user_id', userId).gte('started_at', from).lt('started_at', to).order('started_at', { ascending: false }).range(page * HISTORY_PAGE, page * HISTORY_PAGE + HISTORY_PAGE - 1);
  if (r.error) throw new Error('Could not load connection history.');
  return { rows: r.data ?? [], count: r.count ?? 0 };
 } });
 const pages = Math.max(1, Math.ceil((data?.count ?? 0) / HISTORY_PAGE));
 const t = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
 return <div className="space-y-2 border-b border-border py-3">
  <h3 className="text-sm font-semibold">Full-screen connections · newest first</h3>
  {isError ? <p role="alert" className="text-sm text-destructive">Could not load connection history.</p> : !data?.rows.length ? <p className="text-sm text-muted-foreground">{data ? 'No full-screen connections recorded on this day.' : 'Loading…'}</p> :
  <ul className="space-y-2">{data.rows.map(r => {
    const from = Date.parse(r.started_at), to = Date.parse(r.last_seen_at) + 60000;
   const ev = buffers.filter(b => b.device_id === r.device_id && b.content_name === r.title && Date.parse(b.occurred_at) >= from && Date.parse(b.occurred_at) <= to);
   const recon = ev.filter(e => e.reconnected).length;
   const rel: Strength = recon >= 3 ? { level: 'very_weak', bars: 1, label: '' } : ev.length >= 3 || recon >= 2 ? { level: 'weak', bars: 2, label: '' } : ev.length ? { level: 'ok', bars: 3, label: '' } : { level: 'strong', bars: 4, label: '' };
   const rating = channelLinkRating(r.ping_last, rel);
   return <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-2">
    <Pill label="Started · UK">{t(r.started_at)}</Pill>
    <Pill strong><span className="break-words">{r.title}</span><span className="text-muted-foreground">· {r.kind}</span></Pill>
    <Pill label="Channel connection" strong>{rating ?? 'No ping'}</Pill>
    <Pill label="Ping">{r.ping_last != null ? `${r.ping_last} ms` : '—'}{r.ping_min != null && r.ping_max != null && <span className="text-muted-foreground"> (low–high {r.ping_min}–{r.ping_max} ms)</span>}</Pill>
    <Pill label="Download">{r.speed_last_kbps ? mbps(r.speed_last_kbps) : '—'}</Pill>
    <Pill label="Buffering">{ev.length ? `${ev.length}×` : 'None'}</Pill>
    <Pill label="Device / login">{r.login || '—'}</Pill>
   </li>; })}</ul>}
  {pages > 1 && <nav className="flex flex-wrap gap-1" aria-label="Connection history pages">{Array.from({ length: pages }, (_, i) => <Button key={i} type="button" size="sm" variant={i === page ? 'default' : 'outline'} onClick={() => setPage(i)} aria-current={i === page ? 'page' : undefined} className="min-w-8">{i + 1}</Button>)}</nav>}
 </div>;
}
