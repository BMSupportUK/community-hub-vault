import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search, Sparkles } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { searchGifs, type GifResult } from "@/lib/giphy.functions";

type Props = {
  onSelect: (url: string) => void;
  disabled?: boolean;
};

/**
 * Discord-style GIF picker powered by Giphy.
 * Shows trending on open, debounced search as you type.
 */
export function GifPicker({ onSelect, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchGifs = useServerFn(searchGifs);
  const reqId = useRef(0);

  useEffect(() => {
    if (!open) return;
    const my = ++reqId.current;
    setLoading(true);
    setError(null);
    const t = setTimeout(async () => {
      try {
        const res = await fetchGifs({ data: { q: q.trim() || undefined, limit: 24 } });
        if (my !== reqId.current) return;
        setResults(res.results);
        setError(res.error);
      } catch (e) {
        if (my !== reqId.current) return;
        setError("Failed to load GIFs");
      } finally {
        if (my === reqId.current) setLoading(false);
      }
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, open, fetchGifs]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          title="Send a GIF"
          className="size-8 rounded-lg bg-surface-2 border border-border text-muted-foreground hover:text-foreground hover:bg-surface-2/70 grid place-items-center disabled:opacity-50 text-[10px] font-bold tracking-wider"
        >
          GIF
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        className="w-[360px] max-w-[92vw] p-0 overflow-hidden"
      >
        <div className="px-3 py-2 border-b border-border bg-muted/30">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search GIPHY"
              className="w-full bg-background border border-border rounded-md pl-7 pr-2 py-1.5 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
            {q.trim() ? null : <Sparkles className="size-3" />}
            <span>{q.trim() ? `Results for "${q.trim()}"` : "Trending now"}</span>
            <span className="ml-auto">Powered by GIPHY</span>
          </div>
        </div>
        <div className="h-80 overflow-y-auto p-2">
          {loading && results.length === 0 ? (
            <div className="h-full grid place-items-center text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : error ? (
            <div className="h-full grid place-items-center text-sm text-destructive text-center px-4">
              {error}
            </div>
          ) : results.length === 0 ? (
            <div className="h-full grid place-items-center text-sm text-muted-foreground">
              No GIFs found
            </div>
          ) : (
            <div className="columns-2 gap-2 [&>*]:mb-2">
              {results.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => {
                    onSelect(g.url);
                    setOpen(false);
                    setQ("");
                  }}
                  className="block w-full overflow-hidden rounded-md border border-border hover:border-primary focus:border-primary outline-none transition-colors"
                >
                  <img
                    src={g.preview}
                    alt={g.title}
                    loading="lazy"
                    className="w-full h-auto block"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

const GIF_HOSTS = /^(https?:\/\/)(media\d*\.giphy\.com|i\.giphy\.com|media\.tenor\.com|tenor\.com|c\.tenor\.com)\//i;

/**
 * Returns the GIF URL if `content` is just a single GIF link (optionally
 * with surrounding whitespace). Used to render embedded GIFs inline.
 */
export function extractStandaloneGif(content: string): string | null {
  const trimmed = content.trim();
  if (!trimmed.includes(" ") && !trimmed.includes("\n")) {
    if (GIF_HOSTS.test(trimmed) || /\.gif(\?.*)?$/i.test(trimmed)) {
      return trimmed;
    }
  }
  return null;
}