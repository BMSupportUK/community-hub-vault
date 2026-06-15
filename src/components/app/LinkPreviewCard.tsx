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
    fetch(`/api/public/link-preview?url=${encodeURIComponent(url)}&v=2`)
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
      className="boro-link-card not-prose group/link-card my-4 flex max-w-[640px] flex-col overflow-hidden rounded-2xl border border-white/15 bg-[linear-gradient(155deg,#0b0f17_0%,#0f1522_55%,#0a0d14_100%)] !text-white !no-underline shadow-[0_18px_46px_-18px_rgba(0,0,0,0.92)] ring-1 ring-white/5 transition-all duration-200 hover:border-[#E11B22]/60 hover:shadow-[0_22px_56px_-18px_rgba(225,27,34,0.55)] sm:flex-row"
    >
      {m?.image ? (
        <img
          src={m.image}
          alt=""
          className="h-44 w-full shrink-0 object-cover sm:h-auto sm:w-44"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
      ) : null}
      <div className="min-w-0 flex-1 p-4">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide !text-white/60">
          <Link2 className="size-3" />
          <span className="truncate">{m?.host ?? host}</span>
        </div>
        <div className="mt-1.5 text-[15px] font-bold leading-snug !text-white line-clamp-2">
          {fallbackTitle}
        </div>
        {m?.description ? (
          <p className="mt-1.5 text-sm !text-white/75 line-clamp-2">{m.description}</p>
        ) : !failed && !m ? (
          <p className="mt-1.5 text-sm !text-white/55 line-clamp-2">Loading link details…</p>
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