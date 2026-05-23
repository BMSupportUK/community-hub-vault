## Goal
1. Add an optional "Refresh notice" field to each sports guide. When set, it renders as a highlighted notice box directly under the guide's title on the read page.
2. Auto-clear sports guide body content (excerpt + body) 24 hours after publish, while keeping the row, title, category, image, and badge intact.

## Schema changes (`sports_blogs`)
- Add `refresh_notice text NULL` — admin-editable message shown under the title.
- Add `auto_clear_at timestamptz NULL` — when set, content is wiped at this time. Defaults to `created_at + interval '24 hours'` for new rows via trigger. Admins can leave NULL to opt-out.

No RLS changes; existing `manage blogs` policy covers writes.

## Auto-clear mechanism
- Add SQL function `sports_blogs_clear_expired()` that runs:
  ```sql
  UPDATE sports_blogs
     SET excerpt = NULL, body = NULL
   WHERE auto_clear_at IS NOT NULL
     AND auto_clear_at <= now()
     AND (excerpt IS NOT NULL OR body IS NOT NULL);
  ```
- Schedule via `pg_cron` to run every 15 minutes (`*/15 * * * *`). Enable `pg_cron` if not already.
- Title, category, image, badge, and the new `refresh_notice` are preserved so the guide still appears in the list — only the article body is cleared.

## UI changes

### Admin editor (`sports-guides.new.tsx`, `sports-guides.$id.edit.tsx`)
- Add a "Refresh notice" text input (single line, optional) — placeholder e.g. "Refresh your player to load tonight's matches".
- Persist via existing insert/update flow.

### Read page (`sports-guides.read.$id.tsx`)
- Directly under the `<h1>` title, conditionally render a notice box when `refresh_notice` is set: amber/warning background, `RefreshCw` icon, the notice text.
- Component is purely presentational; no extra fetch needed.

### List page (`sports-guides.tsx`)
- No visual change required, but show a small "Updated" badge stays as-is. (Body-cleared guides will simply show empty excerpt.)

## Technical notes
- Migration order: add columns first, then backfill `auto_clear_at = created_at + interval '24 hours'` for existing rows so historical content also auto-clears on next cron tick (admins can null-out specific rows they want kept).
- Trigger on INSERT: `IF NEW.auto_clear_at IS NULL THEN NEW.auto_clear_at := NEW.created_at + interval '24 hours'; END IF;` — so the default applies but admins can override.
- After migration, regenerate Supabase types automatically (handled by the platform).

## Out of scope
- Per-category opt-in/out toggles.
- Restoring cleared content (admins re-publish manually).
- Notifications when content is cleared.
