import { createFileRoute } from '@tanstack/react-router';
import { useState, useRef, useLayoutEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Popcorn, Star, Calendar, Tv, RefreshCw } from 'lucide-react';
import { getWatchPlaylist, getWatchDescription } from '@/lib/watch-playlist.functions';
import type { WatchTitle } from '@/lib/watch-playlist';
import { getNewSeries } from '@/lib/new-series.functions';
import { MONTH_NAMES } from '@/lib/new-series';
import type { NewSeries } from '@/lib/new-series';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SendToBoxButton } from '@/components/watch/SendToBoxButton';
import whatToWatchBg from '@/assets/what-to-watch-bg.jpg.asset.json';

export const Route = createFileRoute('/_authenticated/_approved/what-to-watch')({
  head: () => ({ meta: [
    { title: 'What to Watch Now — BM Support' },
    { name: 'description', content: 'Cinema films, playlist picks and brand-new recommended series grouped by premiere month for the current year.' },
    { property: 'og:title', content: 'What to Watch Now — BM Support' },
    { property: 'og:description', content: 'Browse BM playlist picks and this year’s new series by premiere month, with posters, ratings and descriptions.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' },
    { property: 'og:image', content: whatToWatchBg.url }, { name: 'twitter:image', content: whatToWatchBg.url },
  ] }),
  component: WhatToWatchPage,
});
function WhatToWatchPage() {
  const [selected, setSelected] = useState<WatchTitle | NewSeries | null>(null);
  const [tab, setTab] = useState('movies');
  const pageRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { pageRef.current?.scrollTo({ top: 0, behavior: 'instant' }); }, [tab]);
  const fetchPlaylist = useServerFn(getWatchPlaylist);
  const { data, refetch, isFetching, isLoading, isError } = useQuery({ queryKey: ['watch-playlist'], queryFn: () => fetchPlaylist(), staleTime: 60 * 60_000 });
  return (
    <div ref={pageRef} className="flex-1 min-w-0 overflow-y-auto bg-background bg-cover bg-center bg-fixed relative" style={{ backgroundImage: `url(${whatToWatchBg.url})` }}>
      <div className="absolute inset-0 bg-background/75 pointer-events-none" aria-hidden />
      <main className="relative max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-6">
        <header className="flex items-center gap-3"><Popcorn className="size-7 text-primary-glow shrink-0" /><h1 className="font-display text-3xl font-bold">What to watch now</h1></header>
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid w-full max-w-2xl grid-cols-3 h-auto">
            <TabsTrigger value="movies" className="gap-2 min-w-0 whitespace-normal text-center px-2 text-xs sm:text-sm"><Popcorn className="hidden sm:block size-4 shrink-0" />Cinema films</TabsTrigger>
            <TabsTrigger value="new-series" className="gap-2 min-w-0 whitespace-normal text-center px-2 text-xs sm:text-sm"><Calendar className="hidden sm:block size-4 shrink-0" />New series</TabsTrigger>
            <TabsTrigger value="series" className="gap-2 min-w-0 whitespace-normal text-center px-2 text-xs sm:text-sm"><Tv className="hidden sm:block size-4 shrink-0" />Recommended series</TabsTrigger>
          </TabsList>
          {(data?.error || isError) && tab !== 'new-series' && <div role="alert" className="mt-6 border border-destructive/40 bg-background/90 p-4 rounded-lg"><p className="text-sm">{data?.error || 'Could not load the playlist. Please try again.'}</p><Button variant="outline" className="mt-3" disabled={isFetching} onClick={() => refetch()}><RefreshCw className="size-4" />Try again</Button></div>}
          {isLoading && tab !== 'new-series' && <div aria-label="Loading playlist" className="mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">{Array.from({length:10}, (_,i) => <Skeleton key={i} className="aspect-[2/3] rounded-lg" />)}</div>}
          <TabsContent value="movies" className="mt-6">{!isLoading && <Grid items={data?.movies ?? []} onPick={setSelected} />}</TabsContent>
          <TabsContent value="series" className="mt-6">{!isLoading && <Grid items={data?.series ?? []} onPick={setSelected} />}</TabsContent>
          <TabsContent value="new-series" className="mt-6"><NewSeriesSection onPick={setSelected} /></TabsContent>
        </Tabs>
      </main>
      <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}>
        <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto p-6">
          {selected && <TitleDetails key={`${selected.kind}-${selected.id}`} item={selected} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
function NewSeriesSection({ onPick }: { onPick: (item: NewSeries) => void }) {
  const fetchSeries = useServerFn(getNewSeries);
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const { data, isLoading, isError, refetch, isFetching } = useQuery({ queryKey: ['new-series', year ?? 'current'], queryFn: () => fetchSeries({ data: year ? { year } : {} }), staleTime: 6 * 60 * 60_000 });
  const pill = (active: boolean) => `h-8 rounded-full px-3 text-sm ${active ? 'bg-primary text-primary-foreground shadow-soft' : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'}`;
  const pick = (item: WatchTitle) => { if ('premiereDate' in item) onPick(item as NewSeries); };
  const chosen = month ? data?.months[month - 1] : null;
  return <div className="space-y-6">
    <header className="space-y-1"><h2 className="font-display text-2xl font-bold">New series{data ? ` · ${data.year}` : ''}</h2><p className="text-sm text-muted-foreground">First-season premieres · Rated 7+ / 10 on TMDB · Playlist availability may vary</p></header>
    {data && <div className="space-y-2">
      <nav aria-label="New series year" className="flex flex-wrap items-center gap-1 rounded-lg border border-border/70 bg-card/85 p-2 backdrop-blur-md">
        <span className="flex items-center gap-2 pr-1 text-sm font-medium"><Calendar className="size-4 text-accent" />Year</span>
        {data.years.map(y => <Button variant="ghost" key={y} className={pill(y === data.year)} aria-pressed={y === data.year} onClick={() => { setYear(y); setMonth(null); }}>{y}</Button>)}
      </nav>
      <nav aria-label="New series month" className="flex flex-wrap items-center gap-1 rounded-lg border border-border/70 bg-card/85 p-2 backdrop-blur-md">
        <span className="flex items-center gap-2 pr-1 text-sm font-medium"><Calendar className="size-4 text-accent" />Month</span>
        <Button variant="ghost" className={pill(month === null)} aria-pressed={month === null} onClick={() => setMonth(null)}>All months</Button>
        {MONTH_NAMES.map((name, index) => { const value = index + 1; return <Button variant="ghost" key={name} className={pill(month === value)} aria-pressed={month === value} disabled={data.year === data.currentYear && value > data.currentMonth} onClick={() => setMonth(value)}>{name}</Button>; })}
      </nav>
    </div>}
    {isLoading && <div aria-label="Loading new series" className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">{Array.from({length:10}, (_,i) => <Skeleton key={i} className="aspect-[2/3] rounded-lg" />)}</div>}
    {(isError || data?.error) && <div role="alert" className="space-y-3"><p className="text-sm">{data?.error || 'Could not load new series.'}</p><Button variant="outline" disabled={isFetching} onClick={() => refetch()}><RefreshCw className="size-4" />Try again</Button></div>}
    {data && !data.error && month === null && data.months.map(group => <section key={group.month} aria-label={`${group.name} ${data.year}`} className="space-y-4 border-t border-border pt-5">
      <h3 className="font-display text-xl font-semibold">{group.name} <span className="text-muted-foreground text-sm font-normal">{data.year}{group.items.length ? ` · ${group.items.length} series` : ''}</span></h3>
      {group.items.length ? <Grid items={group.items} onPick={pick} /> : <p className="text-sm text-muted-foreground">No rated new-series picks yet.</p>}
    </section>)}
    {data && !data.error && month !== null && <section aria-label={`${MONTH_NAMES[month - 1]} ${data.year}`} className="space-y-4 border-t border-border pt-5">
      <h3 className="font-display text-xl font-semibold">{MONTH_NAMES[month - 1]} <span className="text-muted-foreground text-sm font-normal">{data.year}{chosen?.items.length ? ` · ${chosen.items.length} series` : ''}</span></h3>
      {chosen?.items.length ? <Grid items={chosen.items} onPick={pick} /> : <p className="text-sm text-muted-foreground">No rated new-series picks yet.</p>}
    </section>}
    <p className="text-xs text-muted-foreground">Ratings and premiere dates: TMDB. This section is not endorsed or certified by TMDB.</p>
  </div>;
}
function TitleDetails({ item }: { item: WatchTitle | NewSeries }) {
  const describe = useServerFn(getWatchDescription);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['watch-description', 'premiereDate' in item ? 'discovery' : 'playlist', item.kind, item.id],
    queryFn: () => describe({ data: { kind: item.kind, id: item.id } }),
    enabled: !item.overview && !('premiereDate' in item), staleTime: 60 * 60_000,
  });
  return <div className="grid grid-cols-[100px_minmax(0,1fr)] sm:grid-cols-[150px_minmax(0,1fr)] gap-5">
    {item.posterUrl ? <img src={item.posterUrl} alt={item.title} className="w-full aspect-[2/3] object-cover rounded-lg" /> : <Popcorn className="size-12 text-muted-foreground" />}
    <div className="min-w-0 space-y-4">
      <DialogHeader><DialogTitle className="font-display text-xl sm:text-2xl break-words">{item.title}{item.year ? ` (${item.year})` : ''}</DialogTitle>
        <DialogDescription className="inline-flex items-center gap-1"><Star className="size-4 text-primary-glow" />{item.rating === null ? 'Not rated' : `${item.rating.toFixed(1)} / 10`}</DialogDescription>
      </DialogHeader>
      {'premiereDate' in item && <p className="text-xs text-muted-foreground">Premiered {new Date(`${item.premiereDate}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</p>}
      {isLoading ? <div aria-label="Loading description" className="space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /></div> : <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{item.overview || data?.overview || data?.error || 'No description available.'}</p>}
      {data?.error && <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="size-4" />Try again</Button>}
      <SendToBoxButton kind={item.kind} itemId={'premiereDate' in item ? null : item.id} title={item.title} />
    </div>
  </div>;
}
function Grid({ items, onPick }: { items: WatchTitle[]; onPick: (item: WatchTitle) => void }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">No titles are available in this playlist section.</p>;
  return <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
    {items.map(item => <Button key={`${item.kind}-${item.id}`} variant="ghost" aria-label={`View description for ${item.title}`} onClick={() => onPick(item)} className="group block h-auto min-w-0 whitespace-normal p-0 text-left rounded-lg overflow-hidden border border-border bg-card hover:bg-card hover:border-primary hover:shadow-glow">
      <div className="relative aspect-[2/3] bg-surface-2 overflow-hidden">
        {item.posterUrl ? <img src={item.posterUrl} alt={item.title} loading="lazy" className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500 motion-reduce:transition-none" /> : <div className="h-full flex items-center justify-center"><Popcorn className="size-8 text-muted-foreground" /></div>}
        <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-background/90 text-foreground text-xs"><Star className="size-3 text-primary-glow" />{item.rating === null ? 'Not rated' : item.rating.toFixed(1)}</span>
      </div>
      <div className="p-3 space-y-1"><div className="font-medium text-sm line-clamp-2 min-h-10">{item.title}</div><div className="text-xs text-muted-foreground inline-flex items-center gap-1 h-4">{item.year && <><Calendar className="size-3" />{'premiereDate' in item ? new Date(`${item.premiereDate}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : item.year}</>}</div></div>
    </Button>)}
  </div>;
}
