import { useEffect, useState } from "react";
import { Link2 } from "lucide-react";

type Meta = {
  host: string;
  title: string | null;
  description: string | null;
  image: string | null;
};

const cache = new Map<string, Meta>();

export function LinkPreviewCard({ url, title }: { url: string; title?: string }) {
  const [meta, setMeta] = useState<Meta | null>(() => cache.get(url) ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (meta) return;
    let cancelled = false;
    fetch(`/api/public/link-preview?url=${encodeURIComponent(url)}`)
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as Meta | null;
        if (cancelled) return;
        if (res.ok && json) {
          cache.set(url, json);
          setMeta(json);
        } else {
          setFailed(true);
        }
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [url, meta]);

  let host = "";
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { host = url; }
  const m = meta;
  const fallbackTitle = title || m?.title || titleFromUrl(url) || host;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="not-prose my-3 flex max-w-[640px] overflow-hidden rounded-lg border border-border bg-card text-card-foreground no-underline shadow-sm transition-colors hover:bg-accent"
    >
      {m?.image ? (
        <img
          src={m.image}
          alt=""
          className="hidden sm:block h-auto w-40 shrink-0 object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
      ) : null}
      <div className="min-w-0 flex-1 p-3.5">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
          <Link2 className="size-3" />
          <span className="truncate">{m?.host ?? host}</span>
        </div>
        <div className="mt-1 font-semibold leading-snug text-foreground line-clamp-2">
          {fallbackTitle}
        </div>
        {m?.description ? (
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{m.description}</p>
        ) : !failed && !m ? (
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">Loading link details…</p>
        ) : null}
      </div>
    </a>
  );
}

function titleFromUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    const last = url.pathname.split("/").filter(Boolean).pop();
    if (!last) return null;
    return last.replace(/[-_]+/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase()).slice(0, 120);
  } catch {
    return null;
  }
}