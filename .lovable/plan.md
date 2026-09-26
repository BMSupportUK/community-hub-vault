# Public sports guide pages for AdSense review

Google's reviewer can only see the front page and login screen today, which risks a "low value content" rejection. This plan opens up the real sports guides — the content already written and published in the app — as public pages anyone (and Google) can read without signing in.

## What gets built

1. **Public guides index — `/guides`**
   - Lists every published sports guide, grouped by category, with title, sport, and date.
   - Same dark red/black look as the front page, with links back to Home, About, FAQ, Contact, Privacy Policy.

2. **Public guide pages — `/guides/$id`**
   - Shows **only the date, start time, and event name** for each listing — nothing else. No channel names, no channel info of any kind; that stays members-only.
   - Each page gets its own title, description, and social-share tags so Google indexes them individually.
   - A "Sign in to BM Support" call-to-action at the bottom turns visitors into members.

3. **Database access**
   - A new read-only rule lets visitors see **published** guides only. Drafts, and every other table, stay locked to members exactly as they are now.

4. **Discovery**
   - "Sports Guides" link added to the front page footer next to Privacy Policy.
   - `/guides` added to the sitemap so Google finds it immediately.

## What does NOT change

- The in-app sports guide screens, importer, drafts, and all member-only pages stay exactly as they are.
- No guide content is edited — this only republishes what's already marked published.

## After it's built

- Publish the site, then in AdSense press **Request review** again. Google will now find real, readable content across the front page, About, FAQ, Packages, Privacy Policy, and the full sports guide library.

## Technical notes

- New migration: `GRANT SELECT ON public.sports_blogs TO anon` + policy `for select to anon using (published)` (same shape for `sports_categories` / `sports_subcategories` so the index can group by category).
- New public server fn in `src/lib/public-guides.functions.ts` using the publishable client (no auth) returning published guides only.
- New routes `src/routes/guides.tsx` and `src/routes/guides.$id.tsx`, each with its own `head()` (title, description, og tags); guide body rendered server-side so crawlers see full HTML.
- `public/sitemap.xml` updated with `/guides`.
