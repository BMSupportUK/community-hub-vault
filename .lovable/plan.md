# Rebuild Install Guides around BM TV Enabler, with a download log

## What customers will see
The page opens with one question: **"What are you setting up?"**

```text
[ Amazon Fire TV ]  [ Android / Google TV ]  [ Windows PC ]  [ iPhone / iPad ]
```

- **Fire TV / Android TV / Google TV** — a step-by-step setup (same one-step-at-a-time style with progress bar used on Remote setup):
  1. Get BM TV Enabler (phone QR + Windows download side by side, with the Enabler access-PIN note)
  2. Switch on TV debugging (device-specific: ADB debugging for Fire TV; Android TV OS build 7 times + Network/Wireless debugging for Android/Google TV)
  3. Run "Install apps" in the Enabler — it installs the BM apps for you and skips ones already there
  4. Done — shows that device's guides (videos/PDFs)
  
  Underneath, a collapsed **"Can't use the Enabler? Download the apps instead"** section keeps the existing secured download cards (request link, QR, expiry) as the backup.
- **Windows PC** — Windows Enabler download plus its guides.
- **iPhone / iPad** — exactly the current setup and page content they have today (App Store information pop-ups, current Download BM Support Apps tab and guides). No Enabler is offered, since it can't run on iOS.

The Guides library, Welcome picture and the staff/admin tabs (Categories, Transfers, App APK, Approvals) stay as they are, just moved behind the new device picker. Subscriber access checks and the demo-account lock stay unchanged.

## Download log (admin and management only)
Every app download is recorded, whatever route it came through:
- BM TV Enabler phone and Windows downloads
- Apps the Enabler installs on a TV
- BM Remote Helper downloads
- Secured download links from Install Guides / App Transfers

Each entry shows: customer (when known), app, version, how it was downloaded, device/browser, IP address and time. A new **Download log** tab on Install Guides (admin + management only) lists them newest first with filters for app and route, and a search by customer.

Enabler downloads come from the TV/phone without a website sign-in, so they're linked to a customer only when the app sends its Enabler login. The current apps don't do this yet, so those entries show device and IP only until the next app release (phone 1.45 / Windows 1.33), which will send it.

## Technical details
- New `app_download_log` table (build_id, app_name, version, source enum: enabler_phone, enabler_windows, tv_install, remote_helper, transfer_link, android_apk; user_id nullable, ip, user_agent, device, bytes, created_at). RLS: SELECT for admin/management via `has_role`; inserts only via server (service role). Grants per schema rules.
- Insert a log row in each public download route: `tv-enabler-apk`, `tv-enabler-windows`, `remote-helper-apk`, `tv-install-apk.$id`, `android-apk`, `a/$token` (only on counted downloads, not range retries). Logging never blocks the download.
- Enabler requests: optional `x-enabler-token` header resolves to the customer via the existing hashed device token; apps updated in both phone and Windows together.
- Rewrite `install-guides.tsx` into smaller components (device picker, device setup wizard reusing `RemoteSetupWizard`, iOS view reusing current panels, download log admin tab); remembered device choice in session storage.
- Server function `listDownloadLog` with admin/management check; bun tests for the source mapping and the admin-only read.
