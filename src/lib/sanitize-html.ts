import DOMPurify from "dompurify";

// Restrict iframe sources to trusted video providers.
const ALLOWED_IFRAME_HOSTS = [
  "www.youtube.com",
  "youtube.com",
  "www.youtube-nocookie.com",
  "youtube-nocookie.com",
  "player.vimeo.com",
];

let hookInstalled = false;
function ensureHook() {
  if (hookInstalled || typeof window === "undefined") return;
  DOMPurify.addHook("uponSanitizeElement", (node, data) => {
    if (data.tagName !== "iframe") return;
    const el = node as Element;
    const src = el.getAttribute("src") ?? "";
    try {
      const u = new URL(src, window.location.origin);
      if (!ALLOWED_IFRAME_HOSTS.includes(u.hostname)) {
        el.parentNode?.removeChild(el);
      }
    } catch {
      el.parentNode?.removeChild(el);
    }
  });
  hookInstalled = true;
}

const DATA_IMAGE_ATTR_RE = /<img\b([^>]*?)\bsrc=["']data:image\/[^"']+["']([^>]*)>/gi;
const MAX_RICH_HTML_CHARS = 120_000;

function stripInlineDataImages(html: string): string {
  return html.replace(DATA_IMAGE_ATTR_RE, (_match, before: string, after: string) => `<img${before}${after}>`);
}

// Allow safe inline HTML produced by our editor, including YouTube embeds.
export function sanitizeRichHtml(html: string): string {
  ensureHook();
  const safeInput = stripInlineDataImages(html.length > MAX_RICH_HTML_CHARS ? `${html.slice(0, MAX_RICH_HTML_CHARS)}<p>Message shortened because the pasted content was too large.</p>` : html);
  return DOMPurify.sanitize(safeInput, {
    ADD_TAGS: ["iframe", "video", "source"],
    ADD_ATTR: [
      "allow",
      "allowfullscreen",
      "frameborder",
      "scrolling",
      "src",
      "title",
      "referrerpolicy",
      "loading",
      "style",
      "controls",
      "playsinline",
      "poster",
      "preload",
      "muted",
      "loop",
      "type",
      "class",
      "data-href",
      "data-width",
      "data-tweet-id",
      "data-tweet-embed",
      "data-tweet-url",
      "data-link-preview",
      "data-link-title",
      "data-lang",
      "data-show-text",
      "data-mention-type",
      "data-mention-id",
      "data-mention-key",
      "lang",
      "dir",
    ],
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto|tel|ftp):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  });
}