# Backup install methods when Downloader is unavailable

## Goal
Give members alternative ways to install the BM Support APK when the Downloader app is down or unavailable on their Amazon Fire Stick / Android TV / Android device, without changing the existing secure-token flow.

## Current state
- Members request a 24-hour transfer token from Install Guides → "Get the App".
- The panel shows a short URL (`bmsupport.uk/a/<TOKEN>`) and QR code intended for the Downloader app.
- The download endpoint streams the APK only against a live token.
- There is no fallback guidance in the UI if Downloader fails.

## Proposed changes

### 1. Add a "Downloader not working?" section to `AppTransferPanel`
- Collapsible/disclosure UI below the main transfer card, shown only when a live transfer exists.
- Lists 3–4 practical backup methods tailored to Fire TV / Android TV / Android phones.
- Each method includes concise step-by-step instructions and any links/codes the member needs.

### 2. Backup methods to include
1. **Browser download on the device**
   - Open the device's own browser (Silk on Fire TV, Chrome/Edge on Android TV, any phone browser).
   - Type the same short URL; the download starts automatically.
   - Open the downloaded APK from the notification/downloads folder.

2. **Send Files to TV (SFTV)**
   - Install SFTV on the TV/phone from the relevant app store.
   - Download the APK to a phone first using the short URL / QR code.
   - Send the file wirelessly to the TV and open it.

3. **Cloud storage + file manager**
   - Download the APK to a phone/PC using the short URL.
   - Upload it to Google Drive / Dropbox / OneDrive.
   - On the TV open a file manager with cloud support (X-plore, FX, File Commander) and install from there.

4. **USB sideload (Fire TV / Android TV)**
   - Download the APK to a PC using the short URL.
   - Copy it to a USB stick, plug into the device, and use a file manager to install.

### 3. Admin controls
- Add a toggle in `AppBuildAdmin` to enable/disable the backup-methods section.
- Store the flag on `app_builds` (e.g. `show_backup_methods` boolean, default true).
- `getCurrentAppBuild` returns the flag so `AppTransferPanel` can conditionally render it.

### 4. UX polish
- Keep the primary short URL and QR code unchanged so Downloader still works when available.
- Use a neutral/helpful tone (no blame on Downloader).
- Make the section responsive and collapsible so it doesn't clutter the panel.

## Files to change
- `src/components/app/AppTransferPanel.tsx` — add backup methods UI.
- `src/components/app/AppBuildAdmin.tsx` — add toggle and update `saveAppBuild`/`updateAppBuild` calls.
- `src/lib/app-transfer.functions.ts` — expose `show_backup_methods` in `getCurrentAppBuild`; update admin mutations.
- Database migration — add `show_backup_methods boolean default true` to `public.app_builds` with GRANT.

## Out of scope
- Replacing the secure token mechanism.
- Adding new download endpoints; the existing `/api/public/a/:token` endpoint already works in browsers and file managers.
- Building a dedicated TV installer app.
