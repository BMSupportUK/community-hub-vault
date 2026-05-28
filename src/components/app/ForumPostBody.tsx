import { useEffect, useMemo, useRef, useState, Fragment } from "react";
import { sanitizeRichHtml } from "@/lib/sanitize-html";
import { useLoadSocialEmbeds, embedSocialUrls } from "@/lib/forum-embeds";

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
  // a local, defensive renderer — no widgets.js, no SSR package import, no
  // disappearing iframe.
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
          <XPostEmbed key={`t-${i}-${seg.id}`} id={seg.id} url={seg.url} />
        ) : (
          <Fragment key={`h-${i}`}>
            <div dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(seg.html) }} />
          </Fragment>
        ),
      )}
    </div>
  );
}

type Segment = { type: "html"; html: string } | { type: "tweet"; id: string; url: string };

function splitTweetSegments(html: string): Segment[] {
  const re = /<div\b([^>]*)\bdata-tweet-embed=["']([^"']+)["'][^>]*>\s*<\/div>/gi;
  const out: Segment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m.index > last) out.push({ type: "html", html: html.slice(last, m.index) });
    const attrs = m[0];
    const url = attrs.match(/\bdata-tweet-url=["']([^"']+)["']/i)?.[1] ?? `https://x.com/i/status/${m[2]}`;
    out.push({ type: "tweet", id: m[2], url });
    last = m.index + m[0].length;
  }
  if (last < html.length) out.push({ type: "html", html: html.slice(last) });
  return out.length ? out : [{ type: "html", html }];
}

type TweetApiUser = {
  name?: string;
  screen_name?: string;
  profile_image_url_https?: string;
  is_blue_verified?: boolean;
  verified?: boolean;
};

type TweetApiData = {
  text?: string;
  created_at?: string;
  favorite_count?: number;
  conversation_count?: number;
  user?: TweetApiUser;
  photos?: { url?: string; expandedUrl?: string }[];
  mediaDetails?: { media_url_https?: string; type?: string; expanded_url?: string }[];
  entities?: { urls?: { url?: string; expanded_url?: string; display_url?: string }[] };
};

function XPostEmbed({ id, url }: { id: string; url: string }) {
  const [tweet, setTweet] = useState<TweetApiData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setTweet(null);
    setFailed(false);

    fetch(`https://react-tweet.vercel.app/api/tweet/${encodeURIComponent(id)}`)
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as { data?: TweetApiData | null } | null;
        if (!cancelled) {
          if (res.ok && json?.data) setTweet(json.data);
          else setFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const href = normalizeXUrl(url, id);
  const user = tweet?.user;
  const handle = user?.screen_name ? `@${user.screen_name}` : "X post";
  const media = tweet ? getTweetMedia(tweet) : [];

  return (
    <article className="my-3 max-w-[540px] rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm">
      <a href={href} target="_blank" rel="noopener noreferrer" className="not-prose block no-underline">
        <div className="flex items-start gap-3">
          {user?.profile_image_url_https ? (
            <img
              src={user.profile_image_url_https}
              alt=""
              className="size-10 shrink-0 rounded-full border border-border"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-sm font-bold text-muted-foreground">
              X
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-semibold text-foreground">{user?.name ?? "View post on X"}</span>
              {(user?.is_blue_verified || user?.verified) && <span className="text-primary">✓</span>}
            </div>
            <div className="truncate text-sm text-muted-foreground">{handle}</div>
          </div>
          <span className="shrink-0 text-lg font-bold text-foreground">𝕏</span>
        </div>

        {tweet?.text ? (
          <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">{formatTweetText(tweet)}</p>
        ) : (
          <div className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {failed ? "X could not provide a preview for this post." : "Loading X post preview…"}
          </div>
        )}

        {media.length > 0 && (
          <div className={`mt-3 grid gap-1 overflow-hidden rounded-md border border-border ${media.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
            {media.slice(0, 4).map((item, index) => (
              <img
                key={`${item}-${index}`}
                src={item}
                alt="X post media"
                className="aspect-video h-full w-full object-cover"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {tweet?.created_at && <span>{formatTweetDate(tweet.created_at)}</span>}
          {typeof tweet?.favorite_count === "number" && <span>{compactNumber(tweet.favorite_count)} likes</span>}
          {typeof tweet?.conversation_count === "number" && <span>{compactNumber(tweet.conversation_count)} replies</span>}
          <span className="font-medium text-primary">Open on X</span>
        </div>
      </a>
    </article>
  );
}

function normalizeXUrl(url: string, id: string) {
  const safeUrl = url || `https://x.com/i/status/${id}`;
  return safeUrl.replace(/^http:/i, "https:").replace(/^https:\/\/twitter\.com/i, "https://x.com");
}

function getTweetMedia(tweet: TweetApiData): string[] {
  const photos = tweet.photos?.map((p) => p.url).filter(Boolean) as string[] | undefined;
  const media = tweet.mediaDetails
    ?.filter((m) => m.type === "photo" && m.media_url_https)
    .map((m) => m.media_url_https as string);
  return Array.from(new Set([...(photos ?? []), ...(media ?? [])]));
}

function formatTweetText(tweet: TweetApiData): string {
  let text = tweet.text ?? "";
  for (const entity of tweet.entities?.urls ?? []) {
    if (entity.url && entity.display_url) text = text.replace(entity.url, entity.display_url);
  }
  return text;
}

function formatTweetDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "X post";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}