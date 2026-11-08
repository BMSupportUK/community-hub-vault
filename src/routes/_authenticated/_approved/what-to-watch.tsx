import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { queryOptions, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Popcorn, Star, Calendar, Tv, RefreshCw } from 'lucide-react';
import { getWatchPlaylist, getWatchDescription } from '@/lib/watch-playlist.functions';
import type { WatchTitle } from '@/lib/watch-playlist';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import whatToWatchBg from '@/assets/what-to-watch-bg.jpg.asset.json';

const watchQuery = queryOptions({ queryKey: ['watch-playlist'], queryFn: () => getWatchPlaylist(), staleTime: 60 * 60_000 });
export const Route = createFileRoute('/_authenticated/_approved/what-to-watch')({
  head: () => ({ meta: [
    { title: 'What to Watch Now — BM Support' },
    { name: 'description', content: 'Cinema films and Recommended series from the BM playlist, with posters, ratings and descriptions.' },
    { property: 'og:title', content: 'What to Watch Now — BM Support' },
    { property: 'og:description', content: 'Browse Cinema films and Recommended series from the BM playlist.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' },
    { property: 'og:image', content: whatToWatchBg.url }, { name: 'twitter:image', content: whatToWatchBg.url },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(watchQuery),
  component: WhatToWatchPage,
});
function WhatToWatchPage() {
  const [selected, setSelected] = useState<WatchTitle | null>(null);
  const { data, refetch, isFetching } = useSuspenseQuery(watchQuery);
  return (
    <div className="flex-1 min-w-0 overflow-y-auto bg-background bg-cover bg-center bg-fixed relative" style={{ backgroundImage: `url(${whatToWatchBg.url})` }}>
      <div className="absolute inset-0 bg-background/75 pointer-events-none" aria-hidden />
      <main className="relative max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-6">
        <header className="flex items-center gap-3"><Popcorn className="size-7 text-primary-glow shrink-0" /><h1 className="font-display text-3xl font-bold">What to watch now</h1></header>
        <Tabs defaultValue="movies" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="movies" className="gap-2"><Popcorn className="size-4" />Cinema films</TabsTrigger>
            <TabsTrigger value="series" className="gap-2"><Tv className="size-4" />Recommended series</TabsTrigger>
          </TabsList>
          {data.error && <div role="alert" className="mt-6 border border-destructive/40 bg-background/90 p-4 rounded-lg"><p className="text-sm">{data.error}</p><Button variant="outline" className="mt-3" disabled={isFetching} onClick={() => refetch()}><RefreshCw className="size-4" />Try again</Button></div>}
          <TabsContent value="movies" className="mt-6"><Grid items={data.movies} onPick={setSelected} /></TabsContent>
          <TabsContent value="series" className="mt-6"><Grid items={data.series} onPick={setSelected} /></TabsContent>
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
function TitleDetails({ item }: { item: WatchTitle }) {
  const describe = useServerFn(getWatchDescription);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['watch-description', item.kind, item.id],
    queryFn: () => describe({ data: { kind: item.kind, id: item.id } }),
    enabled: !item.overview, staleTime: 60 * 60_000,
  });
  return <div className="grid grid-cols-[100px_minmax(0,1fr)] sm:grid-cols-[150px_minmax(0,1fr)] gap-5">
    {item.posterUrl ? <img src={item.posterUrl} alt={item.title} className="w-full aspect-[2/3] object-cover rounded-lg" /> : <Popcorn className="size-12 text-muted-foreground" />}
    <div className="min-w-0 space-y-4">
      <DialogHeader><DialogTitle className="font-display text-xl sm:text-2xl break-words">{item.title}{item.year ? ` (${item.year})` : ''}</DialogTitle>
        <DialogDescription className="inline-flex items-center gap-1"><Star className="size-4 text-primary-glow" />{item.rating === null ? 'Not rated' : `${item.rating.toFixed(1)} / 10`}</DialogDescription>
      </DialogHeader>
      {isLoading ? <div aria-label="Loading description" className="space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /></div> : <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{item.overview || data?.overview || data?.error || 'No description available.'}</p>}
      {data?.error && <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="size-4" />Try again</Button>}
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
      <div className="p-3 space-y-1"><div className="font-medium text-sm line-clamp-2 min-h-10">{item.title}</div><div className="text-xs text-muted-foreground inline-flex items-center gap-1 h-4">{item.year && <><Calendar className="size-3" />{item.year}</>}</div></div>
    </Button>)}
  </div>;
}
