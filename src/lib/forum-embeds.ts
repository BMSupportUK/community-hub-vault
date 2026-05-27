import { useEffect } from "react";

const TWEET_RE = /^https?:\/\/(?:www\.|mobile\.)?(?:twitter|x)\.com\/[A-Za-z0-9_]+\/status\/(\d+)(?:[/?#]\S*)?$/i;
const FB_RE = /^https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/[^\s<>"']+$/i;
const FB_WATCH_RE = /^https?:\/\/fb\.watch\/[A-Za-z0-9_-]+\/?(?:[?#]\S*)?$/i;

function tweetEmbed(url: string, id: string) {
  return `<blockquote class="twitter-tweet" data-tweet-id="${id}" data-lang="en"><a href="${url}"></a></blockquote>`;
}
function fbEmbed(url: string) {
  return `<div class="fb-post" data-href="${url}" data-width="500" data-show-text="true"></div>`;
}

/**
 * Walks editor HTML and replaces any standalone X / Facebook URL with the
 * platform's official embed markup. Operates on:
 *  - bare URLs that occupy an entire <p> on their own
 *  - <a> elements whose text equals the href (typical browser auto-link paste)
 */
export function embedSocialUrls(html: string): string {
  if (typeof window === "undefined" || !html) return html;
  const doc = new DOMParser().parseFromString(`<div id="__root">${html}</div>`, "text/html");
  const root = doc.getElementById("__root");
  if (!root) return html;

  const makeReplacementNodes = (markup: string) => {
    const tpl = doc.createElement("template");
    tpl.innerHTML = markup;
    return Array.from(tpl.content.childNodes);
  };

  const tryEmbedUrl = (raw: string): string | null => {
    const url = raw.trim();
    const t = url.match(TWEET_RE);
    if (t) return tweetEmbed(url.replace(/^http:/, "https:"), t[1]);
    if (FB_RE.test(url) || FB_WATCH_RE.test(url)) return fbEmbed(url.replace(/^http:/, "https:"));
    return null;
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