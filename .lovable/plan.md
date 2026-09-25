# App download & install status

Show the status of every app download link, from issue right through to the app being installed and opened on the member's device (Android phones and Amazon/Fire TV devices — both run the same Android app built from this project).

## What you'll see

On the **Download the BM Support Apps** tab, each 24-hour install link gets a status line that updates on its own:

- **Link issued** — waiting to be used
- **Downloading…** — the device is pulling the file down, with a progress percentage
- **Downloaded** — the file finished downloading (shows which device grabbed it)
- **Installed & opened** — the app has been installed and opened on the device, with the app version

The same status appears on the admin **App Transfers** page so you can see every customer's progress across all issued links.

## How it works

1. **Download tracking (already exists):** the download link already records downloading/finished, bytes sent, and the device. This surfaces it in the Download tab and admin page instead of leaving it hidden in the database.
2. **Install confirmation (new):** because the Android/Amazon app is built from this project, the app itself can phone home. The first time the app is opened on a native device after the member signs in, it quietly reports "installed" with the device model and app version. That report is matched to the member's most recent download link, flipping its status to **Installed & opened**.

## Technical details

- **Migration:** new `app_installs` table (user_id, device model, platform, app version, first_seen_at; RLS: own row read, admin/management read all; service-role write via server fn). Add `installed_at` / `install_device` columns to `app_transfers` for quick status display. GRANTs included.
- **Server fn** `reportNativeInstall` in `src/lib/app-transfer.functions.ts` (`requireSupabaseAuth`): upserts the install row and stamps the member's latest unexpired `app_transfers` row. Idempotent — repeat opens do nothing.
- **Client hook:** in the authenticated layout (`src/routes/_authenticated.tsx`), when `Capacitor.isNativePlatform()` is true, fire `reportNativeInstall` once per device (flag in localStorage so it only ever sends once per install).
- **UI:**
  - `AppTransferPanel.tsx` — status steps under each link (issued → downloading → downloaded → installed), live progress bar while downloading, device name, auto-refresh every 15s while a link is active.
  - `AppTransfersAdmin.tsx` — status column per transfer with the same states.
- APK rebuild: the install-reporting code ships in the web bundle, so it takes effect in the **next** APK release — installs of the current APK (1.1.4) will show up to "Downloaded" only. No forced update needed; reporting starts whenever members next update.

## Verification

- Bun-level check of the status mapping and server fn.
- Playwright: Download tab shows the status steps for an issued link; admin page shows the status column.
- Build must pass clean.
