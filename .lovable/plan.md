## Goal
Upgrade Boro Fan Zone forum posting from plain text to a proper rich HTML editor (like big-forum software), and auto-embed any X (Twitter) or Facebook post URL someone drops in.

## Scope
Only the forum surface (`forum.$board.tsx` new-topic dialog, `forum.$board.$topic.tsx` reply + edit). Boards data model is unchanged; we change how a post `body` is composed, stored, and rendered.

## 1. Rich editor for posts

Reuse the existing `src/components/ui/html-editor.tsx` (already used for the Knowledge Base / Sports Guides). It already supports: bold/italic/underline, H1/H2, quote, code, bullet/numbered lists, links, YouTube embed, horizontal rule, undo/redo, clear formatting.

Where it replaces today's `<Textarea>`:
- **New topic dialog** in `forum.$board.tsx` — body field.
- **Reply composer** at the bottom of `forum.$board.$topic.tsx`.
- **Inline edit** of a post in `forum.$board.$topic.tsx`.

Posts will now be stored as HTML strings in `forum_posts.body` (same column, same length — no migration required; we currently treat it as text). Rendering switches from the custom `PostBody` plain-text quote parser to a sanitized HTML render using `sanitizeRichHtml` (already in `src/lib/sanitize-html.ts`).

Quote button behaviour: instead of inserting `> ` lines, it inserts a real `<blockquote>` with an attribution line containing the original author's name and a link back to the post anchor. The "quoted" pill rendering is provided naturally by the editor's blockquote styling + sanitizer.

## 2. Auto-embed X (Twitter) and Facebook URLs

When a post is submitted (new topic, reply, or edit), pre-process the HTML on the client:
- Find any standalone link or bare URL matching:
  - X / Twitter: `https://(x|twitter).com/<user>/status/<id>` (and `mobile.` / `www.`)
  - Facebook: `https://(www\.)?facebook\.com/.+/(posts|videos|photos)/...` and `https://fb.watch/<id>`
- Replace them with the platform's official embed markup:
  - X → `<blockquote class="twitter-tweet"><a href="<url>"></a></blockquote>`
  - Facebook → `<div class="fb-post" data-href="<url>" data-width="500"></div>`
- Save the resulting HTML.

Then add a small `SocialEmbeds` runtime helper:
- On any rendered post page, if the rendered HTML contains a `.twitter-tweet` node, lazy-load `https://platform.twitter.com/widgets.js` once and call `window.twttr.widgets.load(container)`.
- If it contains `.fb-post`, lazy-load Facebook SDK `https://connect.facebook.net/en_US/sdk.js` (xfbml=1) and call `FB.XFBML.parse(container)`.
- Re-run on mount and whenever posts change (already re-rendered by the realtime subscription).

`src/lib/sanitize-html.ts` is extended to allow the embed shells:
- Keep iframe allow-list (already covers YouTube).
- Add `blockquote.class="twitter-tweet"`, `div.class="fb-post"`, `data-href`, `data-width`, `data-tweet-id` to the allow-list.
- X and FB will themselves swap the placeholder nodes for iframes pointing at their own domains, which are not subject to our iframe host check because those iframes are injected by their scripts after sanitization.

## 3. Behaviour around the quote and edit-history features

- `quotePost` builds an HTML blockquote attributed to the author and inserts it at the end of the current editor value.
- Edit history (`forum_post_edits`) keeps storing the previous `body` HTML; the history dialog will render with `sanitizeRichHtml` so older plain-text posts still display unchanged.
- Old posts already saved as plain text continue to render correctly because sanitized rendering of plain text is just the text wrapped in a `<p>` — we'll detect "looks like plain text" (no `<` in body) and fall back to a `whitespace-pre-wrap` `<div>` so legacy `>` quote lines still look like quotes.

## Technical details

Files changed:
- `src/lib/sanitize-html.ts` — allow `class`, `data-href`, `data-width`, `data-tweet-id`, `data-lang` on `blockquote`/`div`; ensure scripts stay forbidden.
- `src/lib/forum-embeds.ts` *(new)* — `embedSocialUrls(html: string): string` and `useLoadSocialEmbeds(ref)` hook that injects `widgets.js` / Facebook SDK once and parses the container.
- `src/components/app/ForumPostBody.tsx` *(new)* — renders sanitized HTML (or legacy plain-text fallback) and runs `useLoadSocialEmbeds`.
- `src/routes/_authenticated/_approved/forum.$board.tsx` — swap new-topic body `<Textarea>` for `<HtmlEditor>`; run `embedSocialUrls` before insert.
- `src/routes/_authenticated/_approved/forum.$board.$topic.tsx` — swap reply + edit `<Textarea>` for `<HtmlEditor>`; replace `PostBody` with `ForumPostBody`; update `quotePost` to insert an HTML blockquote; run `embedSocialUrls` on submit/save; render edit history with `ForumPostBody` too.

No database migration needed. No new dependencies — `dompurify` and `HtmlEditor` already exist.

## Out of scope
- Server-side oEmbed fetching (no API keys, no server fn). We rely on X's and Facebook's official client embed scripts, which is what most forums use.
- BBCode parity.
- Image uploads inside posts (the editor's video upload stays available; image-paste is not added).
