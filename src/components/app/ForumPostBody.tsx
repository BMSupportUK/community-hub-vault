import { useMemo, useRef, Fragment, lazy, Suspense } from "react";
import { sanitizeRichHtml } from "@/lib/sanitize-html";
import { useLoadSocialEmbeds, embedSocialUrls } from "@/lib/forum-embeds";

// Lazy-load react-tweet on the client only. Its package "react-server"
// export condition resolves to an RSC build on some SSR runtimes (e.g.
// the Cloudflare Worker the app SSRs in), which throws "n is not iterable"
// at module init and takes down the whole page — even on routes that don't
// render any tweets.
const Tweet = lazy(() =>
  import("react-tweet").then((m) => ({ default: m.Tweet })),
);

/**
 * Renders forum post HTML safely. Legacy plain-text posts (no `<` in the body)
 * fall back to a whitespace-pre-wrap block with the original `> ` quote
 * convention preserved visually.
 */
export function ForumPostBody({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // Re-run embed conversion at render time so posts saved before the X/FB
  // URL detector was fixed (e.g. URLs ending in `?s=20`) still hydrate into
  // proper embeds without requiring the author to edit & re-save.
  const processed = useMemo(() => embedSocialUrls(html), [html]);
  // Split processed HTML around tweet markers so we can render <Tweet/> via
  // react-tweet (server-rendered via X's syndication API — no widgets.js,
  // no disappearing iframe).
  const segments = useMemo(() => splitTweetSegments(processed), [processed]);
  useLoadSocialEmbeds(ref, [processed]);

  const looksLikeHtml = /<[a-z][\s\S]*>/i.test(processed);
  if (!looksLikeHtml) {
    return (
      <div ref={ref} className={`text-[15px] leading-relaxed whitespace-pre-wrap break-words text-foreground/90 ${className ?? ""}`}>
        {processed.split("\n").map((line, i) =>
          line.startsWith("> ") ? (
            <div key={i} className="border-l-3 border-primary/70 pl-4 italic text-muted-foreground my-1.5 bg-primary/5 py-1 pr-2 rounded-r">
              {line.slice(2)}
            </div>
          ) : (
            <div key={i}>{line || "\u00A0"}</div>
          ),
        )}
      </div>
    );
  }

  const wrapperClass = `prose dark:prose-invert max-w-none break-words text-[15px] leading-relaxed text-foreground/90 [&_.video-embed]:!w-full [&_.video-embed]:!max-w-none [&_.video-embed]:!my-3 [&_.video-embed]:!mx-0 [&_blockquote]:border-l-4 [&_blockquote]:border-primary/70 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_blockquote]:bg-primary/5 [&_blockquote]:py-2.5 [&_blockquote]:rounded-r [&_blockquote]:my-2 [&_a]:text-primary [&_a]:underline [&_a]:font-medium [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded-md [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_p]:my-2 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:my-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:my-2.5 [&_.mention]:inline-flex [&_.mention]:items-center [&_.mention]:rounded-md [&_.mention]:px-1.5 [&_.mention]:py-0.5 [&_.mention]:font-semibold [&_.mention]:text-[#E11B22] [&_.mention]:bg-[#E11B22]/10 [&_.mention]:no-underline [&_.mention[data-mention-type=special]]:text-[#F4B400] [&_.mention[data-mention-type=special]]:bg-[#F4B400]/15 ${className ?? ""}`;

  return (
    <div ref={ref} className={wrapperClass}>
      {segments.map((seg, i) =>
        seg.type === "tweet" ? (
          <div key={`t-${i}-${seg.id}`} className="my-3 flex justify-center [&_.react-tweet-theme]:!my-0" data-theme="dark">
            <Suspense fallback={<div className="text-xs text-muted-foreground">Loading tweet…</div>}>
              <Tweet id={seg.id} />
            </Suspense>
          </div>
        ) : (
          <Fragment key={`h-${i}`}>
            <div dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(seg.html) }} />
          </Fragment>
        ),
      )}
    </div>
  );
}

type Segment = { type: "html"; html: string } | { type: "tweet"; id: string };

function splitTweetSegments(html: string): Segment[] {
  const re = /<div\b[^>]*\bdata-tweet-embed=["']([^"']+)["'][^>]*>\s*<\/div>/gi;
  const out: Segment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m.index > last) out.push({ type: "html", html: html.slice(last, m.index) });
    out.push({ type: "tweet", id: m[1] });
    last = m.index + m[0].length;
  }
  if (last < html.length) out.push({ type: "html", html: html.slice(last) });
  return out.length ? out : [{ type: "html", html }];
}