# Secure APK transfer with 24-hour links

Admins upload the BM Support APK inside the app. A member requests a transfer, gets a short code and a short URL to type into the Downloader app on a Fire Stick (or scan a QR code on Android), and that link dies after 24 hours — or the moment they delete it.

## How it works for the member

1. New **Get the App** panel (on the Install Guides page, alongside the Guide Vault).
2. Shows the current APK: version name, file size, release notes.
3. **Request transfer** button issues a personal transfer:
   - A 6-character code and a short URL, e.g. `bmsupport.uk/a/AB3K9F`, with a copy button.
   - A QR code for phones/tablets, plus a direct **Download to this device** button.
   - A live 24-hour countdown, same styling as the guide access code box.
4. On a Fire Stick the user opens Downloader, types the short URL, and the APK downloads and installs.
5. **Delete transfer** button removes the transfer immediately — the link stops working and the row is deleted, so no record is kept. Expired transfers are auto-deleted by the existing scheduled cron, again leaving no record.
6. One live transfer per member at a time; requesting again replaces the old one.

## How it works for admins

- Single current APK slot in the admin area: upload/replace the `.apk`, set version name and release notes, toggle availability.
- Files go to a new private storage bucket — no public URL, so a link can never be shared beyond its 24 hours.
- Admin panel lists active transfers (who, issued, expires) with a delete action.

## Technical design

### Storage
- New private bucket `app-builds`. RLS on `storage.objects`: insert/update/delete for admin/management only, no read for `authenticated` (all reads go through the server with the service role).

### Schema (one migration)
- `public.app_builds`: `id`, `file_path`, `file_name`, `file_size`, `version_name`, `release_notes`, `is_current bool`, timestamps. GRANT `SELECT` to `authenticated` (metadata only, no path exposure via a view-safe select list), `ALL` to `service_role`. RLS: approved members read the current build's metadata; admin/management write.
- `public.app_transfers`: `id`, `user_id`, `build_id`, `token text unique` (short, URL-safe, case-insensitive), `issued_at`, `expires_at`, `download_count`, `last_download_at`. GRANT `SELECT, DELETE` to `authenticated` (own rows only), `ALL` to `service_role`. Inserts happen only through the server function so tokens cannot be forged.
- Hard delete on user request and on cron cleanup — nothing is retained.

### Server functions (`src/lib/app-transfer.functions.ts`, all `requireSupabaseAuth`)
- `getCurrentBuild()` — version, size, notes for the current build.
- `requestAppTransfer()` — deletes any existing transfer for the caller, mints a token (`crypto.randomInt` over an unambiguous alphabet), stores it with `expires_at = now() + 24h`, returns the code, short URL and expiry.
- `getMyAppTransfer()` — returns the caller's live transfer so the panel survives a refresh.
- `deleteAppTransfer()` — hard-deletes the caller's transfer.
- Admin: `upsertAppBuild()` (signed upload URL + metadata) and `listAppTransfers()` / `deleteAppTransferAdmin()`.

### Public download route (`src/routes/api/public/a/$token.ts`)
- Downloader on Fire OS is not signed in, so the token itself is the credential: looked up server-side, checked for expiry, then the APK is streamed back with `Content-Type: application/vnd.android.package-archive` and a `Content-Disposition` filename.
- Unknown, deleted or expired token → plain `404`, revealing nothing.
- Increments `download_count`; rate-limited per token to blunt guessing, and tokens are long enough to be unguessable.
- A short `/a/$token` alias route redirects to the API route so the URL stays typeable on a TV remote.

### UI
- `src/components/app/AppTransferPanel.tsx` — request/copy/QR/countdown/delete states, matching the existing Guide Vault visual language.
- QR rendered client-side with a small QR library.
- Admin build management added to the existing admin dashboard section that holds the guide tooling.

### Housekeeping
- `scheduled-reminders` cron deletes transfers past `expires_at`.

## Notes
- No app can force an install onto a Fire Stick or phone; the device must pull the file. Downloader + short code is the standard, reliable route and is what this builds.
- APKs served this way are sideloads: Android will ask the user to allow installs from that source.
