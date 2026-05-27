## Where admins currently upload affiliate banners

Today there's no upload — admins paste an image URL into each board on **Admin → Forum boards** (`/admin-forum`). The fields are `affiliate_banner_url`, `affiliate_banner_link`, and `affiliate_banner_alt` on each board row, and the saved URL renders in the sidebar of `/forum/$board` and `/forum/$board/$topic` at 512×1536 (1:3).

## What I'll build

A new dedicated admin page where banners are uploaded as files (no more pasting URLs), stored centrally, and assigned to one or more forum boards.

### New page: `/admin-affiliate-banners`

- Linked from the Admin dashboard tile grid (next to Forum boards).
- Admin/management only, behind the existing admin PIN gate.
- Shows a grid of all uploaded banners with thumbnail (1:3 aspect), name, click-through link, alt text, and which boards currently use it.

For each banner:
- **Upload image** button (file picker, max 5MB, image/*). Stored in a new public Storage bucket `affiliate-banners`.
- Editable fields: display name, click-through URL, alt text.
- Soft size guidance: "Recommended 512×1536 (1:3) — image is centered and cropped to fit."
- **Assign to boards** multi-select checklist of all forum boards.
- Delete banner (removes storage file + clears any board references).

### Board editor (`/admin-forum`)

- Replace the three free-text affiliate fields with a single **"Affiliate banner"** dropdown listing banners from the library (plus "None").
- Keep backward compatibility: existing pasted URLs still display until the board is reassigned.

### Data model

Add `public.affiliate_banners` table:
- `name`, `image_url`, `link_url`, `alt_text`, `created_by`
- RLS: admin/management can do everything; authenticated can SELECT (so the board page can join and render).

Add `affiliate_banner_id uuid` column to `forum_boards` referencing the new table. The existing `affiliate_banner_url/link/alt` columns stay for now as a fallback (board page prefers the joined banner if `affiliate_banner_id` is set).

### Storage

- New public bucket `affiliate-banners`.
- Insert/update/delete restricted to admin/management via storage RLS policies; public read.

### No AI generation

Per your choice — upload only, no AI generate button.

## Technical notes

- New file: `src/routes/_authenticated/_approved/admin-affiliate-banners.tsx`.
- New migration: creates table, GRANTs, RLS, bucket, storage policies, and adds `affiliate_banner_id` to `forum_boards`.
- Edit `admin-forum.tsx`: swap the three text inputs for a banner picker dropdown.
- Edit `forum.$board.tsx` and `forum.$board.$topic.tsx`: when loading the board, also fetch the joined banner row and prefer it over the legacy URL fields.
- Add a tile link on the Admin dashboard pointing to `/admin-affiliate-banners`.
