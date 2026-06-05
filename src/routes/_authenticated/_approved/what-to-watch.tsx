import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Popcorn, Star, ExternalLink, Calendar, Flame } from "lucide-react";
import { getTrending, type TmdbItem } from "@/lib/tmdb.functions";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/_approved/what-to-watch")({
  head: () => ({
    meta: [
      { title: "What to Watch — BM Support" },
      { name: "description", content: "Trending movies and series to watch right now, powered by TMDB." },
    ],
  }),
  component: WhatToWatchPage,
});

function WhatToWatchPage() {
  const [window, setWindow] = useState<"day" | "week">("week");
  const [selected, setSelected] = useState<TmdbItem | null>(null);
  const fetchTrending = useServerFn(getTrending);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["tmdb-trending", window],
    queryFn: () => fetchTrending({ data: { window } }),
    staleTime: 60 * 60 * 1000,
  });

  return (
    <div className="flex-1 flex min-w-0">
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-6">
          <header className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/20 via-surface-2 to-background p-6 lg:p-10">
            <div className="absolute -top-16 -right-16 size-72 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/15 text-primary-glow text-xs font-medium mb-3">
                <Popcorn className="size-3.5" /> What to Watch
              </div>
              <h1 className="font-display text-3xl lg:text-5xl font-bold tracking-tight">
                Trending right now
              </h1>
              <p className="mt-3 text-muted-foreground text-base lg:text-lg max-w-2xl">
                The most-watched movies and series across the world this {window === "day" ? "day" : "week"}, refreshed live from TMDB.
              </p>
              <div className="mt-5 inline-flex rounded-xl border border-border bg-surface-2 p-1">
                <button
                  onClick={() => setWindow("day")}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${window === "day" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Today
                </button>
                <button
                  onClick={() => setWindow("week")}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${window === "week" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  This week
                </button>
              </div>
            </div>
          </header>

          {isError || data?.error ? (
            <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-6 text-sm">
              Couldn't load trending titles{data?.error ? `: ${data.error}` : "."}
            </div>
          ) : null}

          <Tabs defaultValue="movies" className="w-full">
            <TabsList className="grid w-full max-w-sm grid-cols-2">
              <TabsTrigger value="movies">Movies</TabsTrigger>
              <TabsTrigger value="series">Series</TabsTrigger>
            </TabsList>
            <TabsContent value="movies" className="mt-6">
              <Grid items={data?.movies ?? []} loading={isLoading} onPick={setSelected} />
            </TabsContent>
            <TabsContent value="series" className="mt-6">
              <Grid items={data?.tv ?? []} loading={isLoading} onPick={setSelected} />
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl overflow-hidden p-0">
          {selected && (
            <>
              {selected.backdropUrl && (
                <div className="relative h-48 w-full overflow-hidden">
                  <img src={selected.backdropUrl} alt="" className="h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
                </div>
              )}
              <div className="p-6 space-y-4">
                <DialogHeader>
                  <DialogTitle className="font-display text-2xl">{selected.title}{selected.year ? ` (${selected.year})` : ""}</DialogTitle>
                  <DialogDescription className="flex items-center gap-3 text-xs">
                    <span className="inline-flex items-center gap-1"><Star className="size-3.5 text-amber-400" /> {selected.rating} · {selected.voteCount.toLocaleString()} votes</span>
                    <span className="inline-flex items-center gap-1"><Flame className="size-3.5 text-primary-glow" /> Trending {window === "day" ? "today" : "this week"}</span>
                  </DialogDescription>
                </DialogHeader>
                <p className="text-sm text-muted-foreground leading-relaxed">{selected.overview || "No overview available."}</p>
                <Button asChild variant="secondary" className="gap-2">
                  <a href={selected.tmdbUrl} target="_blank" rel="noreferrer">
                    View on TMDB <ExternalLink className="size-4" />
                  </a>
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Grid({ items, loading, onPick }: { items: TmdbItem[]; loading: boolean; onPick: (i: TmdbItem) => void }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[2/3] rounded-xl" />
        ))}
      </div>
    );
  }
  if (!items.length) {
    return <p className="text-sm text-muted-foreground">Nothing to show yet.</p>;
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {items.map((item) => (
        <button
          key={`${item.kind}-${item.id}`}
          onClick={() => onPick(item)}
          className="group text-left rounded-xl overflow-hidden border border-border bg-card hover:border-primary/60 hover:shadow-glow transition-all"
        >
          <div className="relative aspect-[2/3] bg-surface-2 overflow-hidden">
            {item.posterUrl ? (
              <img
                src={item.posterUrl}
                alt={item.title}
                loading="lazy"
                className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                <Popcorn className="size-8" />
              </div>
            )}
            <div className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-background/80 backdrop-blur text-[11px] font-medium">
              <Star className="size-3 text-amber-400" /> {item.rating.toFixed(1)}
            </div>
          </div>
          <div className="p-3 space-y-1">
            <div className="font-medium text-sm line-clamp-1">{item.title}</div>
            {item.year && (
              <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <Calendar className="size-3" /> {item.year}
              </div>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}