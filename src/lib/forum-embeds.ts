import { useEffect } from "react";

const TWEET_RE = /^https?:\/\/(?:www\.|mobile\.)?(?:twitter|x)\.com\/[A-Za-z0-9_]+\/status\/(\d+)(?:[/?#]\S*)?$/i;
const FB_RE = /^https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/[^\s<>"']+$/i;
const FB_WATCH_RE = /^https?:\/\/fb\.watch\/[A-Za-z0-9_-]+\/?(?:[?#]\S*)?$/i;
const SKIP_PREVIEW_RE = /^https?:\/\/(?:www\.|m\.|mobile\.|web\.)?(?:twitter\.com|x\.com|facebook\.com|fb\.watch|youtube\.com|youtu\.be)\//i;
const HTTP_URL_RE = /https?:\/\/[^\s<>"']+/i;

/**
 * Walk processed HTML and replace any standalone link (a paragraph that
 * contains only a bare URL or a single self-text anchor) with a
 * `<div data-link-preview="URL"></div>` marker so the renderer can swap in
 * a rich preview card. Runs after social-embed conversion so X/FB/YouTube
 * URLs keep their first-class embed.
 */
export function markLinkPreviews(html: string): string {
  if (!html) return html;

  const standalone = extractStandalonePreviewUrl(html);
  if (standalone) return linkPreviewMarker(standalone);

  const hasHtml = /<[a-z][\s\S]*>/i.test(html);
  if (!hasHtml) {
    const url = firstPreviewUrlInText(html);
    return url ? `<p>${escapeHtml(html).replace(/\n/g, "<br/>")}</p>${linkPreviewMarker(url)}` : html;
  }

  return html.replace(/<(p|div)\b([^>]*)>([\s\S]*?)<\/\1>/gi, (match, tag: string, attrs: string, inner: string) => {
    if (/data-link-preview|data-tweet-embed|link-card|twitter-tweet|fb-post|video-embed/i.test(match)) return match;
    if (/(?:^|\s)class=["'][^"']*(?:mention|video-embed)[^"']*["']/i.test(match)) return match;
    if (/<(?:img|iframe|video|blockquote)\b/i.test(inner)) return match;
    if (tag.toLowerCase() === "div" && /<(?:p|div|ul|ol|li|h[1-6]|table|section|article)\b/i.test(inner)) return match;

    const blockUrl = extractStandalonePreviewUrl(inner);
    if (blockUrl) return linkPreviewMarker(blockUrl);

    const inlineUrl = firstAnchorPreviewUrl(inner) ?? firstPreviewUrlInText(htmlTextContent(inner));
    return inlineUrl ? `${match}${linkPreviewMarker(inlineUrl)}` : match;
  });
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
  const url = firstPreviewUrlInText(text);
  return url && text.replace(/[)\].,!?;:]+$/g, "") === url ? url : null;
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
function fbEmbed(url: string) {
  return `<div class="fb-post" data-href="${url}" data-width="500" data-show-text="true"></div>`;
}

function tryEmbedUrl(raw: string): string | null {
  const url = raw.trim();
  const t = url.match(TWEET_RE);
  if (t) return tweetEmbed(url.replace(/^http:/, "https:"), t[1]);
  if (FB_RE.test(url) || FB_WATCH_RE.test(url)) return fbEmbed(url.replace(/^http:/, "https:"));
  return null;
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
export function embedSocialUrls(html: string): string {
  if (!html) return html;

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

  // Important: this must work during SSR too. React may not patch a
  // dangerouslySetInnerHTML mismatch during hydration, so returning raw HTML on
  // the server and embed HTML in the browser leaves old posts visibly unembedded.
  const wholePostReplacement = tryEmbedUrl(htmlTextContent(html));
  if (wholePostReplacement) return wholePostReplacement;

  if (typeof window === "undefined") return html;
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