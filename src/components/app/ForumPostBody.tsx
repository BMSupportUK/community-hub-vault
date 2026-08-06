import { memo, useEffect, useMemo, useRef, useState, Fragment } from "react";
import { sanitizeRichHtml } from "@/lib/sanitize-html";
import { useLoadSocialEmbeds, prepareForumPostBody } from "@/lib/forum-embeds";
import { LinkPreviewCard } from "@/components/app/LinkPreviewCard";
import { censorText, censorHtml, useProfanityWords } from "@/lib/profanity";

/**
 * Renders forum post HTML safely. Legacy plain-text posts (no `<` in the body)
 * fall back to a whitespace-pre-wrap block with the original `> ` quote
 * convention preserved visually.
 */
function ForumPostBodyComponent({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // Re-render when the profanity list finishes loading or is updated, but use
  // a stable key so expensive censoring is memoized between parent renders.
  const { words: profanityWords } = useProfanityWords();
  const profanityKey = profanityWords.join("|");
  // Re-run embed conversion at render time so posts saved before the X/FB
  // URL detector was fixed (e.g. URLs ending in `?s=20`) still hydrate into
  // proper embeds without requiring the author to edit & re-save.
  const processed = useMemo(() => getProcessedForumHtml(html), [html]);
  // Split processed HTML around tweet markers so we can render X posts via
  // a local, defensive renderer — no widgets.js, no SSR package import, no
  // disappearing iframe.
  const segments = useMemo(() => splitTweetSegments(processed), [processed]);
  useLoadSocialEmbeds(ref, [processed]);

  const looksLikeHtml = /<[a-z][\s\S]*>/i.test(processed);
  const plainLines = useMemo(() => censorText(processed).split("\n"), [processed, profanityKey]);
  const safeSegments = useMemo<RenderableSegment[]>(() => {
    if (!looksLikeHtml) return [];
    return segments.map((seg) => {
      if (seg.type !== "html") return seg;
      return { type: "html", safeHtml: getSafeForumHtml(seg.html, profanityKey) };
    });
  }, [segments, looksLikeHtml, profanityKey]);

  if (!looksLikeHtml) {
    return (
      <div ref={ref} className={`text-[15px] leading-relaxed whitespace-pre-wrap break-words text-foreground/90 ${className ?? ""}`}>
        {plainLines.map((line, i) =>
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

  const wrapperClass = `prose dark:prose-invert max-w-none break-words text-[15px] leading-relaxed text-foreground/90 [&_.video-embed]:!w-full [&_.video-embed]:!max-w-none [&_.video-embed]:!my-3 [&_.video-embed]:!mx-0 [&_blockquote]:border-l-4 [&_blockquote]:border-primary/70 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_blockquote]:bg-primary/5 [&_blockquote]:py-2.5 [&_blockquote]:rounded-r [&_blockquote]:my-2 [&_a]:text-primary [&_a]:underline [&_a]:font-medium [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded-md [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_p]:my-2 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:my-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:my-2.5 [&_.mention]:inline-flex [&_.mention]:items-center [&_.mention]:rounded-md [&_.mention]:px-1.5 [&_.mention]:py-0.5 [&_.mention]:font-semibold [&_.mention]:text-[#E11B22] [&_.mention]:bg-[#E11B22]/10 [&_.mention]:no-underline [&_.mention[data-mention-type=special]]:text-[#F4B400] [&_.mention[data-mention-type=special]]:bg-[#F4B400]/15 [&_a.link-card]:!block [&_a.link-card]:!no-underline [&_a.link-card]:!font-normal [&_a.link-card]:!text-foreground [&_a.link-card]:rounded-lg [&_a.link-card]:border [&_a.link-card]:border-border [&_a.link-card]:bg-card [&_a.link-card]:px-4 [&_a.link-card]:py-3 [&_a.link-card]:my-3 [&_a.link-card]:transition-colors [&_a.link-card:hover]:bg-accent [&_.link-card-title]:block [&_.link-card-title]:font-semibold [&_.link-card-title]:text-foreground [&_.link-card-host]:block [&_.link-card-host]:text-xs [&_.link-card-host]:text-muted-foreground [&_.link-card-host]:mt-1 ${className ?? ""}`;

  return (
    <div ref={ref} className={wrapperClass}>
      {safeSegments.map((seg, i) =>
        seg.type === "tweet" ? (
          <XPostEmbed key={`t-${i}-${seg.id}`} id={seg.id} url={seg.url} />
        ) : seg.type === "link" ? (
          <LinkPreviewCard key={`l-${i}-${seg.url}`} url={seg.url} title={seg.title} />
        ) : (
          <Fragment key={`h-${i}`}>
            <div dangerouslySetInnerHTML={{ __html: seg.safeHtml }} />
          </Fragment>
        ),
      )}
    </div>
  );
}

export const ForumPostBody = memo(ForumPostBodyComponent);

const HTML_CACHE_LIMIT = 160;
const MAX_RICH_RENDER_CHARS = 30_000;
const processedHtmlCache = new Map<string, string>();
const safeHtmlCache = new Map<string, string>();

function remember(cache: Map<string, string>, key: string, value: string) {
  cache.set(key, value);
  if (cache.size <= HTML_CACHE_LIMIT) return value;
  const first = cache.keys().next().value;
  if (typeof first === "string") cache.delete(first);
  return value;
}

function getProcessedForumHtml(raw: string): string {
  const cached = processedHtmlCache.get(raw);
  if (cached !== undefined) return cached;
  // A prepared marker only proves that an older embed pipeline handled the
  // post. Always run the current pipeline so previously saved direct video
  // links gain a player without needing the post to be edited and re-saved.
  const processed = prepareForumPostBody(raw, { skipDomParserFallback: true });
  return remember(processedHtmlCache, raw, processed);
}

function getSafeForumHtml(raw: string, profanityKey: string): string {
  if (raw.length > MAX_RICH_RENDER_CHARS) {
    return censorHtml(sanitizeRichHtml(`${raw.slice(0, MAX_RICH_RENDER_CHARS)}<p>Message shortened because the pasted content was too large.</p>`));
  }
  const key = `${profanityKey}\n${raw}`;
  const cached = safeHtmlCache.get(key);
  if (cached !== undefined) return cached;
  return remember(safeHtmlCache, key, censorHtml(sanitizeRichHtml(raw)));
}

type Segment =
  | { type: "html"; html: string }
  | { type: "tweet"; id: string; url: string }
  | { type: "link"; url: string; title?: string };

type RenderableSegment =
  | { type: "html"; safeHtml: string }
  | { type: "tweet"; id: string; url: string }
  | { type: "link"; url: string; title?: string };

function splitTweetSegments(html: string): Segment[] {
  const re = /<div\b[^>]*\b(?:data-tweet-embed=["']([^"']+)["']|data-link-preview=["']([^"']+)["'])[^>]*>[\s\S]*?<\/div>/gi;
  const out: Segment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m.index > last) out.push({ type: "html", html: html.slice(last, m.index) });
    if (m[1]) {
      const attrs = m[0];
      const url = attrs.match(/\bdata-tweet-url=["']([^"']+)["']/i)?.[1] ?? `https://x.com/i/status/${m[1]}`;
      out.push({ type: "tweet", id: m[1], url });
    } else if (m[2]) {
      const attrs = m[0];
      const title = attrs.match(/\bdata-link-title=["']([^"']+)["']/i)?.[1];
      out.push({ type: "link", url: decodeAttr(m[2]), title: title ? decodeAttr(title) : undefined });
    }
    last = m.index + m[0].length;
  }
  if (last < html.length) out.push({ type: "html", html: html.slice(last) });
  const initial = out.length ? out : [{ type: "html", html } as Segment];
  // Second pass: any html segment that is just a single standalone anchor
  // (optionally wrapped in <p>) becomes a link preview card. This is a
  // belt-and-braces fallback in case the upstream marker insertion in
  // markLinkPreviews missed something (e.g. cached HTML, odd wrapping).
  return initial.flatMap((seg): Segment[] => {
    if (seg.type !== "html") return [seg];
    const stripped = seg.html.trim();
    if (!stripped) return [seg];
    const standalone = stripped.match(
      /^(?:<p\b[^>]*>\s*)?<a\b[^>]*\bhref=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>(?:\s*<\/p>)?$/i,
    );
    if (!standalone) return [seg];
    const href = decodeAttr(standalone[1]);
    const text = standalone[2].replace(/<[^>]+>/g, "").trim();
    // Only swap when the anchor text is empty or equals the href (i.e. a
    // bare auto-linked URL), not when the user wrote real link text.
    if (text && text.replace(/\/$/, "") !== href.replace(/\/$/, "") && !/^https?:\/\//i.test(text)) {
      return [seg];
    }
    // Skip social URLs that have their own embeds.
    if (/^https?:\/\/(?:www\.|m\.|mobile\.|web\.)?(?:twitter\.com|x\.com|facebook\.com|fb\.watch|youtube\.com|youtu\.be)\//i.test(href)) {
      return [seg];
    }
    return [{ type: "link", url: href }];
  });
}

function decodeAttr(s: string): string {
  return s
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
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
  photos?: { url?: string; expandedUrl?: string; width?: number; height?: number; accessibilityLabel?: string }[];
  mediaDetails?: { media_url_https?: string; type?: string; expanded_url?: string; ext_alt_text?: string; original_info?: { width?: number; height?: number } }[];
  entities?: { urls?: { url?: string; expanded_url?: string; display_url?: string }[] };
};

type TweetMedia = { url: string; width?: number; height?: number; alt?: string };

function XPostEmbed({ id, url }: { id: string; url: string }) {
  const fallbackRef = useRef<HTMLDivElement>(null);
  const [tweet, setTweet] = useState<TweetApiData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setTweet(null);
    setFailed(false);

    fetch(`/api/public/tweet?id=${encodeURIComponent(id)}`)
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

  useEffect(() => {
    if (!failed || !fallbackRef.current) return;
    void loadXWidgets().then(() => {
      const w = window as unknown as { twttr?: { widgets: { load: (el?: Element) => void } } };
      w.twttr?.widgets.load(fallbackRef.current ?? undefined);
    });
  }, [failed]);

  const href = normalizeXUrl(url, id);
  const user = tweet?.user;
  const handle = user?.screen_name ? `@${user.screen_name}` : "X post";
  const media = tweet ? getTweetMedia(tweet) : [];

  return (
    <article className="not-prose boro-x-embed group/x-embed relative my-4 max-w-[560px] overflow-hidden rounded-2xl border border-white/15 bg-[linear-gradient(155deg,#0b0f17_0%,#0f1522_55%,#0a0d14_100%)] p-5 text-white shadow-[0_18px_46px_-18px_rgba(0,0,0,0.92)] ring-1 ring-white/5 transition-all duration-200 hover:border-[#E11B22]/60 hover:shadow-[0_22px_56px_-18px_rgba(225,27,34,0.55)]">
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#E11B22]/70 to-transparent" />
      <span aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-44 rounded-full bg-[radial-gradient(circle,rgba(225,27,34,0.22),transparent_70%)] blur-2xl" />
      {failed && !tweet ? (
        <div ref={fallbackRef} className="not-prose">
          <blockquote className="twitter-tweet" data-dnt="true" data-theme="dark" data-lang="en">
            <a href={href}>View post on X</a>
          </blockquote>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="boro-x-action mt-2 inline-flex items-center gap-1.5 rounded-full border border-[#E11B22]/55 bg-[#E11B22]/18 px-3 py-1 text-xs font-semibold text-white no-underline shadow-[0_0_18px_rgba(225,27,34,0.22)] transition-colors hover:bg-[#E11B22]/28"
          >
            <span className="text-sm font-black leading-none">𝕏</span> Open on X
          </a>
        </div>
      ) : (
        <a href={href} target="_blank" rel="noopener noreferrer" className="not-prose relative block no-underline">
          <div className="flex items-start gap-3">
            {user?.profile_image_url_https ? (
              <img
                src={user.profile_image_url_https}
                alt=""
                className="size-11 shrink-0 rounded-full border-2 border-white/25 ring-2 ring-[#E11B22]/40"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-white/25 bg-black text-base font-black text-white ring-2 ring-[#E11B22]/40">
                𝕏
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-base font-bold text-white">{user?.name ?? "View post on X"}</span>
                {(user?.is_blue_verified || user?.verified) && <span className="text-sky-400">✓</span>}
              </div>
              <div className="boro-x-handle truncate text-sm text-white/55">{handle}</div>
            </div>
            <span className="boro-x-action flex size-9 shrink-0 items-center justify-center rounded-full border border-[#E11B22]/60 bg-[#16070a] text-lg font-black text-white shadow-[0_0_22px_rgba(225,27,34,0.28)] transition-colors group-hover/x-embed:bg-[#E11B22]/25">
              𝕏
            </span>
          </div>

          {tweet?.text ? (
            <p className="mt-4 whitespace-pre-wrap text-[16px] leading-[1.55] text-white/95">{formatTweetText(tweet)}</p>
          ) : (
            <div className="mt-4 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/60">
              {failed ? "X could not provide a preview for this post." : "Loading X post preview…"}
            </div>
          )}

          {media.length > 0 && (
            <div className={`mt-4 grid gap-1 overflow-hidden rounded-xl border border-white/15 bg-black/35 ${media.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
              {media.slice(0, 4).map((item, index) => {
                const ratio = item.width && item.height ? `${item.width} / ${item.height}` : undefined;
                return (
                  <img
                    key={`${item.url}-${index}`}
                    src={tweetMediaSrc(item.url)}
                    alt={item.alt || "X post media"}
                    className="h-auto max-h-[680px] w-full bg-black/30 object-contain"
                    style={ratio ? { aspectRatio: ratio } : undefined}
                    loading={index === 0 ? "eager" : "lazy"}
                    fetchPriority={index === 0 ? "high" : "auto"}
                    referrerPolicy="no-referrer"
                  />
                );
              })}
            </div>
          )}

        <div className="boro-x-meta mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/10 pt-3 text-xs text-white/55">
          {tweet?.created_at && <span>{formatTweetDate(tweet.created_at)}</span>}
          {typeof tweet?.favorite_count === "number" && <span>♥ {compactNumber(tweet.favorite_count)}</span>}
          {typeof tweet?.conversation_count === "number" && <span>💬 {compactNumber(tweet.conversation_count)}</span>}
          <span className="boro-x-action ml-auto inline-flex items-center gap-1 rounded-full border border-[#E11B22]/55 bg-[#E11B22]/18 px-3 py-1 text-[11px] font-bold text-white shadow-[0_0_18px_rgba(225,27,34,0.18)] transition-all group-hover/x-embed:scale-105 group-hover/x-embed:bg-[#E11B22]/28">
            Open on 𝕏
          </span>
        </div>
        </a>
      )}
    </article>
  );
}

let xWidgetsPromise: Promise<void> | null = null;
function loadXWidgets(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as unknown as { twttr?: unknown }).twttr) return Promise.resolve();
  if (xWidgetsPromise) return xWidgetsPromise;
  xWidgetsPromise = new Promise<void>((resolve) => {
    const script = document.createElement("script");
    script.src = "https://platform.twitter.com/widgets.js";
    script.async = true;
    script.charset = "utf-8";
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
  return xWidgetsPromise;
}

function normalizeXUrl(url: string, id: string) {
  const safeUrl = url || `https://x.com/i/status/${id}`;
  return safeUrl.replace(/^http:/i, "https:").replace(/^https:\/\/twitter\.com/i, "https://x.com");
}

function getTweetMedia(tweet: TweetApiData): TweetMedia[] {
  const out = new Map<string, TweetMedia>();
  const keyFor = (url: string) => {
    try {
      const u = new URL(url);
      const path = u.pathname.replace(/\.(?:jpe?g|png|webp|gif)$/i, "");
      return `${u.hostname}${path}`;
    } catch {
      return url;
    }
  };
  const add = (media: TweetMedia) => {
    if (!media.url) return;
    const key = keyFor(media.url);
    const existing = out.get(key);
    // Prefer entry with known dimensions/alt text over a bare URL duplicate.
    if (!existing || (!existing.width && media.width) || (!existing.alt && media.alt)) {
      out.set(key, { ...existing, ...media });
    }
  };
  for (const photo of tweet.photos ?? []) {
    if (photo.url) add({ url: photo.url, width: photo.width, height: photo.height, alt: photo.accessibilityLabel });
  }
  for (const media of tweet.mediaDetails ?? []) {
    if (!media.media_url_https) continue;
    add({
      url: media.media_url_https,
      width: media.original_info?.width,
      height: media.original_info?.height,
      alt: media.ext_alt_text,
    });
  }
  const videoPoster = (tweet as unknown as { video?: { poster?: string } }).video?.poster;
  if (videoPoster) add({ url: videoPoster });
  return Array.from(out.values());
}

function tweetMediaSrc(url: string): string {
  try {
    const src = new URL(url);
    if (["pbs.twimg.com", "ton.twimg.com", "video.twimg.com"].includes(src.hostname)) {
      return `/api/public/tweet-image?url=${encodeURIComponent(src.toString())}`;
    }
  } catch {
    // Fall back to the original value below.
  }
  return url;
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