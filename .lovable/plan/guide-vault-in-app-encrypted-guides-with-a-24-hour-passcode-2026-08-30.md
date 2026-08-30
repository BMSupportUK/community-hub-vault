# Guide Vault — in-app encrypted guides with a 24-hour passcode

Guides stop being public links. Admins upload the file inside the app, it is stored encrypted, and a customer must request a passcode (valid 24 hours) to unlock, read, and download it.

## How it works for the customer

1. On the Install Guides page each guide shows a lock badge and a **Request passcode** button.
2. Clicking it generates a 6-character passcode for that customer, valid for 24 hours, shown on screen and sent as an in-app notification (so it survives a page refresh).
3. The customer types the passcode into the unlock box on the guide.
4. Once unlocked they can read the guide in the in-app viewer and download the file. The unlock lasts until the passcode expires; after 24 hours they request a new one.
5. Access stays as it is today — any signed-in approved user can request a passcode. No new role restrictions.

## How it works for admins

- The guide editor gets a **Guide file** upload field (PDF or image) replacing the pasted URL. Existing pasted URLs keep working for old guides.
- Uploaded files go into a private storage bucket that browsers cannot read directly — the file is only ever served through the app after a valid passcode.
- Admin view of a guide never needs a passcode.
- A small admin panel lists active passcodes per guide (who, issued, expires) with the option to revoke one.

## Technical design

### Storage
- New private bucket `guide-files` (no public access). RLS on `storage.objects` allows admin/management upload and delete; no direct read for `authenticated` — reads happen server-side with the service role.
- Files are additionally encrypted at rest with the existing `private.app_encrypt` / `app_decrypt` pattern only if the user wants belt-and-braces; default plan is private bucket + server-mediated access, which already prevents URL sharing.

### Schema (migration)
- `public.install_blogs`: add `file_path text` (bucket object path), `file_mime text`, `file_size int`, keep `pdf_url` for legacy rows.
- New `public.guide_passcodes`: `id`, `blog_id` → `install_blogs`, `user_id`, `code_hash text`, `issued_at`, `expires_at`, `revoked_at`, timestamps. Unique partial index on active (blog_id, user_id).
  - GRANTs: `SELECT` to `authenticated` (own rows only via policy), `ALL` to `service_role`.
  - RLS: users read their own rows; admin/management read and revoke all. Inserts happen only through the server function (service role) so codes cannot be forged.
- Codes are stored hashed (SHA-256 of `user_id:code`), reusing the pattern in `src/lib/screen-lock-hash.ts` — never stored in plain text.

### Server functions (`src/lib/guide-vault.functions.ts`)
All use `requireSupabaseAuth`:
- `requestGuidePasscode({ blogId })` — revokes any existing active code, generates a new one, stores the hash with `expires_at = now() + 24h`, writes a user notification, returns the plain code once.
- `unlockGuide({ blogId, code })` — verifies hash + expiry, returns a short-lived (5 min) signed URL for the object plus the guide body. Wrong or expired code returns a generic failure.
- `getMyGuideAccess()` — returns which guides the caller currently has an unexpired unlock for, so the UI can show unlocked state after a refresh.
- `revokeGuidePasscode({ id })` — admin/management only.
- Admin upload uses a server function that returns a signed upload URL for the private bucket, then records `file_path` on the guide.

### UI (`src/routes/_authenticated/_approved/install-guides.tsx`)
- Guide card: locked state (lock icon, Request passcode, passcode entry) vs unlocked state (Read / Download).
- Reader dialog loads the signed URL only after unlock; the existing PDF iframe and rich-text body rendering are reused.
- Keep the existing copy-password button behaviour for legacy guides whose password lives in the excerpt, until those guides are migrated.
- Admin editor: file upload with progress, current file name, and replace/remove.

### Housekeeping
- Expired passcodes cleaned up by the existing scheduled-reminders cron (delete rows past `expires_at + 7 days`).

## Out of scope
- No changes to sports guides or their parser.
- No per-guide pricing, no email delivery of files.
