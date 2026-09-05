import { useEffect } from "react";

const TWEET_RE = /^https?:\/\/(?:www\.|m\.|mobile\.|web\.)?(?:twitter|x)\.com\/(?:i\/(?:web\/)?status|[A-Za-z0-9_]+\/status(?:es)?)\/(\d{1,40})(?:[/?#]\S*)?$/i;
// Facebook's public embed SDK requires an App ID + token now, so xfbml
// `.fb-post` shells render blank for most viewers. We deliberately let
// Facebook / fb.watch URLs fall through to the standard link-preview card
// instead of trying to embed them.
const SKIP_PREVIEW_RE = /^https?:\/\/(?:www\.|m\.|mobile\.|web\.)?(?:twitter\.com|x\.com|youtube\.com|youtu\.be)\//i;
const HTTP_URL_RE = /https?:\/\/[^\s<>"']+/i;
const PREPARED_FORUM_MARKER_RE = /\bdata-(?:fz-prepared|tweet-embed|link-preview)=/i;
const MAX_FORUM_SUBMIT_HTML_CHARS = 30_000;
const FORUM_TRUNCATED_NOTICE = "<p>Message shortened because the pasted content was too large.</p>";

type EmbedSocialOptions = {
  skipDomParserFallback?: boolean;
};

export function isPreparedForumPostBody(html: string): boolean {
  return PREPARED_FORUM_MARKER_RE.test(html);
}

export function normalizeForumPostInput(html: string): string {
  if (!html) return html;
  // Do not run regexes over multi-megabyte pasted/base64 HTML. That was the
  // posting freeze: the submit click spent ages scanning a giant data URL and
  // the browser only appeared to recover after the next mouse event.
  const truncated = html.length > MAX_FORUM_SUBMIT_HTML_CHARS;
  const slice = truncated ? html.slice(0, MAX_FORUM_SUBMIT_HTML_CHARS) : html;
  const withoutInlineImages = stripDataImageFragments(slice);
  return truncated ? `${withoutInlineImages}${FORUM_TRUNCATED_NOTICE}` : withoutInlineImages;
}

function stripDataImageFragments(input: string): string {
  let out = input;
  let marker = out.search(/data:image\//i);
  while (marker !== -1) {
    const imgStart = out.lastIndexOf("<img", marker);
    const tagEnd = out.indexOf(">", marker);
    if (imgStart !== -1) {
      out = tagEnd === -1 ? out.slice(0, imgStart) : `${out.slice(0, imgStart)}${out.slice(tagEnd + 1)}`;
    } else {
      const nextSpace = out.slice(marker).search(/[\s"'<>]/);
      const end = nextSpace === -1 ? out.length : marker + nextSpace;
      out = `${out.slice(0, marker)}${out.slice(end)}`;
    }
    marker = out.search(/data:image\//i);
  }
  return out;
}

/**
 * Walk processed HTML and replace any standalone link (a paragraph that
 * contains only a bare URL or a single self-text anchor) with a
 * `<div data-link-preview="URL"></div>` marker so the renderer can swap in
 * a rich preview card. Runs after social-embed conversion so X/FB/YouTube
 * URLs keep their first-class embed.
 */
export function markLinkPreviews(html: string): string {
  if (!html) return html;
  return stripPreviewedBareUrls(markLinkPreviewsInner(html));
}

function markLinkPreviewsInner(html: string): string {
  if (!html) return html;

  const standalone = extractStandalonePreviewUrl(html);
  if (standalone) return linkPreviewMarker(standalone);

  const hasHtml = /<[a-z][\s\S]*>/i.test(html);
  if (!hasHtml) {
    const videoUrl = firstVideoUrlInText(html);
    if (videoUrl) return `<p>${escapeHtml(html).replace(/\n/g, "<br/>")}</p>${tryVideoEmbedUrl(videoUrl)}`;
    const url = firstPreviewUrlInText(html);
    return url ? `<p>${escapeHtml(html).replace(/\n/g, "<br/>")}</p>${linkPreviewMarker(url)}` : html;
  }

  // A post can already contain an explicit video player followed by a normal
  // "Watch on YouTube" link. Keep the link, but never turn it into a second
  // player for the same video during the render-time legacy conversion pass.
  const embeddedVideoKeys = new Set(
    Array.from(html.matchAll(/<(?:iframe|video)\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi))
      .map((match) => videoEmbedKey(decodeBasicEntities(match[1] ?? "")))
      .filter((key): key is string => key !== null),
  );

  return html.replace(/<(p|div)\b([^>]*)>([\s\S]*?)<\/\1>/gi, (match, tag: string, attrs: string, inner: string) => {
    if (/data-link-preview|data-tweet-embed|link-card|twitter-tweet|fb-post|video-embed/i.test(match)) return match;
    if (/(?:^|\s)class=["'][^"']*(?:mention|video-embed)[^"']*["']/i.test(match)) return match;
    if (/<(?:img|iframe|video|blockquote)\b/i.test(inner)) return match;
    if (tag.toLowerCase() === "div" && /<(?:p|div|ul|ol|li|h[1-6]|table|section|article)\b/i.test(inner)) return match;

    const blockUrl = extractStandalonePreviewUrl(inner);
    if (blockUrl) return linkPreviewMarker(blockUrl);

    const anchorVideo = Array.from(inner.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi))
      .map((m) => decodeBasicEntities(m[1] ?? ""))
      .find((href) => tryVideoEmbedUrl(href));
    const videoUrl = anchorVideo ?? firstVideoUrlInText(htmlTextContent(inner));
    if (videoUrl) {
      const key = videoEmbedKey(videoUrl);
      if (key && embeddedVideoKeys.has(key)) return match;
      if (key) embeddedVideoKeys.add(key);
      return `${match}${tryVideoEmbedUrl(videoUrl)}`;
    }
    const inlineUrl = firstAnchorPreviewUrl(inner) ?? firstPreviewUrlInText(htmlTextContent(inner));
    return inlineUrl ? `${match}${linkPreviewMarker(inlineUrl)}` : match;
  });
}

/** Mid-sentence video links keep their text but gain a player underneath. */
function firstVideoUrlInText(text: string): string | null {
  for (const m of text.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    const candidate = m[0].replace(/[)\].,!?;:]+$/g, "");
    if (tryVideoEmbedUrl(candidate)) return candidate;
  }
  return null;
}

/**
 * Once a URL has a link-preview card, hide the raw URL text/anchor from the
 * post body — the card already links out, so the bare URL is just noise.
 * Also tidies up empty blocks / <br> runs left behind directly before the
 * preview marker. Runs at render time, so existing posts clean up too.
 */
function stripPreviewedBareUrls(html: string): string {
  if (!html || !/data-link-preview=/i.test(html)) return html;

  const urls = new Set<string>();
  for (const m of html.matchAll(/data-link-preview=["']([^"']+)["']/gi)) {
    urls.add(decodeBasicEntities(m[1]).replace(/\/+$/, ""));
  }
  if (urls.size === 0) return html;

  let out = html;

  // Remove self-text anchors pointing at a previewed URL.
  out = out.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (m, href: string, inner: string) => {
    const h = decodeBasicEntities(href).replace(/\/+$/, "");
    if (!urls.has(h)) return m;
    const text = htmlTextContent(inner).replace(/\/+$/, "");
    return !text || text === h ? "" : m;
  });

  // Remove bare text occurrences of previewed URLs, but only when the URL
  // stands on its own line/block (mid-sentence URLs keep their text). Not
  // matched inside attributes — those are always preceded by a quote.
  for (const url of urls) {
    for (const variant of new Set([url, url.replace(/&/g, "&amp;")])) {
      const re = new RegExp(`(^|>)\\s*${escapeRegExp(variant)}\\/?\\s*(?=<|$)`, "g");
      out = out.replace(re, "$1");
    }
  }

  // Collapse empty blocks / <br> runs left directly before the marker.
  let prev = "";
  while (prev !== out) {
    prev = out;
    out = out
      .replace(/(?:<br\s*\/?>\s*)+(<div\b[^>]*data-link-preview)/gi, "$1")
      .replace(/<(p|div)\b[^>]*>\s*(?:<br\s*\/?>\s*|&nbsp;)*<\/\1>\s*(<div\b[^>]*data-link-preview)/gi, "$2");
  }

  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function prepareForumPostBody(html: string, options: EmbedSocialOptions = {}): string {
  html = normalizeForumPostInput(html);
  if (!html) return html;
  // A prepared marker only means the post passed through an older version of
  // this pipeline. Do not return early: doing so left previously saved posts
  // as plain YouTube links after video embedding was added later.
  if (!/https?:\/\//i.test(html) && !/(?:twitter-tweet|fb-post|social-embed-x)/i.test(html)) return html;
  const looksLikeHtml = /<[a-z][\s\S]*>/i.test(html);
  if (
    looksLikeHtml
    && !/https?:\/\//i.test(htmlTextContent(html))
    && !/<a\b[^>]*href=["']https?:\/\//i.test(html)
    && !/(?:twitter-tweet|fb-post|social-embed-x)/i.test(html)
  ) return html;
  return markPrepared(markLinkPreviews(embedSocialUrls(html, options)));
}

export function markPreparedForumPostBody(html: string): string {
  return markPrepared(normalizeForumPostInput(html));
}

function markPrepared(html: string): string {
  if (!html || isPreparedForumPostBody(html)) return html;
  return `<div data-fz-prepared="1">${html}</div>`;
}

function linkPreviewMarker(url: string, title?: string | null): string {
  const titleAttr = title ? ` data-link-title="${escapeAttr(title)}"` : "";
  return `<div data-link-preview="${escapeAttr(url)}"${titleAttr}></div>`;
}

function extractStandalonePreviewUrl(fragment: string): string | null {
  if (!fragment || /data-link-preview|data-tweet-embed|link-card|twitter-tweet|fb-post|video-embed/i.test(fragment)) return null;
  if (/<(?:img|iframe|video|blockquote)\b/i.test(fragment)) return null;

  const anchors = Array.from(fragment.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>[\s\S]*?<\/a>/gi));
  if (anchors.length === 1) {
    const outside = htmlTextContent(fragment.replace(anchors[0][0], ""));
    const href = normalizePreviewUrl(decodeBasicEntities(anchors[0][1] ?? ""));
    if (!outside && href) return href;
  }
  if (anchors.length > 0) return null;

  const text = htmlTextContent(fragment);
  const raw = text.match(HTTP_URL_RE)?.[0] ?? null;
  const url = raw ? normalizePreviewUrl(raw) : null;
  return raw && url && text.replace(/[)\].,!?;:]+$/g, "") === raw.replace(/[)\].,!?;:]+$/g, "") ? url : null;
}

function firstAnchorPreviewUrl(fragment: string): string | null {
  for (const match of fragment.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
    const url = normalizePreviewUrl(decodeBasicEntities(match[1] ?? ""));
    if (url) return url;
  }
  return null;
}

function firstPreviewUrlInText(text: string): string | null {
  const raw = text.match(HTTP_URL_RE)?.[0];
  return raw ? normalizePreviewUrl(raw) : null;
}

function normalizePreviewUrl(raw: string): string | null {
  const cleaned = raw.trim().replace(/[)\].,!?;:]+$/g, "");
  try {
    const url = new URL(cleaned);
    if (!/^https?:$/i.test(url.protocol) || SKIP_PREVIEW_RE.test(url.toString())) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function escapeAttr(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

function tweetEmbed(url: string, id: string) {
  // Marker consumed by ForumPostBody; rendered by the app (no widgets.js iframe).
  return `<div data-tweet-embed="${id}" data-tweet-url="${url}"></div>`;
}

const YOUTUBE_RE = /^https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i;
const VIMEO_RE = /^https?:\/\/(?:www\.)?vimeo\.com\/(?:video\/)?(\d{6,12})/i;
const VIDEO_FILE_RE = /^https?:\/\/[^\s"'<>]+\.(mp4|webm|ogv|ogg|mov|m4v)(?:\?[^\s"'<>]*)?$/i;

function videoEmbedKey(url: string): string | null {
  const yt = url.match(YOUTUBE_RE);
  if (yt) return `youtube:${yt[1]}`;
  const vimeo = url.match(VIMEO_RE);
  if (vimeo) return `vimeo:${vimeo[1]}`;
  if (VIDEO_FILE_RE.test(url)) return `file:${url}`;
  return null;
}

function iframeVideoEmbed(src: string, title: string): string {
  return `<div class="video-embed" style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;margin:0.75rem 0;width:100%;border-radius:0.5rem;"><iframe src="${escapeAttr(src)}" title="${escapeAttr(title)}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;"></iframe></div>`;
}

function fileVideoEmbed(src: string): string {
  return `<div class="video-embed"><video src="${escapeAttr(src)}" controls playsinline preload="metadata" style="width:100%;max-width:100%;border-radius:0.5rem;margin:0.75rem 0;"></video></div>`;
}

/** Turn a plain video URL (YouTube / Vimeo / direct file) into a player embed. */
function tryVideoEmbedUrl(url: string): string | null {
  const yt = url.match(YOUTUBE_RE);
  if (yt) {
    const start = url.match(/[?&](?:t|start)=(\d+)/i)?.[1];
    const src = `https://www.youtube.com/embed/${yt[1]}${start ? `?start=${start}` : ""}`;
    return iframeVideoEmbed(src, "YouTube video");
  }
  const vimeo = url.match(VIMEO_RE);
  if (vimeo) return iframeVideoEmbed(`https://player.vimeo.com/video/${vimeo[1]}`, "Vimeo video");
  if (VIDEO_FILE_RE.test(url)) return fileVideoEmbed(url);
  return null;
}

function tryEmbedUrl(raw: string): string | null {
  const url = decodeBasicEntities(raw)
    .trim()
    .replace(/^[<\s]+|[>\s]+$/g, "")
    .replace(/[)\].,!?:;]+$/g, "");
  const t = url.match(TWEET_RE);
  if (t) return tweetEmbed(url.replace(/^http:/, "https:"), t[1]);
  return tryVideoEmbedUrl(url.replace(/^http:/, "https:"));
}

function embedStandaloneTweetBlocksSSR(html: string): string {
  return html.replace(/<(p|div|span)\b([^>]*)>([\s\S]*?)<\/\1>/gi, (match, tag: string, attrs: string, inner: string) => {
    if (/data-tweet-embed|twitter-tweet|fb-post|video-embed|data-link-preview/i.test(match)) return match;
    if (/<(?:img|iframe|video|blockquote)\b/i.test(inner)) return match;

    const anchor = inner.match(/^\s*<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>\s*$/i);
    if (anchor) {
      const text = htmlTextContent(anchor[2]);
      const href = decodeBasicEntities(anchor[1]);
      if (!text || text === href || /^https?:\/\//i.test(text)) return tryEmbedUrl(href) ?? match;
    }

    return tryEmbedUrl(htmlTextContent(inner)) ?? match;
  });
}

function decodeBasicEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function htmlTextContent(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .trim(),
  );
}

/**
 * Walks editor HTML and replaces any standalone X / Facebook URL with the
 * platform's official embed markup. Operates on:
 *  - bare URLs that occupy an entire <p> on their own
 *  - <a> elements whose text equals the href (typical browser auto-link paste)
 */
export function embedSocialUrls(html: string, options: EmbedSocialOptions = {}): string {
  if (!html) return html;

  // Editors often save pasted video URLs as anchors whose visible text is a
  // title such as "Watch this" rather than the URL itself. Convert by href,
  // not anchor text, so both newly-created and previously prepared posts work.
  html = html.replace(
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>[\s\S]*?<\/a>/gi,
    (match, href: string) => tryVideoEmbedUrl(decodeBasicEntities(href).replace(/^http:/i, "https:")) ?? match,
  );
  html = html.replace(
    /<(p|div|span)\b[^>]*>\s*(<div\b[^>]*class=["'][^"']*video-embed[^"']*["'][\s\S]*?<\/div>)\s*<\/\1>/gi,
    "$2",
  );

  // Migrate legacy embed markup (old blockquote.twitter-tweet shells, including
  // the previous social-embed-x wrapper) to the app marker so X posts
  // renders them without requiring posts to be re-saved.
  html = html.replace(
    /<div\b[^>]*class=["'][^"']*social-embed-x[^"']*["'][\s\S]*?<\/div>/gi,
    (match) => {
      const id = match.match(/data-tweet-id=["'](\d+)["']/i)?.[1];
      const url = match.match(/href=["']([^"']+)["']/i)?.[1] ?? "";
      return id ? `<div data-tweet-embed="${id}" data-tweet-url="${url}"></div>` : match;
    },
  );
  html = html.replace(
    /<blockquote\b[^>]*class=["'][^"']*twitter-tweet[^"']*["'][\s\S]*?<\/blockquote>/gi,
    (match) => {
      const id = match.match(/data-tweet-id=["'](\d+)["']/i)?.[1]
        ?? match.match(/\/status\/(\d+)/)?.[1];
      const url = match.match(/href=["'](https?:\/\/[^"']*(?:twitter|x)\.com\/[^"']+)["']/i)?.[1] ?? "";
      return id ? `<div data-tweet-embed="${id}" data-tweet-url="${url}"></div>` : match;
    },
  );

  // Migrate legacy Facebook xfbml shells (`<div class="fb-post" data-href="...">`)
  // to a link-preview marker. Meta's public embed SDK now requires an App ID
  // and access token, so these render blank for most viewers.
  html = html.replace(
    /<div\b[^>]*class=["'][^"']*fb-post[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
    (match) => {
      const url = match.match(/data-href=["']([^"']+)["']/i)?.[1];
      return url ? `<div data-link-preview="${escapeAttr(url)}"></div>` : match;
    },
  );

  // Important: this must work during SSR too. React may not patch a
  // dangerouslySetInnerHTML mismatch during hydration, so returning raw HTML on
  // the server and embed HTML in the browser leaves old posts visibly unembedded.
  const wholePostReplacement = tryEmbedUrl(htmlTextContent(html));
  if (wholePostReplacement) return wholePostReplacement;

  // Plain-text posts can contain normal text followed by an X status URL on
  // its own line. Convert those lines during SSR too, otherwise the raw URL
  // stays visible until the post is edited and re-saved.
  if (!/<[a-z][\s\S]*>/i.test(html)) {
    const lines = html.split(/\r?\n/);
    let changed = false;
    const converted = lines.map((line) => {
      const replacement = tryEmbedUrl(line.trim());
      if (!replacement) return escapeHtml(line);
      changed = true;
      return replacement;
    });
    if (changed) return converted.join("<br/>");
  }

  const htmlBlockReplacement = embedStandaloneTweetBlocksSSR(html);
  if (htmlBlockReplacement !== html) return htmlBlockReplacement;

  // Bare tweet URLs that sit directly in the HTML between block elements
  // (e.g. `<div>Hansen starts</div><br>https://x.com/.../status/123?s=20`)
  // aren't inside a <p|div|span>, so the block scanner above misses them.
  // Walk text segments between tags and convert any standalone tweet URL.
  const looksLikeHtml = /<[a-z][\s\S]*>/i.test(html);
  if (looksLikeHtml) {
    let changed = false;
    const segments = html.split(/(<[^>]+>)/g);
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (!seg || seg.startsWith("<")) continue;
      // Only convert when the URL is the entire text segment (ignoring
      // surrounding whitespace / non-breaking spaces). Mid-sentence URLs
      // keep their existing rendering.
      const trimmed = seg.replace(/&nbsp;/gi, " ").trim();
      if (!trimmed) continue;
      const replacement = tryEmbedUrl(trimmed);
      if (replacement) {
        segments[i] = replacement;
        changed = true;
      }
    }
    if (changed) return segments.join("");
  }

  if (options.skipDomParserFallback || typeof window === "undefined") return html;
  const doc = new DOMParser().parseFromString(`<div id="__root">${html}</div>`, "text/html");
  const root = doc.getElementById("__root");
  if (!root) return html;

  const makeReplacementNodes = (markup: string) => {
    const tpl = doc.createElement("template");
    tpl.innerHTML = markup;
    return Array.from(tpl.content.childNodes);
  };

  // Replace <a href="X">X</a> when nothing else is in the parent paragraph.
  root.querySelectorAll("a[href]").forEach((a) => {
    const href = a.getAttribute("href") ?? "";
    const text = (a.textContent ?? "").trim();
    if (text && text !== href) return;
    const replacement = tryEmbedUrl(href);
    if (!replacement) return;
    const parent = a.parentElement;
    // If the link sits alone in a paragraph, replace the whole paragraph.
    if (parent && parent.tagName === "P" && (parent.textContent ?? "").trim() === text) {
      parent.replaceWith(...makeReplacementNodes(replacement));
    } else {
      a.replaceWith(...makeReplacementNodes(replacement));
    }
  });

  // Replace standalone bare URLs, including pasted rich-text wrappers like
  // <span style="...">https://x.com/...?... </span> from mobile/browser shares.
  root.querySelectorAll("p, span, div").forEach((el) => {
    if (el.id === "__root") return;
    if (el.querySelector("a, img, iframe, video, blockquote, .twitter-tweet, .fb-post")) return;
    const text = (el.textContent ?? "").trim();
    const replacement = tryEmbedUrl(text);
    if (!replacement) return;
    let target: Element = el;
    while (target.parentElement && target.parentElement !== root && (target.parentElement.textContent ?? "").trim() === text) {
      target = target.parentElement;
    }
    target.replaceWith(...makeReplacementNodes(replacement));
  });

  const rootText = root.textContent?.trim() ?? "";
  if (root.children.length === 0 && rootText) {
    const replacement = tryEmbedUrl(rootText);
    if (replacement) root.replaceChildren(...makeReplacementNodes(replacement));
  }

  return root.innerHTML;
}

// --- runtime loaders for social embed scripts -------------------------------

let twitterPromise: Promise<void> | null = null;
function loadTwitter(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as unknown as { twttr?: { widgets: { load: (el?: Element) => void } } }).twttr) {
    return Promise.resolve();
  }
  if (twitterPromise) return twitterPromise;
  twitterPromise = new Promise<void>((resolve) => {
    const s = document.createElement("script");
    s.src = "https://platform.twitter.com/widgets.js";
    s.async = true;
    s.charset = "utf-8";
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
  return twitterPromise;
}

let fbPromise: Promise<void> | null = null;
function loadFacebook(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const w = window as unknown as { FB?: { XFBML: { parse: (el?: Element) => void } } };
  if (w.FB) return Promise.resolve();
  if (fbPromise) return fbPromise;
  // Required FB root div
  if (!document.getElementById("fb-root")) {
    const r = document.createElement("div");
    r.id = "fb-root";
    document.body.appendChild(r);
  }
  fbPromise = new Promise<void>((resolve) => {
    const s = document.createElement("script");
    s.src = "https://connect.facebook.net/en_US/sdk.js#xfbml=1&version=v19.0";
    s.async = true;
    s.defer = true;
    s.crossOrigin = "anonymous";
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
  return fbPromise;
}

/** Hook: scans the given container for X / FB embed shells and hydrates them. */
export function useLoadSocialEmbeds(ref: React.RefObject<HTMLElement | null>, deps: unknown[] = []) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const hasTweet = !!el.querySelector(".twitter-tweet");
    const hasFb = !!el.querySelector(".fb-post");
    if (hasTweet) {
      void loadTwitter().then(() => {
        const w = window as unknown as { twttr?: { widgets: { load: (el?: Element) => void } } };
        w.twttr?.widgets.load(el);
        window.setTimeout(() => {
          el.querySelectorAll<HTMLElement>(".social-embed-x").forEach((embed) => {
            const iframe = embed.querySelector("iframe");
            const fallback = embed.querySelector<HTMLElement>(".social-embed-fallback");
            if (!iframe) fallback?.classList.add("is-visible");
          });
        }, 2500);
      });
    }
    if (hasFb) {
      void loadFacebook().then(() => {
        const w = window as unknown as { FB?: { XFBML: { parse: (el?: Element) => void } } };
        w.FB?.XFBML.parse(el);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}